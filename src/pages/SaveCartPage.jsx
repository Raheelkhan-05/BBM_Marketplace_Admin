// src/pages/SaveCartPage.jsx — buyer cart in the Save (sh-) UI.
// Same data/actions as before: fetchCart / updateCartItem / removeFromCart / checkoutCart,
// order constraints, per-seller transport preference (+ proposals, socket + polling), debounced qty writes.
//
// NEW: SELECTIVE CHECKOUT. Every cart line has a checkbox (all selected by default). Only the selected
// lines are priced in the total, validated (stock / delivery / transport) and sent to checkout.
// Unselected lines stay in the cart. Selection is tracked as a "deselected" set so newly loaded items
// are selected automatically.
// NEW: "Explore more products" button -> /home.
//
// PAYMENT: checkout creates the order group, then the buyer is sent to JioPay's hosted checkout
// (utils/paymentsApi.js) and returns via /payment/return. If starting the payment fails, tapping
// the button again retries.
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Trash2, Loader2, ShoppingCart, MapPin, Minus, Plus, Clock, Truck, AlertCircle, X, ArrowRight, Compass } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchCart, updateCartItem, removeFromCart, checkoutCart } from "../utils/cartApi.js";
import { startGroupPayment, redirectToGateway } from "../utils/paymentsApi.js";
import { fetchOrderConstraints } from "../utils/api.js";
import { fetchBuyerTransportPreference } from "../utils/api.transport.js";
import { useOrderResume } from "../context/OrderResumeContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import AddressBook from "../components/shipping/AddressBook.jsx";
import TransportPreferenceModal from "../components/transport/TransportPreferenceModal.jsx";
import { BuyerAddressProvider, useBuyerAddress } from "../context/BuyerAddressContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import { purchaseQtyToSaleUnitQty, saleUnitQtyToBaseUnits, saleUnitLabel, round2 } from "../shared/packUnits.js";
import { checkOrderWindow, checkLocationServiceable } from "../shared/orderConstraints.js";
import { routeTransportModeLabel } from "../../shared/routeTransportFields.js";
import "../components/save/save-cart.css";

const EXPLORE_ROUTE = "/home";

/* ---------------- pricing helpers (unchanged) ---------------- */
function resolveSlabUnitPrice(slabs, saleQty, fallbackPrice) {
    if (!Array.isArray(slabs) || !slabs.length) return fallbackPrice;
    const applicable = slabs
        .filter((s) => Number(s.minQty) > 0 && saleQty >= Number(s.minQty) && (!s.maxQty || saleQty <= Number(s.maxQty)))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].price) : fallbackPrice;
}
function resolveDiscountPercent(tiers, saleQty) {
    if (!Array.isArray(tiers) || !tiers.length) return 0;
    const applicable = tiers
        .filter((d) => Number(d.minQty) > 0 && saleQty >= Number(d.minQty))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].discountPercent) || 0 : 0;
}
// item.price is ALREADY per sale unit (Pack, or Master Pack when this listing hasOuterPack) — never re-multiply by pack_size.
function priceFor(item) {
    const saleQty = purchaseQtyToSaleUnitQty(item.quantity, item.purchase_basis, item.pack_size, item.units_per_master_pack);
    const basePricePerSaleUnit = resolveSlabUnitPrice(item.price_slabs, saleQty, Number(item.price));
    const discountPercent = resolveDiscountPercent(item.quantity_discounts, saleQty);
    const unitPrice = round2(basePricePerSaleUnit * (1 - discountPercent / 100));
    const moqSaleUnits = Number(item.moq) || 0;
    const meetsMoq = moqSaleUnits ? saleQty >= moqSaleUnits : true;
    return { saleQty, lineTotal: round2(unitPrice * saleQty), discountPercent, meetsMoq, moqSaleUnits, unitPrice, basePricePerSaleUnit };
}
function saleUnitLabelFor(item) { return saleUnitLabel(item.units_per_master_pack); }
function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

function stockInfoFor(item) {
    const capped = item.stock_type === "ready_stock" && item.available_stock != null;
    const max = capped ? Number(item.available_stock) : null;
    const moq = Number(item.moq) || 0;
    return {
        capped, max,
        outOfStock: capped && (moq > 0 ? max < moq : max <= 0),
        exceeds: capped && Number(item.quantity) > max,
    };
}

function sellerObjFor(group) {
    const first = group.items[0];
    const city = first.seller_dispatch_city || "";
    const state = first.seller_dispatch_state || "";
    return {
        sellerId: group.seller.seller_id,
        display_name: group.seller.seller_name,
        dispatchOrigin: city && state ? `${city}, ${state}` : city || state || "",
        dispatchState: state,
        transportOptions: first.seller_transport_options || [],
    };
}

const getLenis = () => (typeof window !== "undefined" ? window.lenis || window.__lenis || null : null);
const stopEvent = (e) => e.stopPropagation();

