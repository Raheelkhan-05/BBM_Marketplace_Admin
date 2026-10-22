// pages/CartPage.jsx — SINGLE-PAGE FLOW
//
//   Top:      Delivery address (shared BuyerAddressContext, same one as Home / Buy Now)
//   Middle:   one card per seller: items + quantity + price, then that seller's
//             "Preferred transport" row and any constraint notices
//   Footer:   total + ONE primary button:
//             - some seller has no transport chosen -> "Select transport & pay"
//               (opens each missing seller's transport modal in turn, then checks out)
//             - all set                            -> "Proceed to pay"
//
// Pricing, stock, MOQ, order-window / serviceability constraints and the debounced
// quantity writes are unchanged.
//
// PAYMENT: checkout creates the order group, then the buyer is sent to JioPay's hosted checkout
// (utils/paymentsApi.js) for the whole cart in one payment. They return via /payment/return.
// If starting the payment fails, tapping the button again resumes the same pending group.
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Loader2, Store, ShoppingCart, MapPin, Minus, Plus, Clock, Truck, AlertCircle, ReceiptText, Package, FileText, X, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchCart, updateCartItem, removeFromCart, checkoutCart } from "../utils/cartApi.js";
import { startGroupPayment, redirectToGateway } from "../utils/paymentsApi.js";
import { fetchOrderConstraints } from "../utils/api.js";
import { fetchBuyerTransportPreference } from "../utils/api.transport.js";
import { useOrderResume } from "../context/OrderResumeContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { C } from "../components/catalog/tokens";
import AddressBook from "../components/shipping/AddressBook.jsx";
import TransportPreferenceModal from "../components/transport/TransportPreferenceModal.jsx";
import { BuyerAddressProvider, useBuyerAddress } from "../context/BuyerAddressContext.jsx";
import { useCart } from "../context/CartContext.jsx";
import { purchaseQtyToSaleUnitQty, saleUnitQtyToBaseUnits, saleUnitLabel, round2 } from "../shared/packUnits.js";
import { checkOrderWindow, checkLocationServiceable } from "../shared/orderConstraints.js";
import { routeTransportModeLabel } from "../../shared/routeTransportFields.js";

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

// item.price is ALREADY per sale unit (Pack, or Master Pack when this listing
// hasOuterPack) — never re-multiply by pack_size.
function priceFor(item) {
    const saleQty = purchaseQtyToSaleUnitQty(item.quantity, item.purchase_basis, item.pack_size, item.units_per_master_pack);
    const basePricePerSaleUnit = resolveSlabUnitPrice(item.price_slabs, saleQty, Number(item.price));
    const discountPercent = resolveDiscountPercent(item.quantity_discounts, saleQty);
    const unitPrice = round2(basePricePerSaleUnit * (1 - discountPercent / 100));
    const moqSaleUnits = Number(item.moq) || 0;
    const meetsMoq = moqSaleUnits ? saleQty >= moqSaleUnits : true;
    return {
        saleQty, lineTotal: round2(unitPrice * saleQty), discountPercent, meetsMoq, moqSaleUnits,
        unitPrice, basePricePerSaleUnit,
    };
}

function QuoteRow({ label, value, tone, small }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className={`font-medium tracking-wide ${small ? "text-[12.5px]" : "text-[13.5px]"}`} style={{ color: tone || C.muted }}>{label}</span>
            <span className={`shrink-0 tabular-nums font-bold tracking-wide ${small ? "text-[12.5px]" : "text-[13.5px]"}`} style={{ color: tone || C.ink }}>{value}</span>
        </div>
    );
}

function saleUnitLabelFor(item) { return saleUnitLabel(item.units_per_master_pack); }
function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

