// pages/OrdersPage.jsx — merges PurchaseOrdersPage + SalesOrdersPage into one
// route with a top-level tab switcher. "Sales" tab is only shown/rendered
// when the current user is an approved seller.
//
// NEW (this pass):
//  - Sales order card now uses the same document-style blocks as
//    PurchaseOrderDocument: a "Buyer" block and a "Deliver To" block
//    (caption / bold name / muted address) instead of one grey box with a
//    "Ship to:" sentence, and a totals section where the wallet deduction
//    is the same right-aligned italic note used in the PO document.
//  - Payment terms: a solid banner at the very TOP of each card. Credit
//    orders show on BOTH Purchase and Sales cards; advance-payment orders
//    show on Sales cards only.
//  - Freight: a clear "Freight included / extra in the final price" line
//    on both cards.
//  - Buyer phone / email are no longer shown on the Sales card — replaced
//    by a "Chat with buyer" button (/chat/:id).
//  - Removed a leftover console.log(profile) from PurchaseOrdersView.
import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Package, Loader2, ShoppingBag, Store } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import {
    fetchMyOrders,
    fetchSellerOrders, confirmSellerOrder, rejectSellerOrder, processSellerOrder, shipSellerOrder, deliverSellerOrder, fetchSellerOwnTransportOptions
} from "../utils/api.js";
import PurchaseCardActions from "../components/orders/PurchaseCardActions.jsx";
import { SellerOrderCardNote } from "../components/orders/DisputePanel.jsx";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import { C, EASE } from "../components/catalog/tokens.js";
import { transportLabel } from "../../shared/transportOptions.js";
import {
    StatusChip, SampleBadge, displayStatus, ItemQuantityLine, DeliveryEstimate, displayAmount,
    StockShortfallNote, shouldShowDelivery, shouldShowShortfall, formatDeliveryAddress, OrderTagsRow,
    PaymentTermsBanner, FreightNotice, ChatWithBuyerButton, PartyBlock, TotalRow, computeWalletDeduction, DOC_C,
} from "../components/orders/OrderDisplayHelpers.jsx";
import OrderTimingNote from "../components/orders/OrderTimingNote.jsx";
import ConfirmOrderModal from "../components/orders/ConfirmOrderModal.jsx";
import { confirmSellerOrderWithTransport } from "../utils/api.js"; // see api.js patch
import ShipOrderModal from "../components/orders/ShipOrderModal.jsx";
import { shipSellerOrderWithTransport } from "../utils/api.transport.js";

import { getPaymentTerms, orderFreightState } from "../components/orders/OrderDisplayHelpers.jsx";

function aggregateGroupTags(orders) {
    const credit = orders.some((o) => getPaymentTerms(o) === "credit");
    const states = [...new Set(orders.map((o) => orderFreightState(o)).filter(Boolean))];
    const freight = states.length === 0 ? null : states.length > 1 ? "mixed" : states[0];
    return { credit, freight };
}

function GroupQuickTags({ orders }) {
    const { credit, freight } = aggregateGroupTags(orders);
    if (!credit && !freight) return null;
    return (
        <div className="flex items-center gap-1.5">
            {credit && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#4f46e514", color: "#4f46e5" }}>
                    Credit
                </span>
            )}
            {freight === "included" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#006F8314", color: "#006F83" }}>
                    Freight included
                </span>
            )}
            {freight === "extra" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#f59e0b1a", color: "#b45309" }}>
                    Freight extra
                </span>
            )}
            {freight === "mixed" && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: DOC_C.hairSoft, color: DOC_C.muted }}>
                    Freight varies
                </span>
            )}
        </div>
    );
}

// ---------- shared helpers ----------
function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

// Small pill used next to the Purchase/Sales tab labels — same visual
// language as the bell/nav badges elsewhere, just inline instead of
// absolutely positioned since these are text tabs, not icon buttons.
function TabBadge({ count }) {
    if (!count) return null;
    return (
        <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#d2462b] px-1 align-middle text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
        </span>
    );
}

