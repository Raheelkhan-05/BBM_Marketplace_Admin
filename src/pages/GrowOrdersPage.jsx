// src/pages/GrowOrdersPage.jsx — sales orders in the new UI (same data/actions as OrdersPage "Sales" tab).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import {
    fetchSellerOrders, confirmSellerOrder, rejectSellerOrder, deliverSellerOrder,
} from "../utils/api.js";
import { shipSellerOrderWithTransport } from "../utils/api.transport.js";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import GrowShipSheet from "../components/growSeller/GrowShipSheet.jsx";
import {
    ItemQuantityLine, ChatWithBuyerButton, computeWalletDeduction, getPaymentTerms, orderFreightState,
} from "../components/orders/OrderDisplayHelpers.jsx";
import Ic from "../components/growSeller/Ic.jsx";
import { Thumb, Empty } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import { inr, shortDate } from "../components/growSeller/sellerHelpers.js";

export const STATUS_LABEL = {
    pending_confirmation: "New", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped",
    delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled", awaiting_payment: "Awaiting payment",
};
const STATUS_TABS = [
    ["", "All"], ["pending_confirmation", "New"], ["confirmed", "Confirmed"], ["shipped", "Shipped"],
    ["delivered", "Delivered"], ["rejected", "Rejected"], ["cancelled", "Cancelled"],
];
const TYPE_TABS = [["", "All orders"], ["standard", "Standard"], ["sample", "Samples"]];

export const NEXT_ACTION = {
    pending_confirmation: [
        { key: "confirm", label: "Confirm order", fn: confirmSellerOrder, cls: "go" },
        { key: "reject", label: "Reject", fn: rejectSellerOrder, needsReason: true, cls: "" },
    ],
    confirmed: [{ key: "ship", label: "Mark as shipped", needsShipModal: true, cls: "go" }],
    shipped: [{ key: "deliver", label: "Mark delivered", fn: deliverSellerOrder, cls: "gr" }],
};

export function OrderTags({ order }) {
    const credit = getPaymentTerms(order) === "credit";
    const fr = orderFreightState(order);
    return (
        <div className="tags">
            {credit
                ? <span className="tg b"><Ic n="card" />Purchased on credit · Buyer pays later</span>
                : <span className="tg g"><Ic n="wallet" />Paid in advance</span>}
            {fr === "included" && <span className="tg g"><Ic n="truck" />Freight included</span>}
            {fr === "extra" && <span className="tg o"><Ic n="truck" />Buyer pays delivery charges</span>}
            {order.order_type === "sample" && <span className="tg v"><Ic n="box" />Sample</span>}
        </div>
    );
}

