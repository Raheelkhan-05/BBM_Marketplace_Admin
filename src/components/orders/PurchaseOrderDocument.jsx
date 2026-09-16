// components/orders/PurchaseOrderDocument.jsx
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { transportLabel } from "../../../shared/transportOptions.js";
import { ItemQuantityLine, parseDeliveryDate } from "./OrderDisplayHelpers.jsx";

const C = { ink: "#0B1116", muted: "#667077", hair: "rgba(11,17,22,0.12)", accent: "#0B7285" };
const GST_PERCENT = 18;

function fmtDate(d) {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt) ? null : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// FIX: this used to read order.estimated_delivery_date / _max, which are
// not the fields the "Fulfilment" card (DeliveryEstimate in
// OrderDisplayHelpers.jsx) actually reads — that card parses
// item.lead_time_snapshot via the shared parseDeliveryDate helper. The two
// were drifting: Fulfilment could show "13 Sep - 14 Sep" while this block
// said "Pending confirmation" for the exact same order. Now both read the
// same source through the same parser, so they can't disagree.
function deliveryDateLabel(order, firstItem) {
    if (order.status === "delivered") {
        const ts = order.updated_at;
        return ts ? fmtDate(ts) : "Delivered";
    }
    return parseDeliveryDate(firstItem?.lead_time_snapshot) || "To be confirmed";
}