const PURCHASE_STATUS_TABS = [
    { key: "", label: "All" }, { key: "awaiting_payment", label: "Awaiting payment" },
    { key: "pending_confirmation", label: "Pending" }, { key: "confirmed", label: "Confirmed" },
    { key: "processing", label: "Processing" }, { key: "shipped", label: "Shipped" }, { key: "delivered", label: "Delivered" },
    { key: "cancelled", label: "Cancelled" }, { key: "rejected", label: "Rejected" },
];
const SALES_STATUS_TABS = [
    { key: "", label: "All" }, { key: "pending_confirmation", label: "New" }, { key: "confirmed", label: "Confirmed" },
    { key: "shipped", label: "Shipped" }, { key: "delivered", label: "Delivered" },
    { key: "rejected", label: "Rejected" }, { key: "cancelled", label: "Cancelled" },
];
const TYPE_TABS = [
    { key: "", label: "All orders" }, { key: "standard", label: "Standard" }, { key: "sample", label: "Samples" },
];
const NEXT_ACTION = {
    pending_confirmation: [
        { key: "confirm", label: "Confirm order", fn: confirmSellerOrder, primary: true },
        { key: "reject", label: "Reject", fn: rejectSellerOrder, needsReason: true },
    ],
    confirmed: [
        { key: "ship", label: "Mark as shipped", needsShipModal: true, primary: true },
    ],
    shipped: [
        { key: "deliver", label: "Mark as delivered", fn: deliverSellerOrder, primary: true },
    ],
};
// Shared unread indicator for an individual order row. Renders a number
// badge if there's more than one unread notification queued for this
// order, otherwise a plain dot — either way it sits in the card's corner.
function OrderUnreadMark({ count }) {
    if (!count) return null;
    return count > 1 ? (
        <span className="absolute -right-1.5 -top-1.5 z-10 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#d2462b] px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {count > 9 ? "9+" : count}
        </span>
    ) : (
        <span className="absolute -right-1 -top-1 z-10 h-2.5 w-2.5 rounded-full bg-[#d2462b] ring-2 ring-white" />
    );
}

// ---------- Purchase (buyer) card ----------
function GroupBadge({ groupNumber }) {
    if (!groupNumber) return null;
    return (
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#0B728514", color: "#0B7285" }}>
            Group #{groupNumber}
        </span>
    );
}

function PurchaseOrderCard({ order, idx, onChanged }) {
    const navigate = useNavigate();
    const { purchaseOrderUnreadCounts } = useNotifications();
    const unreadCount = purchaseOrderUnreadCounts.get(String(order.id)) || 0;
    const item = order.items?.[0];
    const extraCount = (order.items?.length || 1) - 1;
    const isSample = order.order_type === "sample";

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3), ease: EASE }}
            onClick={() => navigate(`/orders/${order.id}`)}
            className="relative cursor-pointer rounded-2xl border bg-white p-3.5 transition-shadow duration-150 hover:shadow-sm sm:p-4"
            style={{ borderColor: isSample ? "#7c3aed30" : C.hair }}>
            <OrderUnreadMark count={unreadCount} />

            {/* Row 1: identity — order #, date, status. Pure metadata, de-emphasized. */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <p className="font-mono text-[11.5px] font-bold uppercase tracking-wide" style={{ color: C.ink }}>{order.order_number}</p>
                    <p className="text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                </div>
                <StatusChip status={displayStatus(order)} />
            </div>

            {/* Row 2: at-a-glance facts — sample / group / credit / freight, one language */}
            <div className="mt-2">
                <OrderTagsRow order={order} viewer="buyer" isSample={isSample} groupNumber={order.group_number} />
            </div>
            <OrderTimingNote order={order} viewer="buyer" />

            {/* Row 3: the product — the actual hero content of the card */}
            <div className="mt-3 flex gap-3">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.hair }}>
                    {item?.image_snapshot ? <img src={item.image_snapshot} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-5 w-5" style={{ color: C.muted }} /></div>}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{item?.product_name_snapshot}</p>
                    <p className="mt-0.5 truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {item && <ItemQuantityLine item={item} mutedColor={C.muted} />} · from {order.seller?.display_name}
                        {extraCount > 0 ? ` +${extraCount} more item${extraCount === 1 ? "" : "s"}` : ""}
                    </p>
                    <p className="mt-1.5 text-[15px] font-extrabold tabular-nums tracking-wide" style={{ color: isSample ? "#7c3aed" : C.primary }}>
                        {displayAmount(order.total_amount, { isSample })}
                    </p>
                </div>
            </div>

            {/* Row 4: logistics — delivery / shortfall / transport, only if relevant */}
            {((item && shouldShowDelivery(order, item)) || shouldShowShortfall(order) || (order.buyer_transport_mode && !order.transport_mode)) && (
                <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg px-2.5 py-2" style={{ background: "#fafbfb" }}>
                    {item && shouldShowDelivery(order, item) && <DeliveryEstimate order={order} item={item} />}
                    {shouldShowShortfall(order) && <StockShortfallNote audience="buyer" />}
                    {order.buyer_transport_mode && !order.transport_mode && (
                        <p className="text-[11px] font-bold tracking-wide" style={{ color: C.secondary }}>
                            Requested transport: {transportLabel(order.buyer_transport_mode)}
                        </p>
                    )}
                </div>
            )}

            <PurchaseCardActions order={order} onChanged={onChanged} />
        </motion.div>
    );
}

