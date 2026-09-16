// pages/OrderDetailPage.jsx — merges PurchaseOrdersPage + SalesOrdersPage into one
// route with a top-level tab switcher. "Sales" tab is only shown/rendered
// when the current user is an approved seller.
//
// NEW (this pass): shows the transport preference (mode/company/details)
// that was agreed with the seller, if one was snapshotted onto this order
// at placement time (orders.transport_mode, set by place_order when
// BuyNowModal forwards a confirmed buyer_seller_transport_prefs row).
//
// NEW (notifications pass): marks every unread "purchase" notification for
// this order (link === /orders/:id) as read on open, via
// NotificationsContext — this is what steps down the My Orders badge and
// the Purchase Orders tab count.
import { useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Package, MapPin, Loader2, CheckCircle2, Circle, XCircle, Radio, Store, Truck } from "lucide-react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { fetchOrderById, cancelMyOrder } from "../utils/api.js";
import useRealtimeOrder from "../hooks/useRealtimeOrder.js";
import { C, EASE } from "../components/catalog/tokens";
import TransportInfoCard from "../components/orders/TransportInfoCard.jsx";
import PurchaseOrderDocument from "../components/orders/PurchaseOrderDocument.jsx";
import { StatusChip, SampleBadge, ItemQuantityLine, DeliveryEstimate, displayAmount, StockShortfallNote, shouldShowDelivery, shouldShowShortfall, basisLabel } from "../components/orders/OrderDisplayHelpers.jsx";

const TIMELINE_STEPS = ["pending_confirmation", "confirmed", "shipped", "delivered"];

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
                            {event?.created_at && <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{new Date(event.created_at).toLocaleString("en-IN")}</p>}
                        </div>
                    </div>
                );
            })}
            {isTerminalBad && (
                <div className="flex gap-3">
                    <XCircle className="h-5 w-5" style={{ color: C.primary }} />
                    <p className="text-[12.5px] font-bold tracking-wide" style={{ color: C.primary }}>{status === "cancelled" ? "Cancelled" : "Rejected by seller"}</p>
                </div>
            )}
        </div>
    );
}

// Same reconstruction logic as BuyNowModal's normalizeQuote — order line
// items only ever persist the FINAL (post-discount) unit_price, so the
// pre-discount gross rate has to be rebuilt from discount_percent when
// base_price_applied isn't stored directly.
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function saleUnitLabelFromBasis(basis) {
    if (basis === "per_master_pack") return "Master Pack";
    if (basis === "per_pack") return "Pack";
    return null;
}

function deriveOrderTotals(order) {
    const item = order.items?.[0];
    const baseQuantity = Number(item?.quantity) || 0;                 // base units (e.g. 100 Litres)
    const basePriceApplied = Number(item?.base_price_applied) || Number(item?.unit_price) || 0; // per SALE unit

    // FIX: was multiplying a per-sale-unit price directly against the
    // base-unit quantity (mixing units, ~20x inflation in the Master
    // Pack case) and inventing a phantom discount for the difference.
    // pack_quantity_snapshot already holds the real sale-unit quantity
    // the buyer entered (e.g. 5 Master Packs) — same field
    // ItemQuantityLine above already uses correctly. No derivation
    // needed; just read it.
    const saleUnitQuantity = Number(item?.pack_quantity_snapshot) || 0;
    const discountPercent = Number(item?.discount_percent) || 0;
    const subtotal = Number(order.subtotal_amount) || 0;

    const grossSubtotal = round2(basePriceApplied * saleUnitQuantity);
    const discountAmount = round2(Math.max(grossSubtotal - subtotal, 0));
    const perBaseUnitRate = baseQuantity > 0 ? round2(grossSubtotal / baseQuantity) : 0;

    // reuse the shared label helper rather than a local reimplementation —
    // basisLabel returns lowercase "master pack"/"pack"; capitalize to
    // match this page's existing "Master Pack"/"Pack" casing.
    const rawLabel = basisLabel(item?.purchase_basis);
    const saleUnitLabel = rawLabel ? rawLabel.replace(/\b\w/g, (c) => c.toUpperCase()) : null;

    return { baseQuantity, saleUnitQuantity, basePriceApplied, perBaseUnitRate, discountPercent, grossSubtotal, discountAmount, subtotal, unit: item?.unit, saleUnitLabel };
}

// Small section wrapper matching the rounded-2xl / uppercase-caption
// idiom used throughout SellerListingForm.
function Card({ title, children }) {
    return (
        <div className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "#4A535B" }}>{title}</p>
            <div className="mt-3">{children}</div>
        </div>
    );
}

