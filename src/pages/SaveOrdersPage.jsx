// src/pages/SaveOrdersPage.jsx — buyer "My orders" (PURCHASE orders only) in the Save (sh-) UI.
// Same data/actions as the old OrdersPage purchase view: fetchMyOrders + useRealtimeOrders,
// grouping by order_group_id, purchaseOrderUnreadCounts, PurchaseCardActions. Cards open /orders/:id.
// Unpaid ("awaiting_payment") orders get a "Complete payment" button; orders that belong to a cart
// group get ONE button on the group header (the whole cart is paid in one payment).
// Render it inside the same ".sv" wrapper as SaveHomePage.
import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Truck, CreditCard, Store } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { fetchMyOrders } from "../utils/api.js";
import PurchaseCardActions from "../components/orders/PurchaseCardActions.jsx";
import ResumePaymentButton from "../components/orders/ResumePaymentButton.jsx";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import PriceChangeNotice, { OrderBlockedNotice } from "../components/orders/PriceChangeNotice.jsx";
import { orderPriceInfo, groupPriceInfo } from "../utils/orderPrice.js";
import { transportLabel } from "../../shared/transportOptions.js";
import {
    displayStatus, ItemQuantityLine, DeliveryEstimate, displayAmount, StockShortfallNote,
    shouldShowDelivery, shouldShowShortfall, getPaymentTerms, orderFreightState,
} from "../components/orders/OrderDisplayHelpers.jsx";
import OrderTimingNote from "../components/orders/OrderTimingNote.jsx";

const EASE = [0.16, 1, 0.3, 1];
const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const shortDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const STATUS_LABEL = {
    pending_confirmation: "Pending", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped",
    delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled", awaiting_payment: "Awaiting payment",
    not_accepted: "Not accepted",
};
const statusText = (s) => STATUS_LABEL[s] || String(s || "").replace(/_/g, " ");

const STATUS_TABS = [
    ["", "All"], ["awaiting_payment", "Awaiting payment"], ["pending_confirmation", "Pending"], ["confirmed", "Confirmed"],
    ["processing", "Processing"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["rejected", "Rejected"],
];
const TYPE_TABS = [["", "All orders"], ["standard", "Standard"], ["sample", "Samples"]];

const isUnpaid = (o) => o?.status === "awaiting_payment";

/* ---------- tags ---------- */
function OrderTags({ order, isSample }) {
    const credit = getPaymentTerms(order) === "credit";
    const fr = orderFreightState(order);
    if (!credit && !fr && !isSample && !order.group_number) return null;
    return (
        <div className="sh-tags">
            {isSample && <span className="sh-tg v"><Package size={13} />Sample</span>}
            {order.group_number && <span className="sh-tg t">Group #{order.group_number}</span>}
            {credit && <span className="sh-tg b"><CreditCard size={13} />Purchased on credit</span>}
            {fr === "included" && <span className="sh-tg g"><Truck size={13} />Freight included</span>}
            {fr === "extra" && <span className="sh-tg o"><Truck size={13} />You pay delivery charges</span>}
        </div>
    );
}

function GroupTags({ orders }) {
    const credit = orders.some((o) => getPaymentTerms(o) === "credit");
    const states = [...new Set(orders.map((o) => orderFreightState(o)).filter(Boolean))];
    const freight = states.length === 0 ? null : states.length > 1 ? "mixed" : states[0];
    if (!credit && !freight) return null;
    return (
        <div className="sh-tags" style={{ margin: "6px 0 0" }}>
            {credit && <span className="sh-tg b"><CreditCard size={13} />Credit</span>}
            {freight === "included" && <span className="sh-tg g"><Truck size={13} />Freight included</span>}
            {freight === "extra" && <span className="sh-tg o"><Truck size={13} />Freight extra</span>}
            {freight === "mixed" && <span className="sh-tg"><Truck size={13} />Freight varies</span>}
        </div>
    );
}

/* ---------- order card ---------- */
function OrderCard({ order, idx, onChanged, inGroup = false }) {
    const navigate = useNavigate();
    const { purchaseOrderUnreadCounts } = useNotifications();
    const unread = purchaseOrderUnreadCounts?.get(String(order.id)) || 0;
    const item = order.items?.[0];
    const extraCount = (order.items?.length || 1) - 1;
    const isSample = order.order_type === "sample";
    const status = displayStatus(order);
    const open = () => navigate(`/save/orders/${order.id}`);

    const price = orderPriceInfo(order); // null unless awaiting payment
    const amount = price ? price.current : order.total_amount;
    const payBlocked = !!price?.blocked;

    const showDelivery = !!item && shouldShowDelivery(order, item);
    const showShortfall = shouldShowShortfall(order);
    const showRequested = !!order.buyer_transport_mode && !order.transport_mode;
    const showPay = isUnpaid(order) && !inGroup && !payBlocked;

    return (
        <motion.article
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3), ease: EASE }}
            className={`sh-oc${isSample ? " smp" : ""}`}
            role="link" tabIndex={0} onClick={open}
            onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        >
            {unread > 0 && <span className="sh-ub">{unread > 9 ? "9+" : unread}</span>}

            <div className="sh-och">
                <span className="sh-oid">{order.order_number}</span>
                <small>{shortDate(order.created_at)}</small>
                <span className={`sh-st ${status}`}><i />{statusText(status)}</span>
            </div>

            <OrderTags order={order} isSample={isSample} />
            <div className="sh-tw" onClick={stop}><OrderTimingNote order={order} viewer="buyer" /></div>

            {!inGroup && price?.changed && (
                <div className="sh-tw" onClick={stop}><PriceChangeNotice id={order.id} from={price.from} to={price.to} /></div>
            )}
            {!inGroup && price?.blocked && (
                <div className="sh-tw" onClick={stop}><OrderBlockedNotice code={price.blocked.code} product={price.blocked.product} /></div>
            )}

            <div className="sh-ocp">
                <div className="sh-th">
                    {item?.image_snapshot ? <img src={item.image_snapshot} alt="" loading="lazy" /> : <Package size={22} />}
                </div>
                <div className="sh-in">
                    <p className="sh-rn">{item?.product_name_snapshot}</p>
                    <p className="sh-ocs">
                        {item && <ItemQuantityLine item={item} mutedColor="var(--mute)" />}
                        {order.seller?.display_name ? ` · from ${order.seller.display_name}` : ""}
                        {extraCount > 0 ? ` +${extraCount} more item${extraCount === 1 ? "" : "s"}` : ""}
                    </p>
                </div>
                <b className={`sh-oca${isSample ? " smp" : ""}`}>{displayAmount(amount, { isSample })}</b>
            </div>

            {(showDelivery || showShortfall || showRequested) && (
                <div className="sh-olg sh-tw" onClick={stop}>
                    {showDelivery && <DeliveryEstimate order={order} item={item} />}
                    {showShortfall && <StockShortfallNote audience="buyer" />}
                    {showRequested && <p className="sh-olt">Requested transport: {transportLabel(order.buyer_transport_mode)}</p>}
                </div>
            )}

            <div className="sh-tw sh-oa" onClick={stop} style={showPay ? { display: "flex", flexDirection: "column", gap: 10 } : undefined}>
                {showPay && (
                    <ResumePaymentButton
                        orderId={order.id}
                        groupId={order.order_group_id || null}
                        label={`Complete payment · ₹${inr(amount)}`}
                        expectedTotal={price?.current}
                        onPriceChanged={() => onChanged?.({ silent: true })}
                    />
                )}
                <PurchaseCardActions order={order} onChanged={onChanged} />
            </div>
        </motion.article>
    );
}
function stop(e) { e.stopPropagation(); }