// The Save routes may not be mounted under <OrderResumeProvider> (the old app layout was).
// useOrderResume throws without it, so fall back to stable no-ops: this page still tracks
// transport approvals itself (socket + polling); only the cross-page "resume" banner is skipped.
const NOOP = () => { };
const NOOP_RESUME = { registerActive: NOOP, unregisterActive: NOOP, reportApproved: NOOP, reportRejected: NOOP };
function useOrderResumeSafe() {
    try { return useOrderResume() || NOOP_RESUME; } catch { return NOOP_RESUME; }
}

/* ---------------- small UI pieces ---------------- */
function Notice({ tone = "warn", icon: Icon = AlertCircle, title, children }) {
    return (
        <div className={`sh-nt ${tone}`} role={tone === "danger" ? "alert" : undefined}>
            <Icon size={16} />
            <div>{title && <b>{title}</b>}<span>{children}</span></div>
        </div>
    );
}

function QtyStepper({ value, onChange, min, disabled, maxed }) {
    const atMin = Number(value) <= Number(min);
    return (
        <div className="sh-qs">
            <button type="button" aria-label="Decrease quantity" disabled={disabled || atMin} onClick={() => onChange(Number(value) - 1)}><Minus size={16} /></button>
            <span>{value}</span>
            <button type="button" aria-label="Increase quantity" disabled={disabled || maxed} onClick={() => onChange(Number(value) + 1)}><Plus size={16} /></button>
        </div>
    );
}

// Checkbox with an optional text label and tri-state (indeterminate) support.
function Check({ checked, indeterminate = false, onChange, disabled, label, children }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
    }, [indeterminate, checked]);
    return (
        <label className="sh-pick">
            <input ref={ref} type="checkbox" checked={checked} disabled={disabled} aria-label={label}
                onChange={(e) => onChange(e.target.checked)} />
            {children && <span>{children}</span>}
        </label>
    );
}

