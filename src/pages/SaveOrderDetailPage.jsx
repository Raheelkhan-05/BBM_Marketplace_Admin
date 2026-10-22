// src/pages/SaveOrderDetailPage.jsx — buyer purchase-order detail in the Save (sh-) UI.
// Same data/actions as the old OrderDetailPage: fetchOrderById + useRealtimeOrder, markOrderRead(id, "buyer") on open,
// DisputePanel, CancelOrderControl, TransportInfoCard, PurchaseOrderDocument. Only the presentation changed.
// Unpaid orders ("awaiting_payment") show a "Complete your payment" card at the top.
// Layout mirrors GrowOrderDetailPage (two columns on wide screens). Render inside the same ".sv" wrapper as SaveHomePage.
import { useCallback, useEffect } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ArrowLeft, Package, Store, Check, X, Truck, CreditCard } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { fetchOrderById } from "../utils/api.js";
import DisputePanel from "../components/orders/DisputePanel.jsx";
import { CancelOrderControl } from "../components/orders/PurchaseCardActions.jsx";
import ResumePaymentButton from "../components/orders/ResumePaymentButton.jsx";
import useRealtimeOrder from "../hooks/useRealtimeOrder.js";
import TransportInfoCard from "../components/orders/TransportInfoCard.jsx";
import PurchaseOrderDocument from "../components/orders/PurchaseOrderDocument.jsx";
import PriceChangeNotice, { OrderBlockedNotice } from "../components/orders/PriceChangeNotice.jsx";
import { orderPriceInfo, applyRepricedView } from "../utils/orderPrice.js";
import OrderTimingNote from "../components/orders/OrderTimingNote.jsx";
import {
    displayStatus, ItemQuantityLine, DeliveryEstimate, displayAmount, StockShortfallNote,
    shouldShowDelivery, shouldShowShortfall, PaymentTermsBanner, FreightNotice, getPaymentTerms, orderFreightState,
} from "../components/orders/OrderDisplayHelpers.jsx";

const STEPS = ["pending_confirmation", "confirmed", "shipped", "delivered"];
const STATUS_LABEL = {
    pending_confirmation: "Pending", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped",
    delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled", awaiting_payment: "Awaiting payment",
    not_accepted: "Not accepted",
};
const statusText = (s) => STATUS_LABEL[s] || String(s || "").replace(/_/g, " ");
const inr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Timeline({ status, events, autoRejected }) {
    const bad = status === "cancelled" || status === "rejected";
    const cur = STEPS.indexOf(status);
    return (
        <div className="sh-tln">
            {STEPS.map((s, i) => {
                const done = !bad && i <= cur;
                const ev = events.find((e) => e.to_status === s);
                return (
                    <div key={s} className={done ? (i === cur ? "done cur" : "done") : "todo"}>
                        <div className="dot">
                            <b>{done && <Check size={13} strokeWidth={3} />}</b>
                            {i < STEPS.length - 1 && <s />}
                        </div>
                        <div className="tx2" style={{ paddingBottom: i < STEPS.length - 1 ? 14 : 0 }}>
                            <b>{statusText(s)}</b>
                            {ev?.created_at && <small>{new Date(ev.created_at).toLocaleString("en-IN")}</small>}
                        </div>
                    </div>
                );
            })}
            {bad && (
                <div className="bad">
                    <X size={18} />
                    {autoRejected ? "Not accepted: the seller didn't respond in 24 hours" : status === "cancelled" ? "Cancelled" : "Rejected by seller"}
                </div>
            )}
        </div>
    );
}

function OrderTags({ order, isSample }) {
    const credit = getPaymentTerms(order) === "credit";
    const fr = orderFreightState(order);
    if (!credit && !fr && !isSample) return null;
    return (
        <div className="sh-tags">
            {isSample && <span className="sh-tg v"><Package size={13} />Sample</span>}
            {credit && <span className="sh-tg b"><CreditCard size={13} />Purchased on credit</span>}
            {fr === "included" && <span className="sh-tg g"><Truck size={13} />Freight included</span>}
            {fr === "extra" && <span className="sh-tg o"><Truck size={13} />You pay delivery charges</span>}
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="sh-card">
            <div className="sh-ctl">{title}</div>
            {children}
        </section>
    );
}

