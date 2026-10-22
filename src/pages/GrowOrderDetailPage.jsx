// src/pages/GrowOrderDetailPage.jsx — sales order detail in the new UI (same data/actions as SellerOrderDetailPage).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import { fetchSellerOrderById, fetchSellerOwnGstin } from "../utils/api.js";
import { shipSellerOrderWithTransport } from "../utils/api.transport.js";
import useRealtimeOrder from "../hooks/useRealtimeOrder.js";
import GrowShipSheet from "../components/growSeller/GrowShipSheet.jsx";
import DisputePanel from "../components/orders/DisputePanel.jsx";
import TransportInfoCard from "../components/orders/TransportInfoCard.jsx";
import PurchaseOrderDocument from "../components/orders/PurchaseOrderDocument.jsx";
import OrderTimingNote from "../components/orders/OrderTimingNote.jsx";
import {
    ItemQuantityLine, DeliveryEstimate, StockShortfallNote, shouldShowDelivery, shouldShowShortfall,
    PaymentTermsBanner, FreightNotice, ChatWithBuyerButton, computeWalletDeduction,
} from "../components/orders/OrderDisplayHelpers.jsx";
import Ic from "../components/growSeller/Ic.jsx";
import { Thumb, Empty } from "../components/growSeller/ui.jsx";
import { useGrowSeller } from "../context/GrowSellerContext.js";
import { inr, dateTime } from "../components/growSeller/sellerHelpers.js";
import { NEXT_ACTION, OrderTags, STATUS_LABEL } from "./GrowOrdersPage.jsx";

const STEPS = ["pending_confirmation", "confirmed", "shipped", "delivered"];

function Timeline({ status, events, autoRejected }) {
    const bad = status === "cancelled" || status === "rejected";
    const cur = STEPS.indexOf(status);
    return (
        <div className="tl">
            {STEPS.map((s, i) => {
                const done = !bad && i <= cur;
                const ev = events.find((e) => e.to_status === s);
                return (
                    <div key={s} className={done ? (i === cur ? "done cur" : "done") : "todo"}>
                        <div className="dot">
                            <b>{done && <Ic n="check" />}</b>
                            {i < STEPS.length - 1 && <s />}
                        </div>
                        <div className="tx2" style={{ paddingBottom: i < STEPS.length - 1 ? 14 : 0 }}>
                            <b>{STATUS_LABEL[s]}</b>
                            {ev?.created_at && <small>{dateTime(ev.created_at)}</small>}
                        </div>
                    </div>
                );
            })}
            {bad && (
                <div className="bad"><Ic n="x" />
                    {autoRejected ? "Not accepted: you didn't respond in 24 hours" : status === "cancelled" ? "Cancelled by buyer" : "Rejected"}
                </div>
            )}
        </div>
    );
}