/* ---------------- item detail modal ---------------- */
function CartItemDetailModal({ item, onClose }) {
    const closeRef = useRef();
    closeRef.current = onClose;

    useEffect(() => { // lock page scroll (native + Lenis)
        const root = document.documentElement;
        const sw = window.innerWidth - root.clientWidth;
        const { style } = document.body;
        const prevO = style.overflow, prevP = style.paddingRight, prevR = root.style.overflow;
        style.overflow = "hidden"; root.style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        try { getLenis()?.stop?.(); } catch { /* ignore */ }
        return () => {
            style.overflow = prevO; style.paddingRight = prevP; root.style.overflow = prevR;
            try { getLenis()?.start?.(); } catch { /* ignore */ }
        };
    }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    const p = priceFor(item);
    const saleUnit = saleUnitLabelFor(item);
    const hasPack = Number(item.pack_size) > 0;
    const hasTerms = item.delivery_timeline || item.payment_terms || item.return_policy || item.warranty || item.freight_included != null || item.dispatch_origin;
    const terms = [
        ["Delivery", item.delivery_timeline], ["Payment", item.payment_terms], ["Returns", item.return_policy],
        ["Warranty", item.warranty], ["Ships from", item.dispatch_origin],
        ["Freight", item.freight_included != null ? (item.freight_included ? "Included in price" : "Extra, paid by buyer") : null],
    ].filter(([, v]) => v);

    return createPortal(
        <div className="sv sh-portal">
            <div className="sh-ov" data-lenis-prevent onWheel={stopEvent} onTouchMove={stopEvent}
                onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current?.(); }}>
                <div className="sh-wz fit" role="dialog" aria-modal="true" aria-label={`Details of ${item.product_name}`}>
                    <div className="sh-wh">
                        <h2>{item.product_name}</h2>
                        <p>Price breakdown and seller terms</p>
                        <button type="button" className="sh-ib" aria-label="Close" onClick={() => closeRef.current?.()}><X size={18} /></button>
                    </div>
                    <div className="sh-wb" data-lenis-prevent>
                        <h3 className="sh-sch">Price breakdown</h3>
                        <div className="sh-brk">
                            <div>
                                <span>Quantity</span>
                                <b>
                                    {p.saleQty} {saleUnit}{p.saleQty === 1 ? "" : "s"}
                                    {hasPack && ` · ${saleUnitQtyToBaseUnits(p.saleQty, item.pack_size, item.units_per_master_pack)} ${item.unit}`}
                                </b>
                            </div>
                            <div><span>Rate applied</span><b>₹{inr(p.basePricePerSaleUnit)} / {saleUnit}</b></div>
                            {hasPack && (
                                <div><span>Per {item.unit}</span><b>≈ ₹{inr(p.basePricePerSaleUnit / saleUnitQtyToBaseUnits(1, item.pack_size, item.units_per_master_pack))}</b></div>
                            )}
                            <div><span>Subtotal</span><b>₹{inr(p.basePricePerSaleUnit * p.saleQty)}</b></div>
                            {p.discountPercent > 0 && (
                                <div><span>Discount ({p.discountPercent}% off)</span><b style={{ color: "var(--gt)" }}>− ₹{inr(p.basePricePerSaleUnit * p.saleQty - p.lineTotal)}</b></div>
                            )}
                            <div className="sh-brt"><span>Total payable</span><b>₹{inr(p.lineTotal)}</b></div>
                        </div>

                        {Array.isArray(item.price_slabs) && item.price_slabs.length > 0 && (
                            <div className="sh-chips">
                                {item.price_slabs.map((slab, i) => (
                                    <span key={i} className="sh-chip">
                                        {slab.minQty}{slab.maxQty ? `–${slab.maxQty}` : "+"} {saleUnit}{Number(slab.maxQty || slab.minQty) === 1 ? "" : "s"}: ₹{inr(slab.price)}
                                    </span>
                                ))}
                            </div>
                        )}
                        {Array.isArray(item.quantity_discounts) && item.quantity_discounts.length > 0 && (
                            <div className="sh-chips">
                                {item.quantity_discounts.map((tier, i) => (
                                    <span key={i} className="sh-chip ok">
                                        {tier.minQty}+ {saleUnit}{Number(tier.minQty) === 1 ? "" : "s"}: {tier.discountPercent}% off
                                    </span>
                                ))}
                            </div>
                        )}

                        {hasTerms && (<>
                            <h3 className="sh-sch">Seller terms</h3>
                            <dl className="sh-dl">
                                {terms.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                            </dl>
                        </>)}
                    </div>
                    <div className="sh-wf">
                        <button type="button" className="sh-btn go" onClick={() => closeRef.current?.()}>Done</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ---------------- page ---------------- */
function CartPageInner() {
    const navigate = useNavigate();
    const { socket } = useSocket();
    const { token } = useAuth();
    const { registerActive, unregisterActive, reportApproved, reportRejected } = useOrderResumeSafe();
    const { selectedAddress } = useBuyerAddress();
    const addressBookRef = useRef(null);
    const selectedAddressId = selectedAddress?.id || null;

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingItem, setViewingItem] = useState(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);
    const pendingWrites = useRef({});
    const pendingWritePromises = useRef({});
    const { setCountOptimistic } = useCart();

    // Selection: everything is selected unless its submission_id is in this set.
    const [deselected, setDeselected] = useState(() => new Set());

    // Coming back with the browser's Back button from the payment page can restore this page from the
    // back/forward cache with the button stuck on its spinner. Unfreeze it.
    useEffect(() => {
        const onShow = (e) => { if (e.persisted) setChecking(false); };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);

    const load = useCallback(async () => {
        const res = await fetchCart(token);
        if (res?.success) {
            setItems(res.items);
            setCountOptimistic(res.items.length);
        }
        setLoading(false);
    }, [token, setCountOptimistic]);

    useEffect(() => { load(); }, [load]);

    // Forget deselections for items that are no longer in the cart.
    useEffect(() => {
        setDeselected((prev) => {
            if (!prev.size) return prev;
            const live = new Set(items.map((i) => i.submission_id));
            const next = new Set([...prev].filter((id) => live.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [items]);

    const grouped = useMemo(() => (
        items.reduce((acc, it) => {
            (acc[it.seller_id] ||= { seller: it, items: [] }).items.push(it);
            return acc;
        }, {})
    ), [items]);
    const sellerIds = Object.keys(grouped);

    // ---- Selection helpers ----
    const selectedItems = useMemo(() => items.filter((it) => !deselected.has(it.submission_id)), [items, deselected]);
    const selectedCount = selectedItems.length;
    const itemCount = items.length;
    const allSelected = itemCount > 0 && selectedCount === itemCount;
    const noSelection = selectedCount === 0;
    // sellers that have at least one selected line (only these need transport + serviceability to check out)
    const selectedSellerIds = sellerIds.filter((id) => grouped[id].items.some((it) => !deselected.has(it.submission_id)));

    const toggleItem = (submissionId) => setDeselected((prev) => {
        const next = new Set(prev);
        if (next.has(submissionId)) next.delete(submissionId); else next.add(submissionId);
        return next;
    });
    const setSelectionFor = (ids, on) => setDeselected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (on ? next.delete(id) : next.add(id)));
        return next;
    });

    const grandTotal = selectedItems.reduce((sum, it) => sum + priceFor(it).lineTotal, 0);

    // ---- Order-window + delivery-serviceability constraints (backend re-checks at checkout) ----
    const submissionIds = useMemo(() => [...new Set(items.map((i) => i.submission_id).filter(Boolean))], [items]);
    const submissionIdsKey = submissionIds.join(",");

    const [constraintsBySubmission, setConstraintsBySubmission] = useState({});
    useEffect(() => {
        if (!submissionIds.length) { setConstraintsBySubmission({}); return; }
        let cancelled = false;
        (async () => {
            const results = await Promise.all(submissionIds.map((id) => fetchOrderConstraints(id)));
            if (cancelled) return;
            const map = {};
            submissionIds.forEach((id, idx) => { if (results[idx]?.success) map[id] = results[idx]; });
            setConstraintsBySubmission(map);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionIdsKey]);

    const [clockTick, setClockTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setClockTick((t) => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const groupConstraintStatus = useMemo(() => {
        const result = {};
        for (const [sellerId, group] of Object.entries(grouped)) {
            const first = group.items[0];
            const constraints = constraintsBySubmission[first.submission_id];
            const windowStatus = checkOrderWindow(constraints ? {
                workingDays: constraints.workingDays,
                orderAcceptanceStart: constraints.orderAcceptanceStart,
                orderAcceptanceEnd: constraints.orderAcceptanceEnd,
                holidays: constraints.holidays,
            } : null);
            const blockedItems = group.items
                .map((it) => ({ item: it, status: checkLocationServiceable(constraintsBySubmission[it.submission_id]?.dispatchingLocations, selectedAddress) }))
                .filter((x) => !x.status.serviceable);
            result[sellerId] = { windowStatus, blockedItems, blocked: blockedItems.length > 0 };
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grouped, constraintsBySubmission, selectedAddress?.state, selectedAddress?.city, clockTick]);

    // Only SELECTED lines that can't be delivered block checkout.
    const blockedSelected = !selectedAddress ? [] : selectedItems
        .map((it) => groupConstraintStatus[it.seller_id]?.blockedItems.find((b) => b.item.cart_item_id === it.cart_item_id))
        .filter(Boolean);
    const anyGroupBlocked = blockedSelected.length > 0;

    // ---- Per-seller transport preference (keyed by sellerId) ----
    const [transportPreferences, setTransportPreferences] = useState({});
    const [pendingTransportProposals, setPendingTransportProposals] = useState({});
    const [transportRemovedNotices, setTransportRemovedNotices] = useState({});
    const [activeTransportSellerId, setActiveTransportSellerId] = useState(null);
    const lastCheckedRouteBySellerRef = useRef({});
    // true while "Select transport & pay" is walking the buyer through missing sellers
    const checkoutAfterTransportRef = useRef(false);

    // Instant reflect of approval/rejection notifications for proposals this page tracks.
    useEffect(() => {
        if (!socket) return;
        const onNotif = async (payload) => {
            const routeOptionId = payload?.routeOptionId;
            if (!routeOptionId) return;
            const sellerId = Object.entries(pendingTransportProposals).find(([, p]) => p?.routeOptionId === routeOptionId)?.[0];
            if (!sellerId) return;
            const proposal = pendingTransportProposals[sellerId];

            if (payload.type === "transport_proposal_approved") {
                const res = await fetchBuyerTransportPreference(sellerId, selectedAddress?.state, selectedAddress?.city, token, routeOptionId);
                if (res?.checkedProposalStatus === "approved" && res?.preference) {
                    setTransportPreferences((prev) => ({ ...prev, [sellerId]: res.preference }));
                    setPendingTransportProposals((prev) => ({ ...prev, [sellerId]: null }));
                    reportApproved(routeOptionId, res.preference);
                }
            } else if (payload.type === "transport_proposal_rejected") {
                setPendingTransportProposals((prev) => ({ ...prev, [sellerId]: null }));
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: null }));
                setTransportRemovedNotices((prev) => ({
                    ...prev,
                    [sellerId]: `Your proposed transport option (${proposal.summary}) wasn't accepted by this seller.` + (payload.reason ? ` Reason: ${payload.reason}` : ""),
                }));
                reportRejected(routeOptionId, payload.reason || null);
            }
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, pendingTransportProposals, selectedAddress?.state, selectedAddress?.city, token]);

    useEffect(() => {
        const keys = Object.values(pendingTransportProposals).filter((p) => p?.routeOptionId).map((p) => p.routeOptionId);
        keys.forEach(registerActive);
        return () => keys.forEach(unregisterActive);
    }, [pendingTransportProposals, registerActive, unregisterActive]);

    // Look up each seller's preference as soon as the address (from context) is known.
    useEffect(() => {
        const city = selectedAddress?.city;
        const state = selectedAddress?.state;
        if (!city || !state || !sellerIds.length) return;
        const routeKey = `${state.trim().toLowerCase()}::${city.trim().toLowerCase()}`;

        sellerIds.forEach(async (sellerId) => {
            if (lastCheckedRouteBySellerRef.current[sellerId] === routeKey) return;
            lastCheckedRouteBySellerRef.current[sellerId] = routeKey;

            const res = await fetchBuyerTransportPreference(sellerId, state, city, token);
            const pendingProposal = res?.pendingProposal ? { ...res.pendingProposal, destCity: city, destState: state } : null;
            setPendingTransportProposals((prev) => ({ ...prev, [sellerId]: pendingProposal }));

            if (res?.rejectedNotice) {
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: null }));
                setTransportRemovedNotices((prev) => ({
                    ...prev,
                    [sellerId]: `Your proposed transport option (${res.rejectedNotice.summary}) wasn't accepted by this seller.` +
                        (res.rejectedNotice.reason ? ` Reason: ${res.rejectedNotice.reason}` : ""),
                }));
                if (res.rejectedNotice.routeOptionId) reportRejected(res.rejectedNotice.routeOptionId, res.rejectedNotice.reason || null);
                return;
            }

            if (res?.success && res.decided) {
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: res.preference ? { ...res.preference, destCity: city, destState: state } : null }));
                setTransportRemovedNotices((prev) => ({ ...prev, [sellerId]: null }));
            } else {
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: null }));
                setTransportRemovedNotices((prev) => ({
                    ...prev,
                    [sellerId]: res?.invalidated ? "The seller no longer offers your previously selected transport option." : null,
                }));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAddress?.city, selectedAddress?.state, token, sellerIds.join(",")]);

    // Address changed -> routes changed -> forget per-seller checks so they re-run.
    const prevRouteRef = useRef(null);
    useEffect(() => {
        const key = selectedAddress ? `${selectedAddress.state}::${selectedAddress.city}` : null;
        if (prevRouteRef.current && key && prevRouteRef.current !== key) {
            setTransportPreferences({});
            setPendingTransportProposals({});
        }
        prevRouteRef.current = key;
    }, [selectedAddress?.city, selectedAddress?.state]); // eslint-disable-line react-hooks/exhaustive-deps

    // Poll pending proposals for approval / rejection.
    useEffect(() => {
        const city = selectedAddress?.city;
        const state = selectedAddress?.state;
        if (!city || !state) return;

        Object.entries(pendingTransportProposals).forEach(async ([sellerId, proposal]) => {
            if (!proposal?.routeOptionId) return;
            const res = await fetchBuyerTransportPreference(sellerId, state, city, token, proposal.routeOptionId);
            if (!res?.success) return;

            if (res.checkedProposalStatus === "approved") {
                const resolved = {
                    routeOptionId: proposal.routeOptionId, mode: proposal.mode, fields: proposal.fields,
                    summary: proposal.summary, destCity: city, destState: state,
                };
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: resolved }));
                setPendingTransportProposals((prev) => ({ ...prev, [sellerId]: null }));
                reportApproved(proposal.routeOptionId, resolved);
            } else if (res.checkedProposalStatus === "rejected") {
                setPendingTransportProposals((prev) => ({ ...prev, [sellerId]: null }));
                setTransportPreferences((prev) => ({ ...prev, [sellerId]: null }));
                setTransportRemovedNotices((prev) => ({
                    ...prev,
                    [sellerId]: `Your proposed transport option (${proposal.summary}) wasn't accepted by this seller.` +
                        (res.rejectedReason ? ` Reason: ${res.rejectedReason}` : ""),
                }));
                reportRejected(proposal.routeOptionId, res.rejectedReason || null);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clockTick, selectedAddress?.city, selectedAddress?.state, token]);

    useEffect(() => () => { Object.values(pendingWrites.current).forEach(clearTimeout); }, []);

    const handleQty = (submissionId, quantity, moq) => {
        const floor = Number(moq) > 0 ? Number(moq) : 1;
        if (quantity < floor) return;

        setItems((prev) => prev.map((it) => (it.submission_id === submissionId ? { ...it, quantity } : it)));
        clearTimeout(pendingWrites.current[submissionId]);

        pendingWritePromises.current[submissionId] = new Promise((resolve) => {
            pendingWrites.current[submissionId] = setTimeout(async () => {
                const res = quantity <= 0
                    ? await removeFromCart(token, submissionId)
                    : await updateCartItem(token, submissionId, { quantity });
                if (res && res.success === false) {
                    setError(res.message || "Couldn't update quantity.");
                    load();
                }
                delete pendingWritePromises.current[submissionId];
                resolve();
            }, 350);
        });
    };

    const flushPendingWrites = async () => {
        const ids = Object.keys(pendingWrites.current);
        ids.forEach((id) => clearTimeout(pendingWrites.current[id]));
        await Promise.all(ids.map(async (submissionId) => {
            const it = items.find((i) => i.submission_id === submissionId);
            if (!it) return;
            const res = it.quantity <= 0
                ? await removeFromCart(token, submissionId)
                : await updateCartItem(token, submissionId, { quantity: it.quantity });
            if (res && res.success === false) setError(res.message || "Couldn't update quantity.");
        }));
        pendingWrites.current = {};
        pendingWritePromises.current = {};
    };

    const handleRemove = (submissionId) => {
        setItems((prev) => {
            const next = prev.filter((it) => it.submission_id !== submissionId);
            setCountOptimistic(next.length);
            return next;
        });
        removeFromCart(token, submissionId).then((res) => {
            if (res && res.success === false) {
                setError(res.message || "Couldn't remove item.");
                load();
            }
        });
    };

    // Only the selected lines matter for stock blocking.
    const hasStockBlock = selectedItems.some((it) => { const s = stockInfoFor(it); return s.outOfStock || s.exceeds; });

    // prefsOverride lets the "Select transport & pay" flow check out right after the
    // last seller is chosen, before React has committed that state.
    const handleCheckout = async (prefsOverride) => {
        setError(null);
        const prefs = prefsOverride || transportPreferences;

        if (noSelection) { setError("Select at least one item to check out."); return; }
        if (hasStockBlock) {
            setError("One or more selected items exceed what's available from the seller. Please adjust the quantities.");
            return;
        }
        if (!selectedAddressId) { setError("Please add a delivery address first."); return; }
        if (anyGroupBlocked) {
            setError(blockedSelected[0]?.status.message || "One or more selected items aren't deliverable to your address.");
            return;
        }
        const missingSellerId = selectedSellerIds.find((id) => !prefs[id]);
        if (missingSellerId) {
            const sellerName = grouped[missingSellerId]?.seller?.seller_name || "one of your sellers";
            setError(pendingTransportProposals[missingSellerId]
                ? `Waiting for ${sellerName} to approve your transport option before you can check out.`
                : `Please set a transport preference for ${sellerName} before checking out.`);
            return;
        }

        setChecking(true);
        let navigating = false;
        try {
            await flushPendingWrites();

            const selectedSellerSet = new Set(selectedSellerIds.map(String));
            const transportPreferencesPayload = Object.entries(prefs)
                .filter(([sellerId, pref]) => pref?.routeOptionId && selectedSellerSet.has(String(sellerId)))
                .map(([sellerId, pref]) => ({ sellerId, routeOptionId: pref.routeOptionId }));

            const res = await checkoutCart(token, {
                shippingAddressId: selectedAddressId,
                transportPreferences: transportPreferencesPayload,
                submissionIds: selectedItems.map((it) => it.submission_id),
            });
            if (!res?.success) {
                setError(res?.message || "Couldn't place the order.");
                if (res?.code === "CART_CHANGED") load(); // cart moved under us: refresh it
                return;
            }

            // The order group exists (awaiting payment). Send the buyer to JioPay for the selected items.
            // If this step fails, tapping the button again retries.
            const pay = await startGroupPayment(token, res.orderGroupId);
            if (!pay?.success) { setError(pay?.message || "Couldn't start the payment. Tap the button again to retry."); return; }
            navigating = redirectToGateway(pay.redirectUrl);
            if (!navigating) setError("Couldn't open the payment page. Tap the button again to retry.");
        } finally {
            // While the browser navigates to the gateway keep the spinner up.
            if (!navigating) setChecking(false);
        }
    };

    const handleTransportResolved = (sellerId, result) => {
        const isPending = !!result?.pending;
        const nextPrefs = { ...transportPreferences, [sellerId]: isPending ? null : (result || null) };
        const nextPending = { ...pendingTransportProposals, [sellerId]: isPending ? result : null };

        setTransportPreferences(nextPrefs);
        setPendingTransportProposals(nextPending);
        setTransportRemovedNotices((prev) => ({ ...prev, [sellerId]: null }));

        if (checkoutAfterTransportRef.current) {
            if (!result || isPending) {
                checkoutAfterTransportRef.current = false;
                setActiveTransportSellerId(null);
                return;
            }
            const nextNeeds = selectedSellerIds.filter((id) => !nextPrefs[id] && !nextPending[id]);
            if (nextNeeds.length) { setActiveTransportSellerId(nextNeeds[0]); return; }
            checkoutAfterTransportRef.current = false;
            setActiveTransportSellerId(null);
            if (selectedSellerIds.every((id) => nextPrefs[id])) handleCheckout(nextPrefs);
            return;
        }
        setActiveTransportSellerId(null);
    };

    /* ---- primary CTA (only sellers with selected items need transport) ---- */
    const missingIds = selectedSellerIds.filter((id) => !transportPreferences[id]);
    const needSelectIds = missingIds.filter((id) => !pendingTransportProposals[id]);
    const waitingIds = missingIds.filter((id) => pendingTransportProposals[id]);
    const ctaLabel = noSelection ? "Select items to continue"
        : !selectedAddressId ? "Add delivery address"
            : needSelectIds.length ? "Select transport & pay"
                : waitingIds.length ? "Waiting for seller approval"
                    : "Proceed to pay";
    const ctaDisabled = checking || noSelection || hasStockBlock || anyGroupBlocked || (!needSelectIds.length && waitingIds.length > 0);

    const handlePrimary = () => {
        setError(null);
        if (noSelection) return;
        if (!selectedAddressId) { addressBookRef.current?.openChange(); return; }
        if (needSelectIds.length) {
            checkoutAfterTransportRef.current = true;
            setActiveTransportSellerId(needSelectIds[0]);
            return;
        }
        handleCheckout();
    };

    if (loading) {
        return (
            <div className="sh-w" aria-busy="true">
                <div className="sh-sk line" style={{ marginTop: 28, width: "45%" }} />
                <div className="sh-grid" style={{ marginTop: 18 }}>{[0, 1].map((i) => <div className="sh-sk tall" key={i} />)}</div>
            </div>
        );
    }

    return (
        <div className="sh-w" style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="sh-sec" style={{ marginTop: 22 }}>
                <div>
                    <h1 className="sh-pt">My cart</h1>
                    <p className="sh-sub" style={{ marginTop: 4 }}>Choose the items you want, pick transport and pay.</p>
                </div>
                {itemCount > 0 && <span className="sh-cntp">{itemCount} item{itemCount === 1 ? "" : "s"}</span>}
            </div>

            {itemCount === 0 ? (
                <div className="sh-emp">
                    <ShoppingCart size={34} style={{ margin: "0 auto 10px", display: "block" }} />
                    <b>Your cart is empty</b>
                    Add products from sellers and they will wait for you here.
                    <div><button type="button" className="sh-btn go" style={{ marginTop: 16 }} onClick={() => navigate(EXPLORE_ROUTE)}>Explore products<ArrowRight size={16} /></button></div>
                </div>
            ) : (
                <>
                    {/* Delivery address */}
                    <section className="sh-card">
                        <p className="sh-lbl"><MapPin size={14} />Delivery address</p>
                        <div className="sh-tw"><AddressBook ref={addressBookRef} disabled={checking} /></div>
                    </section>

                    {/* Select all */}
                    <div className="sh-selbar">
                        <Check checked={allSelected} indeterminate={selectedCount > 0 && !allSelected} disabled={checking}
                            label="Select all items" onChange={(on) => setSelectionFor(items.map((i) => i.submission_id), on)}>
                            Select all
                        </Check>
                        <span className="sh-selcnt" aria-live="polite">{selectedCount} of {itemCount} selected</span>
                    </div>

                    {Object.entries(grouped).map(([sellerId, g]) => {
                        const groupStatus = groupConstraintStatus[sellerId];
                        const pref = transportPreferences[sellerId];
                        const pendingProposal = pendingTransportProposals[sellerId];
                        const removedNotice = transportRemovedNotices[sellerId];
                        const groupIds = g.items.map((it) => it.submission_id);
                        const groupSelected = g.items.filter((it) => !deselected.has(it.submission_id));
                        const sellerSelCount = groupSelected.length;
                        const sellerAll = sellerSelCount === g.items.length;
                        const sellerTotal = groupSelected.reduce((s, it) => s + priceFor(it).lineTotal, 0);

                        return (
                            <section key={g.seller.seller_id} className="sh-card">
                                <div className="sh-chd">
                                    <div className="sh-chn">
                                        <b>{g.seller.seller_name}</b>
                                        <div className="sh-chm">
                                            <small>{sellerSelCount} of {g.items.length} selected</small>
                                            <button type="button" className="sh-sela" disabled={checking}
                                                aria-label={`${sellerAll ? "Unselect" : "Select"} all items from ${g.seller.seller_name}`}
                                                onClick={() => setSelectionFor(groupIds, !sellerAll)}>
                                                {sellerAll ? "Unselect all" : "Select all"}
                                            </button>
                                        </div>
                                    </div>
                                    {sellerSelCount > 0
                                        ? <b className="sh-chs2">₹{inr(sellerTotal)}</b>
                                        : <span className="sh-muted">Not selected</span>}
                                </div>

                                {g.items.map((it) => {
                                    const p = priceFor(it);
                                    const floor = Number(it.moq) > 0 ? Number(it.moq) : 1;
                                    const atFloor = it.quantity <= floor;
                                    const stock = stockInfoFor(it);
                                    const atCeiling = stock.capped && it.quantity >= stock.max;
                                    const unitLbl = saleUnitLabel(it.units_per_master_pack);
                                    const itemBlockedByLocation = groupStatus?.blockedItems?.some((b) => b.item.cart_item_id === it.cart_item_id);
                                    const picked = !deselected.has(it.submission_id);
                                    const open = () => setViewingItem(it);
                                    return (
                                        <div key={it.cart_item_id} className={`sh-ci${picked ? "" : " off"}`}>
                                            <div className="sh-cirow">
                                                <Check checked={picked} disabled={checking} label={`Select ${it.product_name}`}
                                                    onChange={() => toggleItem(it.submission_id)} />
                                                <div className="sh-cibody">
                                                    <div className="sh-cim" role="button" tabIndex={0} onClick={open}
                                                        onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
                                                        <div className="sh-th">
                                                            {it.product_image ? <img src={it.product_image} alt="" loading="lazy" /> : (it.product_name || "?").trim()[0]?.toUpperCase()}
                                                        </div>
                                                        <div className="sh-cin">
                                                            <p className="sh-rn">{it.product_name}</p>
                                                            <p className="sh-cps">₹{inr(p.unitPrice)} / {unitLbl}{p.discountPercent > 0 ? ` · ${p.discountPercent}% off` : ""}</p>
                                                            <p className="sh-cdt">View price details</p>
                                                        </div>
                                                        <b className="sh-cam">₹{inr(p.lineTotal)}</b>
                                                    </div>

                                                    <div className="sh-cir">
                                                        <QtyStepper value={it.quantity} min={floor} disabled={atCeiling && atFloor} maxed={atCeiling}
                                                            onChange={(v) => {
                                                                if (stock.capped && v > stock.max) return;
                                                                handleQty(it.submission_id, v, it.moq);
                                                            }} />
                                                        <span className="sh-cun">{unitLbl}(s)</span>
                                                        <button type="button" className="sh-ic sh-rm" aria-label={`Remove ${it.product_name}`} onClick={() => handleRemove(it.submission_id)}>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>

                                                    {atFloor && floor > 1 && (
                                                        <p className="sh-wn">At the seller's MOQ ({floor} {unitLbl}{floor === 1 ? "" : "s"}). Remove the item instead of going lower.</p>
                                                    )}
                                                    {stock.outOfStock && <p className="sh-wn bad">Out of stock with this seller. Remove it or uncheck it to continue.</p>}
                                                    {!stock.outOfStock && stock.exceeds && (
                                                        <p className="sh-wn bad">Only {stock.max} {unitLbl}{stock.max === 1 ? "" : "s"} available from this seller. Reduce quantity to continue.</p>
                                                    )}
                                                    {itemBlockedByLocation && (
                                                        <p className="sh-wn bad"><MapPin size={12} />Not deliverable to your selected address.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {groupStatus?.windowStatus && !groupStatus.windowStatus.open && (
                                    <Notice tone="warn" icon={Clock}>{groupStatus.windowStatus.message}</Notice>
                                )}
                                {groupStatus?.blocked && (
                                    <Notice tone="danger" icon={MapPin} title="Can't include this seller's items right now">
                                        {groupStatus.blockedItems.length === 1
                                            ? groupStatus.blockedItems[0].status.message
                                            : `${groupStatus.blockedItems.length} items from this seller aren't deliverable to your selected address.`}
                                        {" "}Uncheck or remove them to continue.
                                    </Notice>
                                )}

                                {/* Per-seller transport */}
                                <div className="sh-trn">
                                    <div className="sh-trh">
                                        <p className="sh-lbl" style={{ margin: 0 }}><Truck size={14} />Preferred transport</p>
                                        <button type="button" className="sh-lnk" disabled={!selectedAddressId || checking}
                                            onClick={() => { checkoutAfterTransportRef.current = false; setActiveTransportSellerId(sellerId); }}>
                                            {pref || pendingProposal ? "Change" : "Select"}
                                        </button>
                                    </div>
                                    {pref ? (
                                        <b className="sh-trv">{routeTransportModeLabel(pref.mode)}</b>
                                    ) : pendingProposal ? (
                                        <>
                                            <b className="sh-trv">{routeTransportModeLabel(pendingProposal.mode)}</b>
                                            <p className="sh-trw">Awaiting the seller's approval. You can check out with this seller once it's approved.</p>
                                        </>
                                    ) : sellerSelCount > 0 ? (
                                        <p className="sh-cap" style={{ margin: 0 }}>Not selected yet. We'll ask when you tap "Select transport &amp; pay".</p>
                                    ) : (
                                        <p className="sh-cap" style={{ margin: 0 }}>Not needed. None of this seller's items are selected for checkout.</p>
                                    )}
                                    {removedNotice && <Notice tone="warn">{removedNotice}</Notice>}
                                </div>
                            </section>
                        );
                    })}

                    {/* Keep shopping */}
                    <button type="button" className="sh-explore" disabled={checking} onClick={() => navigate(EXPLORE_ROUTE)}>
                        <Compass size={18} />Explore more products
                    </button>

                    {/* Sticky checkout bar */}
                    <div className="sh-cbar">
                        <div className="sh-cbi">
                            {error && <p className="sh-err sh-cber" role="alert">{error}</p>}
                            <div className="sh-cbr">
                                <div>
                                    <small>Total · {selectedCount} of {itemCount} item{itemCount === 1 ? "" : "s"}</small>
                                    <b>₹{inr(grandTotal)}</b>
                                </div>
                                <button type="button" className="sh-btn go" onClick={handlePrimary} disabled={ctaDisabled}>
                                    {checking ? <Loader2 size={18} className="sh-spin" /> : <>{ctaLabel}<ArrowRight size={17} /></>}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeTransportSellerId && grouped[activeTransportSellerId] && (
                <TransportPreferenceModal
                    open
                    seller={sellerObjFor(grouped[activeTransportSellerId])}
                    destAddressId={selectedAddressId}
                    removedNotice={transportRemovedNotices[activeTransportSellerId]}
                    onIntentSource="cart"
                    onCaptureIntent={() => ({ cartSellerId: activeTransportSellerId })}
                    onClose={() => { checkoutAfterTransportRef.current = false; setActiveTransportSellerId(null); }}
                    onAddressChange={() => { /* address lives in BuyerAddressContext */ }}
                    onResolved={(result) => handleTransportResolved(activeTransportSellerId, result)}
                />
            )}

            {viewingItem && <CartItemDetailModal item={viewingItem} onClose={() => setViewingItem(null)} />}
        </div>
    );
}

export default function SaveCartPage() {
    return (
        <BuyerAddressProvider>
            <CartPageInner />
        </BuyerAddressProvider>
    );
}