function OrderGroup({ group, startIdx, onChanged }) {
    if (!group.groupId) return <OrderCard order={group.orders[0]} idx={startIdx} onChanged={onChanged} />;
    const gp = groupPriceInfo(group.orders);
    const unpaid = group.orders.filter(isUnpaid);
    return (
        <div className="sh-grp">
            <div className="sh-grh">
                <div>
                    <p>Order group {group.groupNumber ? `#${group.groupNumber}` : ""} · {group.orders.length} sellers</p>
                    <GroupTags orders={group.orders} />
                </div>
                <b>₹{inr(gp.combined)}</b>
            </div>
            {(gp.changed || gp.blocked) && (
                <div style={{ padding: "0 14px" }}>
                    {gp.changed && <PriceChangeNotice id={group.groupId} from={gp.from} to={gp.to} />}
                    {gp.blocked && <OrderBlockedNotice code={gp.blocked.code} product={gp.blocked.product} />}
                </div>
            )}
            {unpaid.length > 0 && !gp.blocked && (
                <div style={{ padding: "10px 14px 12px" }}>
                    <ResumePaymentButton
                        orderId={unpaid[0].id}
                        groupId={group.groupId}
                        label={`Complete payment · ₹${inr(gp.unpaidTotal)}`}
                        expectedTotal={gp.unpaidTotal}
                        onPriceChanged={() => onChanged?.({ silent: true })}
                    />
                </div>
            )}
            <div className="sh-og">
                {group.orders.map((o, i) => <OrderCard key={o.id} order={o} idx={startIdx + i} onChanged={onChanged} inGroup />)}
            </div>
        </div>
    );
}

/* ---------- page ---------- */
export default function SaveOrdersPage() {
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

    const total = (orders || []).length;
    const filtered = !!(activeStatus || activeType);

    return (
        <div className="sh-w">
            <div className="sh-sec" style={{ marginTop: 22 }}>
                <div>
                    <h1 className="sh-pt">My orders</h1>
                    <p className="sh-sub" style={{ marginTop: 4 }}>Track and review everything you have bought.</p>
                </div>
                {!loading && <span className="sh-cntp">{total} order{total === 1 ? "" : "s"}</span>}
            </div>

            <div className="sh-tb">
                <div className="sh-seg">
                    {TYPE_TABS.map(([k, l]) => <button key={k || "all"} type="button" aria-pressed={activeType === k} onClick={() => setActiveType(k)}>{l}</button>)}
                </div>
                <div className="sh-chs">
                    {STATUS_TABS.map(([k, l]) => <button key={k || "all"} type="button" aria-pressed={activeStatus === k} onClick={() => setActiveStatus(k)}>{l}</button>)}
                </div>
            </div>

            {loading ? (
                <div className="sh-grid" aria-busy="true">{[0, 1, 2].map((i) => <div className="sh-sk tall" key={i} />)}</div>
            ) : groups.length === 0 ? (
                <div className="sh-emp">
                    <Store size={30} style={{ margin: "0 auto 10px", display: "block" }} />
                    <b>{filtered ? "No orders match these filters" : "No orders yet"}</b>
                    {filtered ? "Try a different status or type." : "Orders you place with sellers will show up here."}
                </div>
            ) : (
                <div className="sh-og top">
                    <AnimatePresence initial={false}>
                        {groups.map((g, i) => (
                            <OrderGroup key={g.groupId || g.orders[0].id} group={g} startIdx={i} onChanged={reload} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}