export default function GrowOrderDetailPage() {
    const { id } = useParams();
    const nav = useNavigate();
    const { token, profile } = useAuth();
    const { say } = useGrowSeller();
    const { markOrderRead } = useNotifications();
    // markOrderHandled: tells the Console this order was decided here (its buttons disappear there).
    // ordersVersion: bumps when an order is decided from the Console, so this page refreshes at once.
    const { markOrderHandled, ordersVersion } = useNotificationActions();
    const [busy, setBusy] = useState(null);
    const [shipOpen, setShipOpen] = useState(false);
    const [gstin, setGstin] = useState(null);

    useEffect(() => { fetchSellerOwnGstin(token).then((r) => r?.success && setGstin(r.gstin || null)); }, [token]);

    const fetcher = useCallback((orderId) => fetchSellerOrderById(token, orderId), [token]);
    const { order, events, loading, reload } = useRealtimeOrder({ orderId: id, fetcher });

    // Clear this order's unread notifications when the page opens, and again if
    // a new one arrives while the page is open (markOrderRead changes whenever
    // `notifications` changes, so this re-runs and no-ops when nothing is unread).
    useEffect(() => {
        if (order?.id) markOrderRead(order.id, "seller");
    }, [order?.id, markOrderRead]);

    // The order was confirmed / rejected from the Console: reload it (not on first render).
    const seenVersion = useRef(ordersVersion);
    useEffect(() => {
        if (ordersVersion === seenVersion.current) return;
        seenVersion.current = ordersVersion;
        reload();
    }, [ordersVersion, reload]);

    if (loading && !order) return <div className="v"><div className="sk line" style={{ marginTop: 28, width: "55%" }} /><div className="sk tall" style={{ marginTop: 18 }} /></div>;
    if (!order) return (
        <div className="v" style={{ marginTop: 28 }}>
            <Empty title="Order not found" text="">
                <br /><button className="bt go" type="button" onClick={() => nav("/grow/orders")}>Back to orders</button>
            </Empty>
        </div>
    );

    const isSample = order.order_type === "sample";
    const first = order.items?.[0];
    const addr = order.shipping_address_snapshot || {};
    const actions = NEXT_ACTION[order.status] || [];
    const delivered = events.find((e) => e.to_status === "delivered");
    const vendorOverride = {
        display_name: profile?.display_name || profile?.shop_name || profile?.business_name || null,
        city: profile?.city || null, state: profile?.state || null, gstin,
    };

    const run = async (a) => {
        if (a.needsShipModal) { setShipOpen(true); return; }
        let reason;
        if (a.needsReason) {
            reason = window.prompt("Reason for rejecting this order (shown to the buyer):");
            if (reason === null) return;
        }
        setBusy(a.key);
        const res = await a.fn(token, id, reason);
        setBusy(null);
        if (res?.success) {
            if (a.key === "reject" || a.key === "deliver") await markOrderRead(id, "seller");
            if (a.key === "confirm" || a.key === "reject") markOrderHandled(id, a.key === "confirm" ? "confirmed" : "rejected");
            say(a.key === "confirm" ? "Order confirmed" : a.key === "reject" ? "Order rejected" : "Marked as delivered");
            reload();
        } else say(res?.message || "Couldn't update the order.");
    };

    return (
        <div className="v">
            <div className="back">
                <button className="ib" type="button" aria-label="Back" onClick={() => nav("/grow/orders")}><Ic n="back" /></button>
                <div className="hh">
                    <h1>{order.order_number}</h1>
                    <div className="live"><i />Live</div>
                </div>
                <span className={`stt ${order.status}`} style={{ marginLeft: 0 }}>{STATUS_LABEL[order.status] || order.status}</span>
            </div>

            <div className="dgrid">
                <div className="dcol">
                    <div className="card">
                        <div className="ctl">Payment & freight</div>
                        <OrderTags order={order} />
                        <div className="ltb"><PaymentTermsBanner order={order} viewer="seller" standalone /><FreightNotice order={order} viewer="seller" className="mt-3" /></div>
                        <div className="ltb"><OrderTimingNote order={order} viewer="seller" /></div>
                    </div>

                    <div className="card">
                        <div className="ctl">Order status</div>
                        <Timeline status={order.status} events={events} autoRejected={!!order.auto_rejected_at} />
                    </div>

                    {(shouldShowDelivery(order, first) || shouldShowShortfall(order)) && (
                        <div className="card">
                            <div className="ctl">Fulfilment</div>
                            <div className="ltb stack">
                                {shouldShowShortfall(order) && <StockShortfallNote audience="seller" />}
                                {shouldShowDelivery(order, first) && <DeliveryEstimate order={order} item={first} deliveredAt={delivered?.created_at} label="Buyer's est. delivery" />}
                            </div>
                        </div>
                    )}

                    <div className="ltb"><TransportInfoCard order={order} /></div>
                </div>

                <div className="dcol">
                    <div className="card">
                        <div className="ctl">Items</div>
                        {(order.items || []).map((item) => (
                            <div className="it" key={item.id}>
                                <Thumb src={item.image_snapshot} name={item.product_name_snapshot} />
                                <div>
                                    <b>{item.product_name_snapshot}</b>
                                    <small>@ {isSample ? "Free" : `₹${inr(item.unit_price)}`} · <ItemQuantityLine item={item} mutedColor="var(--mute)" /></small>
                                </div>
                                <b className="am">{isSample ? "Free" : `₹${inr(item.line_total)}`}</b>
                            </div>
                        ))}
                        <div className="rcv">
                            <div><small>You'll receive</small><b>₹{inr(isSample ? order.seller_payout_amount : order.subtotal_amount)}</b></div>
                        </div>
                        <p className="wd">
                            {isSample ? "Free sample · no platform fee"
                                : `Wallet deduction: ₹${inr(computeWalletDeduction(order))} (${order.platform_fee_percent}% Promotion & Visibility Budget + 18% GST)`}
                        </p>
                    </div>

                    <div className="card by">
                        <div className="ctl">Buyer</div>
                        <b>{order.buyer_contact_name}</b>
                        {order.buyer_business_name && <small>{order.buyer_business_name}{order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}</small>}
                        {addr.contact_name && <small style={{ marginTop: 6 }}>Deliver to: {addr.contact_name}</small>}
                        <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}><ChatWithBuyerButton order={order} /></div>
                        {order.buyer_notes && <p className="quote">"{order.buyer_notes}"</p>}
                    </div>

                    <div className="doc"><PurchaseOrderDocument order={order} variant="seller" vendorOverride={vendorOverride} /></div>
                    <div className="ltb"><DisputePanel order={order} viewer="seller" onChanged={reload} /></div>
                </div>
            </div>

            {actions.length > 0 && (
                <div className="actbar" style={{ marginTop: 18 }}>
                    {actions.map((a) => (
                        <button key={a.key} type="button" className={`bt ${a.cls}`} disabled={busy !== null} onClick={() => run(a)}>
                            {busy === a.key ? <Ic n="spin" /> : a.label}
                        </button>
                    ))}
                </div>
            )}

            {shipOpen && (
                <GrowShipSheet open order={order} onClose={() => setShipOpen(false)}
                    onConfirm={async (formData) => {
                        const res = await shipSellerOrderWithTransport(token, id, formData);
                        if (res?.success) { setShipOpen(false); say("Marked as shipped"); reload(); }
                        return res;
                    }} />
            )}
        </div>
    );
}