function PurchaseOrderGroup({ group, startIdx, onChanged }) {
    if (!group.groupId) {
        return <PurchaseOrderCard order={group.orders[0]} idx={startIdx} onChanged={onChanged} />;
    }
    const combinedTotal = group.orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    return (
        <div className="rounded-2xl border-2 border-dashed p-3" style={{ borderColor: "#0B728540" }}>
            <div className="flex items-center justify-between px-1 pb-2.5">
                <div className="flex items-center gap-2">
                    <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: "#0B7285" }}>
                        Order Group {group.groupNumber ? `#${group.groupNumber}` : ""} · {group.orders.length} sellers
                    </p>
                    <GroupQuickTags orders={group.orders} />
                </div>
                <p className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(combinedTotal)}</p>
            </div>
            <div className="flex flex-col gap-3">
                {group.orders.map((o, i) => <PurchaseOrderCard key={o.id} order={o} idx={startIdx + i} onChanged={onChanged} />)}
            </div>
        </div>
    );
}

function PurchaseOrdersView() {
    const { token, profile } = useAuth();
    const [activeStatus, setActiveStatus] = useState("");
    const [activeType, setActiveType] = useState("");

    const fetcher = useCallback(async () => {
        const res = await fetchMyOrders(token, activeStatus || undefined, activeType || undefined);
        if (!res?.success) throw new Error(res?.message || "Couldn't load orders.");
        return res.orders;
    }, [token, activeStatus, activeType]);

    const { orders, loading, reload } = useRealtimeOrders({ channelToken: profile?.notificationChannel, fetcher });


    const groups = useMemo(() => {
        const map = new Map();
        for (const o of orders || []) {
            const key = o.order_group_id || `single:${o.id}`;
            if (!map.has(key)) map.set(key, { groupId: o.order_group_id || null, groupNumber: o.group_number || null, orders: [] });
            map.get(key).orders.push(o);
        }
        return Array.from(map.values()).sort((a, b) => {
            const aLatest = Math.max(...a.orders.map((o) => new Date(o.created_at).getTime()));
            const bLatest = Math.max(...b.orders.map((o) => new Date(o.created_at).getTime()));
            return bLatest - aLatest;
        });
    }, [orders]);

    return (
        <>
            <h2 className="mt-2 text-2xl font-extrabold md:hidden tracking-wide">Purchase Orders</h2>
            <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                {TYPE_TABS.map((t) => (
                    <button key={t.key} onClick={() => setActiveType(t.key)} className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: activeType === t.key ? "#0B7285" : C.hair, background: activeType === t.key ? "#0B7285" : "#fff", color: activeType === t.key ? "#ffffff" : C.muted }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {PURCHASE_STATUS_TABS.map((t) => (
                    <button key={t.key} onClick={() => setActiveStatus(t.key)} className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: activeStatus === t.key ? C.primary : C.hair, background: activeStatus === t.key ? `${C.primary}` : "#fff", color: activeStatus === t.key ? "#ffffff" : C.muted }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="mt-4 flex flex-col gap-3">
                {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                    : groups.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${C.secondary}12`, color: C.secondary }}><ShoppingBag className="h-7 w-7" strokeWidth={1.8} /></span>
                            <h3 className="mt-4 text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>No orders yet</h3>
                            <p className="mt-1.5 max-w-xs text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>Orders you place with sellers will show up here.</p>
                        </div>
                    ) : groups.map((g, i) => (
                        <PurchaseOrderGroup key={g.groupId || g.orders[0].id} group={g} startIdx={i} onChanged={reload} />
                    ))}
            </div>
        </>
    );
}

// ---------- Sales (seller) card ----------
function SalesOrderCard({ order, idx, onAction, sellerTransportOptions, reload }) {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [busy, setBusy] = useState(null);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const { salesOrderUnreadCounts } = useNotifications();
    const unreadCount = salesOrderUnreadCounts.get(String(order.id)) || 0;
    const actions = NEXT_ACTION[order.status] || [];
    const addr = order.shipping_address_snapshot || {};
    const isSample = order.order_type === "sample";
    const firstItem = order.items?.[0];
    const [shipModalOpen, setShipModalOpen] = useState(false);

    const walletDeduction = computeWalletDeduction(order);
    const buyerName = (order.buyer_contact_name || "").trim();
    const deliverName = (addr.contact_name || "").trim();
    const hasDifferentRecipient = deliverName && deliverName.toLowerCase() !== buyerName.toLowerCase();

    const run = async (action) => {
        if (action.needsTransportModal) { setConfirmModalOpen(true); return; }
        if (action.needsShipModal) { setShipModalOpen(true); return; }
        if (action.needsReason) {
            const reason = window.prompt("Reason for rejecting this order (shown to the buyer):");
            if (reason === null) return;
            setBusy(action.key); await onAction(order.id, action, reason); setBusy(null); return;
        }
        setBusy(action.key); await onAction(order.id, action); setBusy(null);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3), ease: EASE }}
            onClick={() => navigate(`/seller/orders/${order.id}`)}
            className="relative cursor-pointer rounded-2xl border bg-white p-3.5 transition-shadow duration-150 hover:shadow-sm sm:p-4"
            style={{ borderColor: isSample ? "#7c3aed30" : C.hair }}>
            <OrderUnreadMark count={unreadCount} />

            {/* Row 1: identity */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <p className="font-mono text-[11.5px] font-bold uppercase tracking-wide" style={{ color: C.ink }}>{order.order_number}</p>
                    <p className="text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                </div>
                <StatusChip status={displayStatus(order)} />
            </div>

            {/* Row 2: at-a-glance facts */}
            <div className="mt-2">
                <OrderTagsRow order={order} viewer="seller" isSample={isSample} groupNumber={order.group_number} />
            </div>
            <OrderTimingNote order={order} viewer="seller" />

            {/* Row 3: logistics, only if relevant */}
            {(shouldShowShortfall(order) || shouldShowDelivery(order, firstItem)) && (
                <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg px-2.5 py-2" style={{ background: "#fafbfb" }}>
                    {shouldShowShortfall(order) && <StockShortfallNote audience="seller" />}
                    {shouldShowDelivery(order, firstItem) && <DeliveryEstimate order={order} item={firstItem} label="Buyer's est. delivery" />}
                </div>
            )}

            {/* Row 4: items — the hero content */}
            <div className="mt-3 flex flex-col gap-2.5">
                {(order.items || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2.5">
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-white" style={{ borderColor: C.hair }}>
                            {item.image_snapshot ? <img src={item.image_snapshot} alt="" className="h-full w-full object-cover" /> : <Package className="m-auto h-4 w-4" style={{ color: C.muted }} />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{item.product_name_snapshot}</p>
                            <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <ItemQuantityLine item={item} mutedColor={C.muted} /> × {displayAmount(item.unit_price, { isSample })}
                            </p>
                        </div>
                        <p className="text-[15px] font-extrabold tabular-nums" style={{ color: C.ink }}>{displayAmount(item.line_total, { isSample })}</p>
                    </div>
                ))}
            </div>

            {/* Row 5: who + where — one compact block, name never repeated */}
            <div className="mt-3 flex items-start justify-between gap-3 border-t pt-3" style={{ borderColor: DOC_C.hair }}>
                <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold tracking-wide" style={{ color: DOC_C.ink }}>{order.buyer_contact_name}</p>
                    {order.buyer_business_name && (
                        <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: DOC_C.muted }}>
                            {order.buyer_business_name}{order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}
                        </p>
                    )}
                    {hasDifferentRecipient && (
                        <p className="mt-1 text-[11.5px] font-bold tracking-wide" style={{ color: DOC_C.ink }}>Deliver to: {addr.contact_name}</p>
                    )}
                    <p className="mt-1 text-[11.5px] font-medium leading-snug tracking-wide" style={{ color: DOC_C.muted }}>
                        {formatDeliveryAddress(addr)}
                    </p>
                </div>
                <ChatWithBuyerButton order={order} className="mt-0.5 shrink-0" />
            </div>

            {order.buyer_notes && (
                <p className="mt-2.5 text-[12px] font-medium italic tracking-wide" style={{ color: C.muted }}>"{order.buyer_notes}"</p>
            )}

            {/* Row 6: money — the other thing sellers actually scan for */}
            <div className="mt-3 flex flex-col items-end gap-1 border-t pt-3" style={{ borderColor: DOC_C.hair }}>
                {isSample ? (
                    <>
                        <TotalRow label="You'll receive" value={`₹${inr(order.seller_payout_amount)}`} bold color="#7c3aed" />
                        <p className="text-right text-[11px] font-medium italic tracking-wide" style={{ color: DOC_C.muted }}>Free sample · no platform fee</p>
                    </>
                ) : (
                    <>
                        <div className="flex w-full max-w-[300px] justify-between text-[15px] font-extrabold tracking-wide" style={{ color: DOC_C.ink }}>
                            <span>You'll receive</span>
                            <span className="tabular-nums" style={{ color: DOC_C.accent }}>₹{inr(order.subtotal_amount)}</span>
                        </div>
                        <p className="max-w-[350px] text-right text-[11.5px] font-medium italic tracking-wide" style={{ color: DOC_C.muted }}>
                            Wallet deduction: ₹{inr(walletDeduction)} ({order.platform_fee_percent}% Promotion & Visibility Budget + 18%GST)
                        </p>
                    </>
                )}
            </div>

            <SellerOrderCardNote order={order} />

            {actions.length > 0 && (
                <div className="mt-3 flex gap-2">
                    {actions.map((a) => (
                        <button key={a.key} disabled={busy !== null} onClick={(e) => { e.stopPropagation(); run(a); }}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wider ${a.primary ? "text-white" : ""}`}
                            style={a.primary ? { background: `linear-gradient(135deg, ${C.secondary} 0%, #047084 100%)` } : { border: `1px solid ${C.hair}`, color: C.primary }}>
                            {busy === a.key ? <Loader2 className="h-4 w-4 animate-spin" /> : a.label}
                        </button>
                    ))}
                </div>
            )}

            {confirmModalOpen && (
                <ConfirmOrderModal open={confirmModalOpen} order={order} sellerTransportOptions={sellerTransportOptions}
                    onClose={() => setConfirmModalOpen(false)}
                    onConfirm={async (formData) => {
                        const res = await confirmSellerOrderWithTransport(token, order.id, formData);
                        if (res?.success) { setConfirmModalOpen(false); reload(); }
                        return res;
                    }}
                />
            )}
            {shipModalOpen && (
                <ShipOrderModal open={shipModalOpen} order={order}
                    onClose={() => setShipModalOpen(false)}
                    onConfirm={async (formData) => {
                        const res = await shipSellerOrderWithTransport(token, order.id, formData);
                        if (res?.success) { setShipModalOpen(false); reload(); }
                        return res;
                    }}
                />
            )}
        </motion.div>
    );
}