function inr(n) {
    return (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function transportSummary(order) {
    if (order.transport_mode) return { confirmed: true, label: transportLabel(order.transport_mode) };
    if (order.buyer_transport_mode) return { confirmed: false, label: transportLabel(order.buyer_transport_mode) };
    return { confirmed: false, label: null };
}

function saleQtyOf(item) {
    return Number(item.pack_quantity_snapshot) || Number(item.quantity) || 0;
}
function baseRateExclGst(item) {
    const inclGst = Number(item.base_price_applied ?? item.unit_price) || 0;
    return round2(inclGst / (1 + GST_PERCENT / 100));
}
function amountExclGst(item) {
    return round2(baseRateExclGst(item) * saleQtyOf(item));
}

function TotalRow({ label, value, bold, color }) {
    return (
        <div className="flex w-full max-w-[300px] justify-between text-[12.5px] font-semibold tracking-wide" style={{ color: color || C.muted }}>
            <span className={bold ? "font-extrabold" : ""}>{label}</span>
            <span className={`tabular-nums ${bold ? "font-extrabold" : ""}`} style={{ color: bold ? C.ink : (color || C.ink) }}>{value}</span>
        </div>
    );
}

export default function PurchaseOrderDocument({ order, variant = "buyer", vendorOverride = null }) {
    const [downloading, setDownloading] = useState(false);
    if (!order) return null;

    const addr = order.shipping_address_snapshot || {};
    const items = order.items || [];
    const firstItem = items[0];
    const transport = transportSummary(order);
    const isBuyerView = variant === "buyer";
    const isSellerView = variant === "seller";
    const isSample = order.order_type === "sample";

    const isDelivered = order.status === "delivered";

    const vendor = order.seller || vendorOverride || null;
    const vendorName = vendor?.display_name || "—";
    const vendorLocation = [vendor?.city, vendor?.state].filter(Boolean).join(", ");
    const deliverToName = addr.contact_name || order.buyer_contact_name || "";

    const sellerState = vendor?.state || null;
    const buyerState = addr.state || null;
    const isIntraState = !!(sellerState && buyerState && sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase());

    const subtotal = round2(items.reduce((s, it) => s + amountExclGst(it), 0));
    const gstAmount = round2(Math.max((Number(order.total_amount) || 0) - subtotal, 0));
    const half = round2(gstAmount / 2);


    // NEW — same formula already used in SellerOrderDetailPage's Items
    // card; surfaced here too since sellers view this card as their
    // primary order summary and the wallet impact belongs next to
    // Total Payable, not buried lower on the page.
    const walletDeduction = round2((Number(order.subtotal_amount) || 0) * (Number(order.platform_fee_percent) || 0) / 100 * 1.18);


    const handleDownload = async () => {
        setDownloading(true);
        try {
            const { generateOrderPdf } = await import("../../utils/orderPdf.js");
            await generateOrderPdf(order, { vendor });
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: C.hair }}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: C.accent }}>
                        {isBuyerView ? "Your Purchase Order" : "Purchase Order Received"}
                    </p>
                    <h3 className="mt-0.5 text-[16px] font-extrabold tracking-wide" style={{ color: C.ink }}>PURCHASE ORDER</h3>
                </div>
                <button onClick={handleDownload} disabled={downloading}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-bold tracking-wide"
                    style={{ borderColor: C.accent, color: C.accent }}>
                    {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Download PDF
                </button>
            </div>

            <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b pb-4 sm:grid-cols-4" style={{ borderColor: C.hair }}>
                    <MetaField label="Order No." value={order.order_number} mono />
                    <MetaField label="Order Date" value={fmtDate(order.created_at) || "—"} />
                    <MetaField
                        label={isDelivered ? "Delivered On" : "Estimated Delivery"}
                        value={deliveryDateLabel(order, firstItem)}
                    />
                    <MetaField label="Transport" value={transport.label || "To be decided"} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 border-b pb-4 sm:grid-cols-2" style={{ borderColor: C.hair }}>
                    <div>
                        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Vendor (Seller)</p>
                        <p className="mt-1 text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{vendorName}</p>
                        {vendorLocation && <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{vendorLocation}</p>}
                    </div>
                    <div>
                        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Deliver To</p>
                        <p className="mt-1 text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{deliverToName}</p>
                        {order.buyer_business_name && (
                            <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                {order.buyer_business_name}{order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}
                            </p>
                        )}
                        <p className="text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                            {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                    </div>
                </div>

                {/* Desktop table */}
                <div className="mt-4 hidden overflow-hidden rounded-lg border sm:block" style={{ borderColor: C.hair }}>
                    <table className="w-full text-[12.5px]">
                        <thead>
                            <tr style={{ background: C.accent }}>
                                <Th className="w-10">Sr</Th>
                                <Th>Description of Goods</Th>
                                <Th className="w-44">Qty</Th>
                                <Th className="w-28 text-right">Base Price<br /><span className="font-normal normal-case opacity-80">(Excl. GST)</span></Th>
                                <Th className="w-32 text-right">Amount<br /><span className="font-normal normal-case opacity-80">(Excl. GST)</span></Th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, i) => (
                                <tr key={it.id || i} className="border-t align-top" style={{ borderColor: C.hair, background: i % 2 === 1 ? "#fafbfb" : "#fff" }}>
                                    <Td>{i + 1}</Td>
                                    <Td>
                                        <span className="block font-bold tracking-wide" style={{ color: C.ink }}>{it.product_name_snapshot}</span>
                                        {it.brand_name_snapshot && (
                                            <span className="mt-0.5 block text-[11px] font-bold tracking-wide" style={{ color: C.accent }}>
                                                Brand: {it.brand_name_snapshot}
                                            </span>
                                        )}
                                    </Td>
                                    <Td><ItemQuantityLine item={it} mutedColor={C.muted} /></Td>
                                    <Td className="text-right tabular-nums">₹{inr(baseRateExclGst(it))}</Td>
                                    <Td className="text-right tabular-nums font-bold">₹{inr(amountExclGst(it))}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile stacked rows */}
                <div className="mt-4 flex flex-col gap-2 sm:hidden">
                    {/* Shared column headers — mirrors the desktop table's header row
        (Description of Goods / Amount), just simplified for the stacked
        mobile card layout so each card's content lines up under a label
        instead of repeating "Amount" per card. */}
                    {items.length > 0 && (
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Items</span>
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Amount</span>
                        </div>
                    )}

                    {items.map((it, i) => (
                        <div key={it.id || i} className="rounded-lg border p-2.5" style={{ borderColor: C.hair }}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{i + 1}. {it.product_name_snapshot}</p>
                                    {it.brand_name_snapshot && (
                                        <p className="mt-0 text-[11px] font-bold tracking-wide" style={{ color: C.accent }}>Brand: {it.brand_name_snapshot}</p>
                                    )}
                                </div>
                                <span className="shrink-0 text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>₹{inr(amountExclGst(it))}</span>
                            </div>

                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <span>Quantity: <ItemQuantityLine item={it} mutedColor={C.muted} /></span>
                                <span>Base Price: ₹{inr(baseRateExclGst(it))}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex flex-col items-end gap-1.5 border-t pt-4" style={{ borderColor: C.hair }}>
                    {isSample ? (
                        <TotalRow label="Total" value={`₹${inr(order.total_amount)}`} bold />
                    ) : (
                        <>
                            <TotalRow label="Subtotal" value={`₹${inr(subtotal)}`} />
                            {isIntraState ? (
                                <>
                                    <TotalRow label={`CGST (${GST_PERCENT / 2}%)`} value={`₹${inr(half)}`} />
                                    <TotalRow label={`SGST (${GST_PERCENT / 2}%)`} value={`₹${inr(round2(gstAmount - half))}`} />
                                </>
                            ) : (
                                <TotalRow label={`IGST (${GST_PERCENT}%)`} value={`₹${inr(gstAmount)}`} />
                            )}
                            <div className="mt-1 flex w-full max-w-[300px] justify-between border-t pt-2 text-[15px] font-extrabold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                                <span>Total Payable</span><span className="tabular-nums" style={{ color: C.accent }}>₹{inr(order.total_amount)}</span>
                            </div>
                            {/* <p className="mt-1 max-w-[300px] text-right text-[10.5px] font-medium italic tracking-wide" style={{ color: C.muted }}>
                                GST is calculated on the base (pre-discount) price at the standard {GST_PERCENT}% rate.
                            </p> */}
                        </>
                    )}

                    {/* NEW — seller-only, screen-only wallet/commission note.
                        Not passed to generateOrderPdf, so the PDF stays clean.
                        Styled to match TotalRow's tracking/weight language,
                        just muted + italic to read as a secondary note
                        rather than another line item. */}
                    {isSellerView && !isSample && (
                        <p className="mt-1 max-w-[350px] text-right text-[12px] font-medium italic tracking-wide" style={{ color: C.muted }}>
                            Wallet deduction: ₹{inr(walletDeduction)} (0.25% commission + 18% GST)
                        </p>
                    )}
                    {isSellerView && isSample && (
                        <p className="mt-1 max-w-[300px] text-right text-[11px] font-medium italic tracking-wide" style={{ color: C.muted }}>
                            Free sample · no platform fee
                        </p>
                    )}
                </div>

                {order.buyer_notes && (
                    <div className="mt-4 border-t pt-3" style={{ borderColor: C.hair }}>
                        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C.muted }}>Notes</p>
                        <p className="mt-1 text-[12.5px] font-medium italic tracking-wide" style={{ color: C.ink }}>"{order.buyer_notes}"</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function MetaField({ label, value, mono }) {
    return (
        <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{label}</p>
            <p className={`mt-0.5 text-[12.5px] font-bold tracking-wide ${mono ? "font-mono" : ""}`} style={{ color: C.ink }}>{value || "—"}</p>
        </div>
    );
}
function Th({ children, className = "" }) {
    return <th className={`px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-wide leading-tight text-white ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
    return <td className={`px-3 py-2.5 tracking-wide ${className}`} style={{ color: C.ink }}>{children}</td>;
}