function OrderCard({ order, busy, onAction, onOpen, unread }) {
    const isSample = order.order_type === "sample";
    const actions = NEXT_ACTION[order.status] || [];
    const addr = order.shipping_address_snapshot || {};
    const loc = [addr.city, addr.state].filter(Boolean).join(", ");
    const money = (n) => `₹${inr(n)}`;
    return (
        <article className="card" style={{ cursor: "pointer", position: "relative" }} onClick={() => onOpen(order.id)}>
            {unread > 0 && (
                <span
                    className="bdg"
                    aria-label="Unread updates"
                    style={{
                        top: -4, right: -4, width: 12, height: 12, minWidth: 0, padding: 0,
                        fontSize: 0, borderRadius: "50%", border: "2px solid var(--s)",
                    }}
                />
            )}
            <div className="oh">
                <span className="oid">{order.order_number}</span>
                <small>{shortDate(order.created_at)}</small>
                <span className={`stt ${order.status}`}>{STATUS_LABEL[order.status] || order.status}</span>
            </div>
            <OrderTags order={order} />
            {(order.items || []).map((item) => (
                <div className="it" key={item.id}>
                    <Thumb src={item.image_snapshot} name={item.product_name_snapshot} />
                    <div>
                        <b>{item.product_name_snapshot}</b>
                        <small><ItemQuantityLine item={item} mutedColor="var(--mute)" /> × {isSample ? "Free" : money(item.unit_price)}</small>
                    </div>
                    <b className="am">{isSample ? "Free" : money(item.line_total)}</b>
                </div>
            ))}
            <div className="by">
                <b>{order.buyer_contact_name}</b>
                <small>{[order.buyer_business_name, loc].filter(Boolean).join(" · ")}</small>
            </div>
            <div className="rcv">
                <div>
                    <small>You'll receive</small>
                    <b>{money(isSample ? order.seller_payout_amount : order.subtotal_amount)}</b>
                </div>
                <div onClick={(e) => e.stopPropagation()}><ChatWithBuyerButton order={order} /></div>
            </div>
            <p className="wd">
                {isSample
                    ? "Free sample · no platform fee"
                    : `Wallet deduction: ₹${inr(computeWalletDeduction(order))} (${order.platform_fee_percent}% Promotion & Visibility Budget + 18% GST)`}
            </p>
            {actions.length > 0 && (
                <div className="actbar" style={{ marginTop: 14 }}>
                    {actions.map((a) => (
                        <button key={a.key} type="button" className={`bt ${a.cls}`} disabled={busy !== null}
                            onClick={(e) => { e.stopPropagation(); onAction(order, a); }}>
                            {busy === `${order.id}:${a.key}` ? <Ic n="spin" /> : a.label}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
}

export default function GrowOrdersPage() {
    const nav = useNavigate();
    const { token, profile } = useAuth();
    const { say } = useGrowSeller();
    const { salesOrderUnreadCounts, markOrderRead } = useNotifications();
    // markOrderHandled: tells the Console this order was decided here (its buttons disappear there).
    // ordersVersion: bumps when an order is decided from the Console, so this list refreshes at once.
    const { markOrderHandled, ordersVersion } = useNotificationActions();
    const [status, setStatus] = useState("");
    const [type, setType] = useState("");
    const [busy, setBusy] = useState(null);
    const [shipFor, setShipFor] = useState(null);

    const fetcher = useCallback(async () => {
        const res = await fetchSellerOrders(token, status || undefined, type || undefined);
        if (!res?.success) throw new Error(res?.message || "Couldn't load orders.");
        return res.orders;
    }, [token, status, type]);
    const { orders, loading, reload } = useRealtimeOrders({ channelToken: profile?.notificationChannel, fetcher });

    useEffect(() => { window.scrollTo({ top: 0 }); }, []);

    // An order was confirmed / rejected from the Console: reload the list (not on first render).
    const seenVersion = useRef(ordersVersion);
    useEffect(() => {
        if (ordersVersion === seenVersion.current) return;
        seenVersion.current = ordersVersion;
        reload();
    }, [ordersVersion, reload]);

    const onAction = async (order, a) => {
        if (a.needsShipModal) { setShipFor(order); return; }
        let reason;
        if (a.needsReason) {
            reason = window.prompt("Reason for rejecting this order (shown to the buyer):");
            if (reason === null) return;
        }
        setBusy(`${order.id}:${a.key}`);
        const res = await a.fn(token, order.id, reason);
        setBusy(null);
        if (res?.success) {
            if (a.key === "reject" || a.key === "deliver") await markOrderRead(order.id, "seller");
            if (a.key === "confirm" || a.key === "reject") markOrderHandled(order.id, a.key === "confirm" ? "confirmed" : "rejected");
            say(a.key === "confirm" ? "Order confirmed" : a.key === "reject" ? "Order rejected" : "Marked as delivered");
            reload();
        } else say(res?.message || "Couldn't update the order.");
    };

    const list = orders || [];
    return (
        <div className="v">
            <h2 className="h2" style={{ marginTop: 22 }}>Sales orders</h2>
            <p className="sub2">Confirm, dispatch and deliver, all in one place.</p>
            <div className="tb" style={{ marginTop: 14 }}>
                <div className="seg">
                    {TYPE_TABS.map(([k, l]) => <button key={k || "all"} type="button" aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>)}
                </div>
            </div>
            <div className="chs">
                {STATUS_TABS.map(([k, l]) => <button key={k || "all"} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}
            </div>

            {loading && !list.length ? (
                <div className="grid c2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="sk tall" />)}</div>
            ) : (
                <div className="grid c2">
                    {list.map((o) => (
                        <OrderCard key={o.id} order={o} busy={busy} onAction={onAction}
                            onOpen={(id) => nav(`/grow/orders/${id}`)}
                            unread={salesOrderUnreadCounts?.get(String(o.id)) || 0} />
                    ))}
                    {!list.length && <Empty title="No orders here" text="Orders will appear as buyers place them." />}
                </div>
            )}

            {shipFor && (
                <GrowShipSheet open order={shipFor} onClose={() => setShipFor(null)}
                    onConfirm={async (formData) => {
                        const res = await shipSellerOrderWithTransport(token, shipFor.id, formData);
                        if (res?.success) { setShipFor(null); say("Marked as shipped"); reload(); }
                        return res;
                    }} />
            )}
        </div>
    );
}