function CartItemDetailModal({ item, onClose }) {
    const p = priceFor(item);
    const saleUnit = saleUnitLabelFor(item);
    const hasTerms = item.delivery_timeline || item.payment_terms || item.return_policy || item.warranty || item.freight_included != null || item.dispatch_origin;

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-wider" style={{ color: C.secondary }}>Item details</p>
                        <h2 className="mt-0.5 truncate text-[16px] font-bold tracking-wide" style={{ color: C.ink }}>{item.product_name}</h2>
                    </div>
                    <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                        <X className="h-4.5 w-4.5" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex flex-col gap-3">
                        <details open className="group rounded-2xl border bg-white p-4" style={{ borderColor: C.hairSoft }}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12` }}>
                                        <ReceiptText className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                                    </span>
                                    <span className="text-[14px] font-bold" style={{ color: C.ink }}>Price breakdown</span>
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: C.muted }} />
                            </summary>

                            <div className="mt-3 flex flex-col gap-3 border-t pt-3" style={{ borderColor: C.hairSoft }}>
                                <div className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hair }}>
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${C.secondary}12` }}>
                                        <Package className="h-4 w-4" style={{ color: C.secondary }} />
                                    </span>
                                    <p className="text-[14px] font-extrabold tabular-nums tracking-wide" style={{ color: C.ink }}>
                                        {p.saleQty} {saleUnit}{p.saleQty === 1 ? "" : "s"}
                                        {Number(item.pack_size) > 0 && (
                                            <span className="font-semibold" style={{ color: C.muted }}>
                                                {" "}· {saleUnitQtyToBaseUnits(p.saleQty, item.pack_size, item.units_per_master_pack)} {item.unit}
                                            </span>
                                        )}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2.5 rounded-xl bg-slate-50 p-3.5">
                                    <span className="text-[11.5px] font-bold tracking-wider" style={{ color: C.muted }}>Rate applied</span>
                                    <div className="flex items-baseline justify-between gap-2 tracking-wide">
                                        <span className="text-[14px] font-bold" style={{ color: C.ink }}>
                                            ₹{inr(p.basePricePerSaleUnit)} <span className="font-medium" style={{ color: C.muted }}>/ {saleUnit}</span>
                                        </span>
                                        {Number(item.pack_size) > 0 && (
                                            <span className="shrink-0 text-[11px] font-medium tabular-nums" style={{ color: C.muted }}>
                                                ≈ ₹{inr(p.basePricePerSaleUnit / saleUnitQtyToBaseUnits(1, item.pack_size, item.units_per_master_pack))} / {item.unit}
                                            </span>
                                        )}
                                    </div>
                                    <div className="h-px" style={{ background: C.hair }} />
                                    <QuoteRow label="Subtotal" value={`₹${inr(p.basePricePerSaleUnit * p.saleQty)}`} tone={C.ink} small />
                                    {p.discountPercent > 0 && (
                                        <QuoteRow label={`Discount (${p.discountPercent}% off)`} value={`− ₹${inr(p.basePricePerSaleUnit * p.saleQty - p.lineTotal)}`} tone={C.secondary} small />
                                    )}
                                    <div className="h-px" style={{ background: C.hair }} />
                                    <div className="flex items-center justify-between tracking-wide">
                                        <span className="text-[13.5px] font-bold" style={{ color: C.ink }}>Total payable</span>
                                        <span className="text-[20px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(p.lineTotal)}</span>
                                    </div>
                                </div>

                                {Array.isArray(item.price_slabs) && item.price_slabs.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {item.price_slabs.map((slab, i) => (
                                            <span key={i} className="rounded-full border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.muted }}>
                                                {slab.minQty}{slab.maxQty ? `–${slab.maxQty}` : "+"} {saleUnit}{Number(slab.maxQty || slab.minQty) === 1 ? "" : "s"}: ₹{inr(slab.price)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {Array.isArray(item.quantity_discounts) && item.quantity_discounts.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {item.quantity_discounts.map((tier, i) => (
                                            <span key={i} className="rounded-full border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.muted }}>
                                                {tier.minQty}+ {saleUnit}{Number(tier.minQty) === 1 ? "" : "s"}: {tier.discountPercent}% off
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </details>

                        {hasTerms && (
                            <details className="group rounded-2xl border bg-white p-4" style={{ borderColor: C.hairSoft }}>
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                                    <span className="flex items-center gap-2">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12` }}>
                                            <FileText className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                                        </span>
                                        <span className="text-[14px] font-bold" style={{ color: C.ink }}>Seller terms</span>
                                    </span>
                                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: C.muted }} />
                                </summary>
                                <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-[13px] font-medium" style={{ borderColor: C.hairSoft }}>
                                    {item.delivery_timeline && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Delivery</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{item.delivery_timeline}</span></div>}
                                    {item.payment_terms && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Payment</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{item.payment_terms}</span></div>}
                                    {item.return_policy && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Returns</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{item.return_policy}</span></div>}
                                    {item.warranty && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Warranty</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{item.warranty}</span></div>}
                                    {item.dispatch_origin && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Ships from</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{item.dispatch_origin}</span></div>}
                                    {item.freight_included != null && (
                                        <div className="flex justify-between gap-3">
                                            <span style={{ color: C.muted }}>Freight</span>
                                            <span style={{ color: item.freight_included ? C.secondary : C.ink, fontWeight: 700 }} className="text-right">
                                                {item.freight_included ? "Included in price" : "Extra, paid by buyer"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

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

function Notice({ tone = "warn", children }) {
    const tones = { warn: { background: "#FEF6E7", color: "#92600A" }, danger: { background: "#FDECEC", color: "#B3261E" } };
    const t = tones[tone] || tones.warn;
    return (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: t.background }}>
            <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: t.color }} />
            <p className="text-[11.5px] font-semibold leading-snug tracking-wider" style={{ color: t.color }}>{children}</p>
        </div>
    );
}

function ConstraintNotice({ reasons }) {
    const active = reasons.filter(Boolean);
    if (!active.length) return null;
    return (
        <div className="mt-2.5 rounded-lg px-3 py-2.5" style={{ background: "rgba(199,31,17,0.08)" }}>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.06em]" style={{ color: "#c71f11" }}>Can't include this seller's items right now</p>
            <div className="mt-1.5 flex flex-col gap-1">
                {active.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                        <r.icon className="mt-[1px] h-3 w-3 shrink-0" style={{ color: "#c71f11" }} />
                        <span className="text-[11.5px] font-semibold leading-snug tracking-wider" style={{ color: "#c71f11" }}>{r.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QtyStepper({ value, onChange, min, disabled }) {
    const atMin = Number(value) <= Number(min);
    return (
        <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button type="button" disabled={disabled || atMin}
                onClick={(e) => { e.stopPropagation(); onChange(Number(value) - 1); }}
                className="flex h-7 w-7 items-center justify-center transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-30">
                <Minus className="h-3 w-3" style={{ color: C.ink }} />
            </button>
            <span className="w-8 text-center text-[12.5px] font-bold tabular-nums">{value}</span>
            <button type="button" disabled={disabled}
                onClick={(e) => { e.stopPropagation(); onChange(Number(value) + 1); }}
                className="flex h-7 w-7 items-center justify-center transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-30">
                <Plus className="h-3 w-3" style={{ color: C.ink }} />
            </button>
        </div>
    );
}

function CartPageInner() {
    const navigate = useNavigate();
    const { socket } = useSocket();
    const { token } = useAuth();
    const { registerActive, unregisterActive, reportApproved, reportRejected } = useOrderResume();
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

    const grouped = useMemo(() => (
        items.reduce((acc, it) => {
            (acc[it.seller_id] ||= { seller: it, items: [] }).items.push(it);
            return acc;
        }, {})
    ), [items]);
    const sellerIds = Object.keys(grouped);

    const grandTotal = items.reduce((sum, it) => sum + priceFor(it).lineTotal, 0);

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

    const anyGroupBlocked = !!selectedAddress && Object.values(groupConstraintStatus).some((g) => g.blocked);

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

    const hasStockBlock = items.some((it) => { const s = stockInfoFor(it); return s.outOfStock || s.exceeds; });

    // prefsOverride lets the "Select transport & pay" flow check out right after the
    // last seller is chosen, before React has committed that state.
    const handleCheckout = async (prefsOverride) => {
        setError(null);
        const prefs = prefsOverride || transportPreferences;

        if (hasStockBlock) {
            setError("One or more items in your cart exceed what's available from the seller. Please adjust the quantities.");
            return;
        }
        if (!selectedAddressId) { setError("Please add a delivery address first."); return; }
        if (anyGroupBlocked) {
            const blockedGroup = Object.values(groupConstraintStatus).find((g) => g.blocked);
            setError(blockedGroup.blockedItems[0]?.status.message || "One or more sellers in your cart don't deliver to your selected address.");
            return;
        }
        const missingSellerId = sellerIds.find((id) => !prefs[id]);
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
            const transportPreferencesPayload = Object.entries(prefs)
                .filter(([, pref]) => pref?.routeOptionId)
                .map(([sellerId, pref]) => ({ sellerId, routeOptionId: pref.routeOptionId }));

            const res = await checkoutCart(token, { shippingAddressId: selectedAddressId, transportPreferences: transportPreferencesPayload });
            if (!res?.success) { setError(res?.message || "Couldn't place the order."); return; }

            // The order group exists (awaiting payment). Send the buyer to JioPay for the whole cart.
            // If this step fails, tapping the button again resumes the same pending group.
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
            const nextNeeds = sellerIds.filter((id) => !nextPrefs[id] && !nextPending[id]);
            if (nextNeeds.length) { setActiveTransportSellerId(nextNeeds[0]); return; }
            checkoutAfterTransportRef.current = false;
            setActiveTransportSellerId(null);
            if (sellerIds.every((id) => nextPrefs[id])) handleCheckout(nextPrefs);
            return;
        }
        setActiveTransportSellerId(null);
    };

    /* ---- primary CTA ---- */
    const missingIds = sellerIds.filter((id) => !transportPreferences[id]);
    const needSelectIds = missingIds.filter((id) => !pendingTransportProposals[id]);
    const waitingIds = missingIds.filter((id) => pendingTransportProposals[id]);
    const ctaLabel = !selectedAddressId ? "Add delivery address"
        : needSelectIds.length ? "Select transport & pay"
            : waitingIds.length ? "Waiting for seller approval"
                : "Proceed to pay";
    const ctaDisabled = checking || hasStockBlock || anyGroupBlocked || (!needSelectIds.length && waitingIds.length > 0);

    const handlePrimary = () => {
        setError(null);
        if (!selectedAddressId) { addressBookRef.current?.openChange(); return; }
        if (needSelectIds.length) {
            checkoutAfterTransportRef.current = true;
            setActiveTransportSellerId(needSelectIds[0]);
            return;
        }
        handleCheckout();
    };

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-40 pt-3 sm:px-4">
            <div className="mt-3 flex items-center justify-between gap-3 ps-2">
                <h1 className="font-extrabold" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>Cart</h1>
            </div>

            {items.length === 0 ? (
                <div className="mt-16 flex flex-col items-center text-center">
                    <ShoppingCart className="h-10 w-10" style={{ color: C.muted }} />
                    <p className="mt-3 font-bold" style={{ color: C.ink }}>Your cart is empty</p>
                    <button onClick={() => navigate("/")} className="mt-4 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                        Continue shopping
                    </button>
                </div>
            ) : (
                <>
                    {/* Delivery address */}
                    <div className="mt-3 rounded-2xl border p-3.5" style={{ borderColor: C.hair }}>
                        <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
                            <MapPin className="h-3.5 w-3.5" /> Delivery address
                        </p>
                        <AddressBook ref={addressBookRef} disabled={checking} />
                    </div>

                    {Object.entries(grouped).map(([sellerId, g]) => {
                        const groupStatus = groupConstraintStatus[sellerId];
                        const pref = transportPreferences[sellerId];
                        const pendingProposal = pendingTransportProposals[sellerId];
                        const removedNotice = transportRemovedNotices[sellerId];

                        return (
                            <div key={g.seller.seller_id} className="mt-4 rounded-2xl border p-3.5" style={{ borderColor: C.hair }}>
                                <p className="flex items-center gap-1.5 text-[13px] font-extrabold" style={{ color: C.ink }}><Store className="h-3.5 w-3.5" /> {g.seller.seller_name}</p>
                                <div className="mt-3 flex flex-col gap-3">
                                    {g.items.map((it) => {
                                        const p = priceFor(it);
                                        const floor = Number(it.moq) > 0 ? Number(it.moq) : 1;
                                        const atFloor = it.quantity <= floor;
                                        const stock = stockInfoFor(it);
                                        const atCeiling = stock.capped && it.quantity >= stock.max;
                                        const itemBlockedByLocation = groupStatus?.blockedItems?.some((b) => b.item.cart_item_id === it.cart_item_id);
                                        return (
                                            <div key={it.cart_item_id} className="flex flex-col gap-1">
                                                <div className="flex cursor-pointer items-center gap-3" onClick={() => setViewingItem(it)}
                                                    role="button" tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewingItem(it); } }}>
                                                    <img src={it.product_image} alt="" className="h-12 w-12 rounded-lg border object-cover" style={{ borderColor: C.hair }} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[13.5px] font-bold" style={{ color: C.ink }}>{it.product_name}</p>
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <QtyStepper value={it.quantity} min={floor} disabled={atCeiling && atFloor}
                                                                onChange={(v) => {
                                                                    if (stock.capped && v > stock.max) return;
                                                                    handleQty(it.submission_id, v, it.moq);
                                                                }} />
                                                            <span className="text-[11px] font-semibold" style={{ color: C.muted }}>{saleUnitLabel(it.units_per_master_pack)}(s)</span>
                                                        </div>
                                                        {atFloor && floor > 1 && (
                                                            <p className="mt-0.5 text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                                At the seller's MOQ ({floor} {saleUnitLabel(it.units_per_master_pack)}{floor === 1 ? "" : "s"}) — remove the item instead of going lower.
                                                            </p>
                                                        )}
                                                        {stock.outOfStock && <p className="mt-0.5 text-[10.5px] font-bold tracking-wide text-red-600">Out of stock with this seller — remove to continue.</p>}
                                                        {!stock.outOfStock && stock.exceeds && (
                                                            <p className="mt-0.5 text-[10.5px] font-bold tracking-wide text-red-600">
                                                                Only {stock.max} {saleUnitLabel(it.units_per_master_pack)}{stock.max === 1 ? "" : "s"} available from this seller — reduce quantity to continue.
                                                            </p>
                                                        )}
                                                        {itemBlockedByLocation && (
                                                            <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-bold tracking-wide" style={{ color: "#c71f11" }}>
                                                                <MapPin className="h-2.5 w-2.5" /> Not deliverable to your selected address.
                                                            </p>
                                                        )}
                                                    </div>
                                                    <p className="text-[13.5px] font-extrabold tabular-nums">₹{inr(p.lineTotal)}</p>
                                                    <button aria-label="Remove item" onClick={(e) => { e.stopPropagation(); handleRemove(it.submission_id); }}>
                                                        <Trash2 className="h-4 w-4" style={{ color: C.muted }} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {groupStatus?.windowStatus && !groupStatus.windowStatus.open && (
                                    <div className="mt-2.5 flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ background: "#fef3c7" }}>
                                        <Clock className="mt-[1px] h-3 w-3 shrink-0" style={{ color: "#a16207" }} />
                                        <span className="text-[11.5px] font-semibold leading-snug tracking-wider" style={{ color: "#a16207" }}>{groupStatus.windowStatus.message}</span>
                                    </div>
                                )}
                                {groupStatus?.blocked && (
                                    <ConstraintNotice reasons={[{
                                        icon: MapPin,
                                        message: groupStatus.blockedItems.length === 1
                                            ? groupStatus.blockedItems[0].status.message
                                            : `${groupStatus.blockedItems.length} items from this seller aren't deliverable to your selected address.`,
                                    }]} />
                                )}

                                {/* Per-seller transport */}
                                <div className="mt-3 flex flex-col gap-2 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hair }}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>
                                            <Truck className="h-3.5 w-3.5" /> Preferred transport
                                        </p>
                                        <button type="button" disabled={!selectedAddressId}
                                            onClick={() => { checkoutAfterTransportRef.current = false; setActiveTransportSellerId(sellerId); }}
                                            className="shrink-0 text-[12px] font-bold tracking-wide disabled:opacity-40" style={{ color: C.secondary }}>
                                            {pref || pendingProposal ? "Change" : "Select"}
                                        </button>
                                    </div>
                                    {pref ? (
                                        <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(pref.mode)}</p>
                                    ) : pendingProposal ? (
                                        <div className="flex flex-col gap-1">
                                            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(pendingProposal.mode)}</p>
                                            <p className="text-[11px] font-semibold tracking-wide" style={{ color: "#92600A" }}>
                                                Awaiting the seller's approval. You can check out with this seller once it's approved.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                            Not selected yet — we'll ask when you tap "Select transport & pay".
                                        </p>
                                    )}
                                    {removedNotice && <Notice tone="warn">{removedNotice}</Notice>}
                                </div>
                            </div>
                        );
                    })}

                    <div className="fixed bottom-16 left-0 right-0 z-[1] border-t bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
                        <div className="mx-auto max-w-3xl">
                            {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-bold uppercase" style={{ color: C.muted }}>Total</p>
                                    <p className="text-[18px] font-extrabold tabular-nums">₹{inr(grandTotal)}</p>
                                </div>
                                <button onClick={handlePrimary} disabled={ctaDisabled}
                                    className="rounded-xl px-6 py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
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

export default function CartPage() {
    return (
        <BuyerAddressProvider>
            <CartPageInner />
        </BuyerAddressProvider>
    );
}