// pages/OrdersPage.jsx — merges PurchaseOrdersPage + SalesOrdersPage into one
// route with a top-level tab switcher. "Sales" tab is only shown/rendered
// when the current user is an approved seller.
import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Package, Loader2, ShoppingBag, User, Phone, Mail, Store, IndianRupee } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import {
    fetchMyOrders, cancelMyOrder,
    fetchSellerOrders, confirmSellerOrder, rejectSellerOrder, processSellerOrder, shipSellerOrder, deliverSellerOrder, fetchSellerOwnTransportOptions
} from "../utils/api.js";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import { C, EASE } from "../components/catalog/tokens.js";
import { transportLabel } from "../../shared/transportOptions.js";
import {
    StatusChip, SampleBadge, ItemQuantityLine, DeliveryEstimate, displayAmount,
    StockShortfallNote, shouldShowDelivery, shouldShowShortfall,
} from "../components/orders/OrderDisplayHelpers.jsx";
import ConfirmOrderModal from "../components/orders/ConfirmOrderModal.jsx";
import { confirmSellerOrderWithTransport } from "../utils/api.js"; // see api.js patch
import ShipOrderModal from "../components/orders/ShipOrderModal.jsx";
import { shipSellerOrderWithTransport } from "../utils/api.transport.js";

// ---------- shared helpers ----------
function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

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
    { key: "", label: "All" }, { key: "pending_confirmation", label: "Pending" }, { key: "confirmed", label: "Confirmed" },
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

function PurchaseOrderCard({ order, idx, onCancel }) {
    const navigate = useNavigate();
    const [cancelling, setCancelling] = useState(false);
    const canCancel = order.status === "pending_confirmation";
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


            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <p className="font-mono text-[11.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{order.order_number}</p>
                    {isSample && <SampleBadge />}
                    <GroupBadge groupNumber={order.group_number} />
                </div>
                <StatusChip status={order.status} />
            </div>

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

            {(item && shouldShowDelivery(order, item)) || shouldShowShortfall(order) ? (
                <>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                        {item && shouldShowDelivery(order, item) && <DeliveryEstimate order={order} item={item} />}
                        {shouldShowShortfall(order) && <StockShortfallNote audience="buyer" />}
                    </div>
                    {order.buyer_transport_mode && !order.transport_mode && (
                        <p className="mt-1.5 text-[11px] font-bold tracking-wide" style={{ color: C.secondary }}>
                            Requested: {transportLabel(order.buyer_transport_mode)}
                        </p>
                    )}
                </>
            ) : null}



            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: C.hairSoft }}>
                <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    {new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                {canCancel && (
                    <button disabled={cancelling}
                        onClick={(e) => { e.stopPropagation(); (async () => { setCancelling(true); await onCancel(order.id); setCancelling(false); })(); }}
                        className="rounded-lg border px-3 py-1.5 text-[12.5px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.primary }}>
                        {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel order"}
                    </button>
                )}
            </div>
        </motion.div>
    );
}