export default function OrderDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { markOrderRead } = useNotifications();

    const fetcher = useCallback((orderId) => fetchOrderById(token, orderId), [token]);
    const { order, events, loading, reload } = useRealtimeOrder({ orderId: id, fetcher });
    // console.log("order.stock_shortfall:", order?.stock_shortfall, "| lead_time_snapshot:", order?.items?.[0]?.lead_time_snapshot);

    // Steps down the My Orders badge + Purchase Orders tab count for this
    // order the moment its detail page is opened.
    useEffect(() => {
        if (id) markOrderRead(id, "buyer");
    }, [id, markOrderRead]);

    const deliveredEvent = events.find((e) => e.to_status === "delivered");

    const handleCancel = async () => {
        const res = await cancelMyOrder(token, id, "Cancelled by buyer");
        if (res?.success) reload(); else window.alert(res?.message || "Couldn't cancel the order.");
    };

    if (loading && !order) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>;
    if (!order) return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Order not found.</p>
            <button onClick={() => navigate("/orders")} className="mt-4 text-[12.5px] font-bold tracking-wide" style={{ color: C.secondary }}>Back to orders</button>
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
                    <p className="flex items-center gap-1 text-[12px] font-semibold tracking-wider" style={{ color: C.muted }}><Radio className="h-2.5 w-2.5 animate-pulse" style={{ color: "#059669" }} /> Live</p>
                </div>
                <StatusChip status={order.status} size="lg" />
            </div>

            {order.seller && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                    className="mt-4 flex items-center gap-3 rounded-2xl border bg-white p-3.5" style={{ borderColor: C.hair }}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.hair }}>
                        {order.seller.logo_url ? <img src={order.seller.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-4 w-4" style={{ color: C.muted }} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-extrabold tracking-wider" style={{ color: C.ink }}>{order.seller.display_name}</p>
                        {(order.seller.city || order.seller.state) && (
                            <p className="text-[12.5px] font-semibold tracking-wider" style={{ color: C.muted }}>{[order.seller.city, order.seller.state].filter(Boolean).join(", ")}</p>
                        )}
                    </div>
                    {order.seller.shop_slug && (
                        <Link to={`/shop/${order.seller.shop_slug}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold tracking-wider" style={{ borderColor: C.hair, color: C.secondary }}>
                            View shop
                        </Link>
                    )}
                </motion.div>
            )}

            <Card title="Order status">
                <Timeline status={order.status} events={events} />
            </Card>

            {(shouldShowDelivery(order, firstItem) || shouldShowShortfall(order)) && (
                <Card title="Delivery">
                    <div className="flex flex-col gap-2">
                        {shouldShowDelivery(order, firstItem) && (
                            <DeliveryEstimate order={order} item={firstItem} deliveredAt={deliveredEvent?.created_at} />
                        )}
                        {shouldShowShortfall(order) && <StockShortfallNote audience="buyer" />}
                    </div>
                </Card>
            )}

            <TransportInfoCard order={order} />

            <PurchaseOrderDocument order={order} variant="buyer" />

            <Card title="Items">
                <div className="flex flex-col gap-3">
                    {(order.items || []).map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.hair }}>
                                {item.image_snapshot ? <img src={item.image_snapshot} alt="" className="h-full w-full object-cover" /> : <Package className="m-auto h-5 w-5" style={{ color: C.muted }} />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>{item.product_name_snapshot}</p>
                                <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                    @{displayAmount(item.unit_price, { isSample })}
                                </p>
                            </div>
                            <ItemQuantityLine item={item} mutedColor={C.muted} />
                            {/* <p className="text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>{displayAmount(item.line_total, { isSample })}</p> */}
                        </div>
                    ))}
                </div>
            </Card>

            {/* <Card title="Shipping address">
                <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: C.muted }}><MapPin className="h-3 w-3" /> {addr.label || "Address"}</p>
                <p className="mt-1.5 text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{addr.contact_name}</p>
                <p className="text-[12px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}, {addr.city}, {addr.state} - {addr.pincode}</p>
                {addr.contact_phone && <p className="mt-1 text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>{addr.contact_phone}</p>}
            </Card> */}

            {order.buyer_notes && (
                <Card title="Note to seller">
                    <p className="text-[12.5px] font-medium italic tracking-wide" style={{ color: C.ink }}>"{order.buyer_notes}"</p>
                </Card>
            )}

            {order.status === "pending_confirmation" && (
                <button onClick={handleCancel} className="mt-5 w-full rounded-xl border px-5 py-3 text-[13px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.primary }}>Cancel order</button>
            )}
        </div>
    );
}