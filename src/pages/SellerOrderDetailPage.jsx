// pages/SellerOrderDetailPage.jsx — RESTYLED to match SellerListingForm's
// type scale and card language. Also adds what was missing versus the
// sales-orders list: pack-quantity display (was raw unit qty only),
// delivery estimate, stock-shortfall note, and sample badge/free-sample
// handling. Keeps this page seller-relevant only — buyer contact +
// address + GST verification (their concern), payout breakdown (their
// concern) — no buyer-side navigation chrome.
//
// NEW (this pass): shows the transport preference (mode/company/details)
// agreed with the buyer, if one was snapshotted onto this order at
// placement time (orders.transport_mode) — mirrors the same card added
// to OrderDetailPage.jsx (the buyer's view of the same order).
//
// NEW (notifications pass): marks every unread "sales" notification for
// this order (link === /seller/orders/:id) as read on open, via
// NotificationsContext — this is what steps down the My Orders badge and
// the Sales Orders tab count.
//
// NEW (PO document pass): the seller's own order fetch has no reason to
// join seller_profiles (they already know their own shop), so
// PurchaseOrderDocument's "Vendor" block has nothing to read there. We
// fill that gap with vendorOverride, sourced from the already-loaded
// auth `profile` — same place OrdersPage.jsx already reads
// `profile?.seller_status` from.
// TODO: confirm these are the actual field names on your AuthContext's
// profile object (display_name/city/state) — adjust if your seller shop
// info lives under different keys or needs a separate fetch.
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Package, User, Phone, Mail, ShieldCheck, Loader2, MapPin, IndianRupee, Radio, CheckCircle2, Circle, XCircle, Truck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { fetchSellerOrderById, confirmSellerOrder, confirmSellerOrderWithTransport, rejectSellerOrder, processSellerOrder, shipSellerOrder, deliverSellerOrder, fetchSellerOwnTransportOptions } from "../utils/api.js";
import { shipSellerOrderWithTransport } from "../utils/api.transport.js";
import ConfirmOrderModal from "../components/orders/ConfirmOrderModal.jsx";
import TransportInfoCard from "../components/orders/TransportInfoCard.jsx";
import useRealtimeOrder from "../hooks/useRealtimeOrder.js";
import { C, EASE } from "../components/catalog/tokens";
import PurchaseOrderDocument from "../components/orders/PurchaseOrderDocument.jsx";
import ShipOrderModal from "../components/orders/ShipOrderModal.jsx";
import { StatusChip, SampleBadge, ItemQuantityLine, DeliveryEstimate, displayAmount, StockShortfallNote, shouldShowDelivery, shouldShowShortfall } from "../components/orders/OrderDisplayHelpers.jsx";

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
const TIMELINE_STEPS = ["pending_confirmation", "confirmed", "shipped", "delivered"];

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Turns the raw orders.transport_mode value ("bus"/"train"/"other"/…)
// into a display label. Falls back to a capitalized version of whatever
// string is there so an unrecognized future mode still shows something
// sensible instead of nothing.
function transportModeLabel(mode) {
    if (!mode) return null;
    if (mode === "bus") return "Bus";
    if (mode === "train") return "Train";
    return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function Timeline({ status, events }) {
    const isTerminalBad = status === "cancelled" || status === "rejected";
    const currentIdx = TIMELINE_STEPS.indexOf(status);
    return (
        <div className="flex flex-col gap-0">
            {TIMELINE_STEPS.map((step, i) => {
                const done = !isTerminalBad && i <= currentIdx;
                const isCurrent = !isTerminalBad && i === currentIdx;
                const event = events.find((e) => e.to_status === step);
                return (
                    <div key={step} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            {done ? <CheckCircle2 className="h-5 w-5" style={{ color: isCurrent ? C.secondary : "#059669" }} /> : <Circle className="h-5 w-5" style={{ color: C.hairSoft }} />}
                            {i < TIMELINE_STEPS.length - 1 && <span className="my-0.5 h-8 w-0.5" style={{ background: done && i < currentIdx ? "#059669" : C.hairSoft }} />}
                        </div>
                        <div className="pb-6">
                            <p className="text-[13.5px] font-bold capitalize tracking-wide" style={{ color: done ? C.ink : C.muted }}>{step.replace("_", " ")}</p>
                            {event?.created_at && <p className="text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>{new Date(event.created_at).toLocaleString("en-IN")}</p>}
                        </div>
                    </div>
                );
            })}
            {isTerminalBad && (
                <div className="flex gap-3">
                    <XCircle className="h-5 w-5" style={{ color: C.primary }} />
                    <p className="text-[12.5px] font-bold tracking-wide" style={{ color: C.primary }}>{status === "cancelled" ? "Cancelled by buyer" : "Rejected"}</p>
                </div>
            )}
        </div>
    );
}

function Card({ title, children }) {
    return (
        <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>{title}</p>
            <div className="mt-3">{children}</div>
        </div>
    );
}

export default function SellerOrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token, profile } = useAuth();
    const { markOrderRead } = useNotifications();
    const [busy, setBusy] = useState(null);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [shipModalOpen, setShipModalOpen] = useState(false);

    const [sellerTransportOptions, setSellerTransportOptions] = useState([]);

    useEffect(() => {
        fetchSellerOwnTransportOptions(token).then((res) => {
            if (res?.success) setSellerTransportOptions(res.transportOptions || []);
        });
    }, [token]);

    // Fills the "Vendor (Seller)" block on the PO document — the seller's
    // own order fetch doesn't join seller_profiles (see file header note).
    const vendorOverride = {
        display_name: profile?.display_name || profile?.shop_name || profile?.business_name || null,
        city: profile?.city || null,
        state: profile?.state || null,
    };

    const fetcher = useCallback((orderId) => fetchSellerOrderById(token, orderId), [token]);
    const { order, events, loading, reload } = useRealtimeOrder({ orderId: id, fetcher });

    const deliveredEvent = events.find((e) => e.to_status === "delivered");

    const actions = NEXT_ACTION[order?.status] || [];
    const runAction = async (action) => {
        if (action.needsShipModal) { setShipModalOpen(true); return; } // add this
        let reason;
        if (action.needsReason) {
            reason = window.prompt("Reason for rejecting this order (shown to the buyer):");
            if (reason === null) return;
        }
        setBusy(action.key);
        const res = await action.fn(token, id, reason);
        setBusy(null);
        if (res?.success) {
            // Only these two are terminal from the seller's perspective —
            // confirm/process/ship leave the order "in progress" and the
            // unread badge should keep reflecting that.
            if (action.key === "reject" || action.key === "deliver") {
                await markOrderRead(id, "seller");
            }
            reload();
        } else {
            window.alert(res?.message || "Couldn't update the order.");
        }
    };

    if (loading && !order) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;
    if (!order) return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Order not found.</p>
            <button onClick={() => navigate("/seller/orders")} className="mt-4 text-[12.5px] font-bold tracking-wide" style={{ color: C.secondary }}>Back to sales orders</button>
        </div>
    );

    const addr = order.shipping_address_snapshot || {};
    const isSample = order.order_type === "sample";
    const firstItem = order.items?.[0];

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-2.5 pb-10 pt-3 sm:px-4 lg:px-6">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <h1 className="truncate font-extrabold tracking-[0.01em]" style={{ color: C.ink, fontSize: "clamp(17px, 1.6vw, 22px)" }}>{order.order_number}</h1>
                        {isSample && <SampleBadge size="lg" />}
                    </div>
                    <p className="flex items-center gap-1 text-[11.5px] font-semibold tracking-wider" style={{ color: C.muted }}><Radio className="h-2.5 w-2.5 animate-pulse" style={{ color: "#059669" }} /> Live</p>
                </div>
                <StatusChip status={order.status} size="lg" />
            </div>

            <Card title="Order status">
                <Timeline status={order.status} events={events} />
            </Card>

            {(shouldShowDelivery(order, firstItem) || shouldShowShortfall(order)) && (
                <Card title="Fulfilment">
                    <div className="flex flex-col gap-2">
                        {shouldShowShortfall(order) && <StockShortfallNote audience="seller" />}
                        {shouldShowDelivery(order, firstItem) && (
                            <DeliveryEstimate order={order} item={firstItem} deliveredAt={deliveredEvent?.created_at} label="Buyer's est. delivery" />
                        )}
                    </div>
                </Card>
            )}

            <TransportInfoCard order={order} />

            <PurchaseOrderDocument order={order} variant="seller" vendorOverride={vendorOverride} />

            <Card title="Items">
                <div className="flex flex-col gap-3">
                    {(order.items || []).map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white" style={{ borderColor: C.hair }}>
                                {item.image_snapshot ? <img src={item.image_snapshot} alt="" className="h-full w-full object-cover" /> : <Package className="m-auto h-4 w-4" style={{ color: C.muted }} />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14.5px] font-extrabold tracking-wider" style={{ color: C.ink }}>{item.product_name_snapshot}</p>
                                <p className="text-[12px] font-semibold tracking-wider" style={{ color: C.muted }}>
                                    @{displayAmount(item.unit_price, { isSample })}
                                </p>
                            </div>
                            <ItemQuantityLine item={item} mutedColor={C.muted} />
                        </div>
                    ))}
                </div>

            </Card>

            <Card title="Buyer">
                <p className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-wider" style={{ color: C.ink }}>
                    <User className="h-3.5 w-3.5" /> {order.buyer_contact_name}
                </p>
                {order.buyer_business_name && <p className="mt-1 text-[12px] font-semibold tracking-wider" style={{ color: C.muted }}>{order.buyer_business_name}{order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] font-semibold tracking-wider" style={{ color: C.muted }}>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.buyer_contact_phone}</span>
                    {order.buyer_contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{order.buyer_contact_email}</span>}
                </p>

                {order.buyer_notes && <p className="mt-2 text-[12.5px] font-medium italic tracking-wide" style={{ color: C.muted }}>"{order.buyer_notes}"</p>}
            </Card>

            {actions.length > 0 && (
                <div className="mt-5 flex gap-2">
                    {actions.map((a) => (
                        <button key={a.key} disabled={busy !== null} onClick={() => runAction(a)}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[13px] font-bold tracking-wide ${a.primary ? "text-white" : ""}`}
                            style={a.primary ? { background: `linear-gradient(135deg, ${C.secondary} 0%, #047084 100%)` } : { border: `1px solid ${C.hair}`, color: C.primary }}>
                            {busy === a.key ? <Loader2 className="h-4 w-4 animate-spin" /> : a.label}
                        </button>
                    ))}
                </div>
            )}

            {shipModalOpen && (
                <ShipOrderModal
                    open={shipModalOpen}
                    order={order}
                    onClose={() => setShipModalOpen(false)}
                    onConfirm={async (formData) => {
                        const res = await shipSellerOrderWithTransport(token, id, formData);
                        if (res?.success) { setShipModalOpen(false); reload(); }
                        return res;
                    }}
                />
            )}
        </div>
    );
}