export default function SaveOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = useAuth();
    const { markOrderRead } = useNotifications();

    const fetcher = useCallback((orderId) => fetchOrderById(token, orderId), [token]);
    const { order: rawOrder, events, loading, reload } = useRealtimeOrder({ orderId: id, fetcher });


    // Steps down the My Orders badge for this order the moment its detail page is opened.
    useEffect(() => {
        if (id) markOrderRead(id, "buyer");
    }, [id, markOrderRead]);

    const goBack = () => (location.key !== "default" ? navigate(-1) : navigate("/save/orders"));

    if (loading && !rawOrder) {
        return (
            <div className="sh-w" aria-busy="true">
                <div className="sh-sk line" style={{ marginTop: 28, width: "55%" }} />
                <div className="sh-sk tall" style={{ marginTop: 18 }} />
            </div>
        );
    }
    if (!rawOrder) {
        return (
            <div className="sh-w" style={{ marginTop: 28 }}>
                <div className="sh-emp">
                    <b>Order not found</b>
                    It may have been removed, or the link is wrong.
                    <div><button type="button" className="sh-btn go" style={{ marginTop: 16 }} onClick={() => navigate("/save/orders")}>Back to orders</button></div>
                </div>
            </div>
        );
    }
    const price = orderPriceInfo(rawOrder);                 // live price info (null unless unpaid)
    const order = applyRepricedView(rawOrder, price);       // everything below displays the live price
    const blocked = !!price?.blocked;

    const isSample = order.order_type === "sample";
    const firstItem = order.items?.[0];
    const deliveredEvent = events.find((e) => e.to_status === "delivered");
    const status = displayStatus(order);
    const showDelivery = shouldShowDelivery(order, firstItem);
    const showShortfall = shouldShowShortfall(order);
    const seller = order.seller;
    const unpaid = order.status === "awaiting_payment";
    const inCart = !!order.order_group_id;

    return (
        <div className="sh-w">
            <div className="sh-bkr">
                <button type="button" className="sh-bk" aria-label="Back" onClick={goBack}><ArrowLeft size={18} /></button>
                <div className="sh-hh">
                    <h1>{order.order_number}</h1>
                    <div className="sh-live"><i />Live</div>
                </div>
                <span className={`sh-st ${status}`}><i />{statusText(status)}</span>
            </div>

            <div className="sh-dgrid">
                <div className="sh-dcol">
                    {unpaid && (
                        <>
                            {price?.changed && <PriceChangeNotice id={rawOrder.id} from={price.from} to={price.to} />}
                            {blocked && <OrderBlockedNotice code={price.blocked.code} product={price.blocked.product} />}
                            {!blocked && (
                                <Section title="Complete your payment">
                                    <p className="sh-cap" style={{ margin: "0 0 12px" }}>
                                        {inCart
                                            ? `This order is part of a cart checkout${order.group_number ? ` (#${order.group_number})` : ""}, so you pay for the whole cart in one payment. The seller is notified once the payment is confirmed.`
                                            : `Your order of ₹${inr(order.total_amount)} is created but not paid yet. The seller is notified once the payment is confirmed.`}
                                    </p>
                                    <ResumePaymentButton
                                        orderId={order.id}
                                        groupId={order.order_group_id || null}
                                        label={inCart ? "Pay for the whole cart" : `Pay ₹${inr(order.total_amount)}`}
                                        className="sh-btn go"
                                        expectedTotal={inCart ? null : price?.current}
                                        onPriceChanged={() => reload({ silent: true })}
                                    />
                                </Section>
                            )}
                        </>
                    )}

                    <Section title="Payment & freight">
                        <OrderTags order={order} isSample={isSample} />
                        <div className="sh-tw sh-stk">
                            {/* Credit orders only — advance payment is a seller-only concern */}
                            <PaymentTermsBanner order={order} viewer="buyer" standalone />
                            <FreightNotice order={order} viewer="buyer" />
                            <OrderTimingNote order={order} viewer="buyer" />
                        </div>
                    </Section>

                    <Section title="Order status">
                        <Timeline status={order.status} events={events} autoRejected={!!order.auto_rejected_at} />
                    </Section>

                    {(showDelivery || showShortfall) && (
                        <Section title="Delivery">
                            <div className="sh-tw sh-stk">
                                {showDelivery && <DeliveryEstimate order={order} item={firstItem} deliveredAt={deliveredEvent?.created_at} />}
                                {showShortfall && <StockShortfallNote audience="buyer" />}
                            </div>
                        </Section>
                    )}

                    <div className="sh-tw sh-ltb"><TransportInfoCard order={order} /></div>
                </div>

                <div className="sh-dcol">
                    {seller && (
                        <section className="sh-card sh-slr">
                            <div className="sh-th">
                                {seller.logo_url ? <img src={seller.logo_url} alt="" /> : <Store size={20} />}
                            </div>
                            <div className="sh-slri">
                                <b>{seller.display_name}</b>
                                {(seller.city || seller.state) && <small>{[seller.city, seller.state].filter(Boolean).join(", ")}</small>}
                                {seller.business?.gstin && <small>GSTIN: {seller.business.gstin}</small>}
                            </div>
                            {seller.shop_slug && (
                                <Link className="sh-btn sm" to={`/home/?shop=${seller.shop_slug}`}>View shop</Link>
                            )}
                        </section>
                    )}

                    <Section title="Items">
                        {(order.items || []).map((item) => (
                            <div className="sh-it" key={item.id}>
                                <div className="sh-th">
                                    {item.image_snapshot ? <img src={item.image_snapshot} alt="" loading="lazy" /> : <Package size={22} />}
                                </div>
                                <div className="sh-itn">
                                    <p className="sh-rn">{item.product_name_snapshot}</p>
                                    <p className="sh-itp">@ {displayAmount(item.unit_price, { isSample })}</p>
                                </div>
                                <div className="sh-itq"><ItemQuantityLine item={item} mutedColor="var(--mute)" /></div>
                            </div>
                        ))}
                    </Section>

                    {order.buyer_notes && (
                        <Section title="Note to seller">
                            <p className="sh-quote">"{order.buyer_notes}"</p>
                        </Section>
                    )}

                    <div className="sh-doc"><PurchaseOrderDocument order={order} variant="buyer" /></div>

                    <div className="sh-tw sh-ltb"><DisputePanel order={order} viewer="buyer" onChanged={reload} /></div>
                    <div className="sh-tw"><CancelOrderControl order={order} onCancelled={reload} className="mt-1" /></div>
                </div>
            </div>
        </div>
    );
}