function PurchaseOrderGroup({ group, startIdx, onCancel }) {
    if (!group.groupId) {
        return <PurchaseOrderCard order={group.orders[0]} idx={startIdx} onCancel={onCancel} />;
    }
    const combinedTotal = group.orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    return (
        <div className="rounded-2xl border-2 border-dashed p-3" style={{ borderColor: "#0B728540" }}>
            <div className="flex items-center justify-between px-1 pb-2.5">
                <p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: "#0B7285" }}>
                    Order Group {group.groupNumber ? `#${group.groupNumber}` : ""} · {group.orders.length} sellers
                </p>
                <p className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(combinedTotal)}</p>
            </div>
            <div className="flex flex-col gap-3">
                {group.orders.map((o, i) => <PurchaseOrderCard key={o.id} order={o} idx={startIdx + i} onCancel={onCancel} />)}
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
    const handleCancel = async (orderId) => { const res = await cancelMyOrder(token, orderId, "Cancelled by buyer"); if (res?.success) reload(); };

    console.log(profile);


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
                        <PurchaseOrderGroup key={g.groupId || g.orders[0].id} group={g} startIdx={i} onCancel={handleCancel} />
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


            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <p className="font-mono text-[11.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{order.order_number}</p>
                    {isSample && <SampleBadge />}
                    {order.group_number && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#0B728514", color: "#0B7285" }}>
                            Group #{order.group_number}
                        </span>
                    )}
                </div>
                <StatusChip status={order.status} />
            </div>

            {(shouldShowShortfall(order) || shouldShowDelivery(order, firstItem)) && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                    {shouldShowShortfall(order) && <StockShortfallNote audience="seller" />}
                    {shouldShowDelivery(order, firstItem) && <DeliveryEstimate order={order} item={firstItem} label="Buyer's est. delivery" />}
                </div>
            )}

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

            <div className="mt-3 rounded-xl border p-2.5" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                <p className="flex items-center gap-1 text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                    <User className="h-3 w-3" /> {order.buyer_contact_name}
                </p>
                {order.buyer_business_name && <p className="text-[11.5px] font-semibold tracking-wider" style={{ color: C.muted }}>{order.buyer_business_name}{order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.buyer_contact_phone}</span>
                    {order.buyer_contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{order.buyer_contact_email}</span>}
                </p>
                <p className="mt-2 text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>
                    Ship to: {addr.contact_name}, {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}, {addr.city}, {addr.state} - {addr.pincode}
                </p>
                {order.buyer_notes && <p className="mt-2 text-[12px] font-medium italic tracking-wide" style={{ color: C.muted }}>"{order.buyer_notes}"</p>}
            </div>

            <div className="mt-2.5 flex flex-col gap-2 rounded-xl p-3" style={{ background: isSample ? "#7c3aed08" : `${C.primary}08` }}>
                {isSample ? (
                    <div className="flex items-center justify-between">
                        <span className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>Free sample · no platform fee</span>
                        <p className="flex items-center gap-0.5 text-[13.5px] font-extrabold tabular-nums" style={{ color: "#7c3aed" }}>
                            <IndianRupee className="h-3.5 w-3.5" />{inr(order.seller_payout_amount)}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>You'll receive</span>
                            <p className="flex items-center gap-0.5 text-[16px] font-extrabold tabular-nums" style={{ color: C.primary }}>
                                <IndianRupee className="h-3.5 w-3.5" />{inr(order.subtotal_amount)}
                            </p>
                        </div>
                        <p className="text-[13px] italic font-medium tracking-wide" style={{ color: C.muted }}>
                            Wallet deduction: ₹{inr(round2(order.subtotal_amount * order.platform_fee_percent / 100 * 1.18))} (0.25% commission + 18%GST)
                        </p>
                    </>
                )}
            </div>

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
                <ConfirmOrderModal
                    open={confirmModalOpen}
                    order={order}
                    sellerTransportOptions={sellerTransportOptions} // ADD
                    onClose={() => setConfirmModalOpen(false)}
                    onConfirm={async (formData) => {
                        const res = await confirmSellerOrderWithTransport(token, order.id, formData);
                        if (res?.success) { setConfirmModalOpen(false); reload(); }
                        return res;
                    }}
                />
            )}
            {shipModalOpen && (
                <ShipOrderModal
                    open={shipModalOpen}
                    order={order}
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

    // TODO: confirm this matches your AuthContext's actual field for seller
    // approval status (e.g. profile?.seller?.status === "approved", or a
    // boolean flag). Adjust the condition below to match.
    const isApprovedSeller = profile?.seller_status === "approved";

    const [activeTab, setActiveTab] = useState("purchases"); // "purchases" | "sales"

    return (
        <div className="mx-auto min-h-screen max-w-7xl px-2.5 pb-10 pt-3 sm:px-4 lg:px-6">
            {isApprovedSeller && (
                <div className="mt-0 grid grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }}>
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