function SalesOrdersView() {
    const { token, profile } = useAuth();
    const [activeStatus, setActiveStatus] = useState("");
    const [activeType, setActiveType] = useState("");
    const { markOrderRead } = useNotifications();

    const [sellerTransportOptions, setSellerTransportOptions] = useState([]);

    useEffect(() => {
        fetchSellerOwnTransportOptions(token).then((res) => {
            if (res?.success) setSellerTransportOptions(res.transportOptions || []);
        });
    }, [token]);


    const fetcher = useCallback(async () => {
        const res = await fetchSellerOrders(token, activeStatus || undefined, activeType || undefined);
        if (!res?.success) throw new Error(res?.message || "Couldn't load orders.");
        return res.orders;
    }, [token, activeStatus, activeType]);

    const { orders, loading, reload } = useRealtimeOrders({ channelToken: profile?.notificationChannel, fetcher });
    const handleAction = async (orderId, action, reason) => {
        const res = await action.fn(token, orderId, reason);
        if (res?.success) {
            if (action.key === "reject" || action.key === "deliver") {
                await markOrderRead(orderId, "seller");
            }
            reload();
        } else {
            window.alert(res?.message || "Couldn't update the order.");
        }
    };

    return (
        <>
            <h2 className="mt-2 text-2xl font-extrabold md:hidden tracking-wide">Sales Orders</h2>
            <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                {TYPE_TABS.map((t) => (
                    <button key={t.key} onClick={() => setActiveType(t.key)} className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: activeType === t.key ? "#0B7285" : C.hair, background: activeType === t.key ? "#0B7285" : "#fff", color: activeType === t.key ? "#ffffff" : C.muted }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {SALES_STATUS_TABS.map((t) => (
                    <button key={t.key} onClick={() => setActiveStatus(t.key)} className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={{ borderColor: activeStatus === t.key ? C.primary : C.hair, background: activeStatus === t.key ? `${C.primary}` : "#fff", color: activeStatus === t.key ? "#ffffff" : C.muted }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="mt-4 flex flex-col gap-3">
                {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                    : orders.length === 0 ? (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${C.secondary}12`, color: C.secondary }}><Store className="h-7 w-7" strokeWidth={1.8} /></span>
                            <h3 className="mt-4 text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>No orders yet</h3>
                            <p className="mt-1.5 max-w-xs text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>Orders buyers place on your listings will show up here in real time.</p>
                        </div>
                    ) : orders.map((o, i) => <SalesOrderCard key={o.id} order={o} idx={i} onAction={handleAction} sellerTransportOptions={sellerTransportOptions} reload={reload} />
                    )}
            </div>
        </>
    );
}

// ---------- Merged page ----------
export default function OrdersPage() {
    const navigate = useNavigate();

    const { profile } = useAuth();
    const { purchaseUnreadCount, salesUnreadCount } = useNotifications();

    const isApprovedSeller = profile?.seller_status === "approved";

    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab =
        isApprovedSeller && searchParams.get("tab") === "sales" ? "sales" : "purchases";
    const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

    return (
        <div className="mx-auto min-h-screen max-w-7xl px-2.5 pb-10 pt-3 sm:px-4 lg:px-6">
            {isApprovedSeller && (
                <div className="mt-0 hidden grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                    <button onClick={() => setActiveTab("purchases")}
                        className="relative rounded-md px-4 py-1.5 text-[13px] font-bold tracking-wide transition-colors"
                        style={{ background: activeTab === "purchases" ? C.primary : "transparent", color: activeTab === "purchases" ? "#fff" : C.muted, boxShadow: activeTab === "purchases" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                        Purchase Orders
                        <TabBadge count={purchaseUnreadCount} />
                    </button>
                    <button onClick={() => setActiveTab("sales")}
                        className="relative rounded-md px-4 py-1.5 text-[13px] font-bold tracking-wide transition-colors"
                        style={{ background: activeTab === "sales" ? C.primary : "transparent", color: activeTab === "sales" ? "#fff" : C.muted, boxShadow: activeTab === "sales" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                        Sales Orders
                        <TabBadge count={salesUnreadCount} />
                    </button>
                </div>
            )}

            {activeTab === "sales" && isApprovedSeller ? <SalesOrdersView /> : <PurchaseOrdersView />}

        </div>
    );
}