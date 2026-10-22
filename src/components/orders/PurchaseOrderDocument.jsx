// components/orders/PurchaseOrderDocument.jsx
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { transportLabel } from "../../../shared/transportOptions.js";
import { computeOrderBreakdown, DEFAULT_GST_PERCENT } from "../../../shared/orderPricing.js";
import {
    ItemQuantityLine, parseDeliveryDate, PartyBlock, TotalRow, FreightPill,
    itemFreightIncluded, orderFreightState, visiblePaymentTerms, paymentTermsLabel,
    computeWalletDeduction, DOC_C,
} from "./OrderDisplayHelpers.jsx";

const C = DOC_C;

function fmtDate(d) {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt) ? null : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

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

// Per-item freight pill — only rendered when items in the order differ.
function ItemFreightPill({ item, order, viewer }) {
    const v = itemFreightIncluded(item, order);
    if (v === null) return null;
    return <span className="mt-1 block"><FreightPill included={v} viewer={viewer} /></span>;
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

    // order.seller (buyer view, via getMyOrder's join) and vendorOverride
    // (seller view, from the seller's own profile) can each carry fields
    // the other lacks — e.g. order.seller has city/state but no gstin,
    // while vendorOverride has gstin but no shop location. Merge them
    // (vendorOverride's fields win when both are present) instead of
    // picking one wholesale, or whichever fields only exist on the
    // unused object silently disappear.
    // order.seller (buyer view, via getMyOrder's join) and vendorOverride
    // (seller view — passed in with only a FEW fields actually known,
    // e.g. gstin; its city/state/display_name are often null because
    // AuthContext's profile doesn't carry a seller's shop info) can each
    // carry data the other lacks. A plain object spread would let
    // vendorOverride's null fields stomp order.seller's real values, so
    // merge field-by-field and only take a vendorOverride value when it's
    // actually present (not null/undefined).
    function mergeVendor(base, override) {
        if (!base && !override) return null;
        const merged = { ...(base || {}) };
        for (const [key, value] of Object.entries(override || {})) {
            if (value != null) merged[key] = value;
        }
        return merged;
    }
    const vendor = mergeVendor(order.seller, vendorOverride);
    const vendorName = vendor?.display_name || "—";
    const vendorLocation = [vendor?.city, vendor?.state].filter(Boolean).join(", ");
    const vendorGstin = vendor?.business?.gstin || vendor?.gstin || null;
    const deliverToName = addr.contact_name || order.buyer_contact_name || "";

    const sellerState = vendor?.state || null;
    const buyerState = addr.state || null;
    const isIntraState = !!(sellerState && buyerState && sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase());

    // Single source of truth for every number below — see
    // shared/orderPricing.js for the step-by-step derivation.
    const { rows: breakdownRows, totals, gstPercent } = computeOrderBreakdown(order);
    const { grossAmount, discountAmount, taxableValue, gstAmount, totalPayable } = totals;
    const half = round2(gstAmount / 2);
    const halfPercent = round2(gstPercent / 2);

    const walletDeduction = computeWalletDeduction(order);
    const paymentTerms = visiblePaymentTerms(order, variant);
    const freightState = orderFreightState(order);

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
                <div className={`grid grid-cols-2 gap-x-4 gap-y-3 border-b pb-4 ${paymentTerms ? "sm:grid-cols-3" : "sm:grid-cols-4"}`} style={{ borderColor: C.hair }}>
                    <MetaField label="Order No." value={order.order_number} mono />
                    <MetaField label="Order Date" value={fmtDate(order.created_at) || "—"} />
                    <MetaField
                        label={isDelivered ? "Delivered On" : "Estimated Delivery"}
                        value={deliveryDateLabel(order, firstItem)}
                    />
                    <MetaField label="Transport" value={transport.label || "To be decided"} />
                    {paymentTerms && <MetaField label="Payment" value={paymentTermsLabel(paymentTerms)} />}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 border-b pb-4 sm:grid-cols-2" style={{ borderColor: C.hair }}>
                    <PartyBlock label="Vendor (Seller)" name={vendorName}>
                        {vendorLocation && <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>{vendorLocation}</p>}
                        {vendorGstin && <p className="mt-0.5 text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>GSTIN: {vendorGstin}</p>}
                    </PartyBlock>
                    <PartyBlock
                        label="Deliver To"
                        name={deliverToName}
                        subline={order.buyer_business_name ? `${order.buyer_business_name}${order.buyer_gstin ? ` · ${order.buyer_gstin}` : ""}` : null}
                    >
                        <p className="text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                            {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                    </PartyBlock>
                </div>

                {/* Desktop table — Rate / Discount / Taxable value are all in the
                    SAME (GST-excluded) unit system, so Gross − Discount = Taxable
                    value is checkable at a glance without doing tax math. */}
                <div className="mt-4 hidden overflow-hidden rounded-lg border sm:block" style={{ borderColor: C.hair }}>
                    <table className="w-full text-[12.5px]">
                        <thead>
                            <tr style={{ background: C.accent }}>
                                <Th className="w-10">Sr</Th>
                                <Th>Description of Goods</Th>
                                <Th className="w-40">Qty</Th>
                                <Th className="w-24 text-right">Rate<br /><span className="font-normal normal-case opacity-80">(excl. GST, before discount)</span></Th>
                                <Th className="w-24 text-right">Discount</Th>
                                <Th className="w-28 text-right">Taxable Value</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {breakdownRows.map(({ item: it, breakdown: b }, i) => (
                                <tr key={it.id || i} className="border-t align-top" style={{ borderColor: C.hair, background: i % 2 === 1 ? "#fafbfb" : "#fff" }}>
                                    <Td>{i + 1}</Td>
                                    <Td>
                                        <span className="block font-bold tracking-wide" style={{ color: C.ink }}>{it.product_name_snapshot}</span>
                                        {it.brand_name_snapshot && (
                                            <span className="mt-0.5 block text-[11px] font-bold tracking-wide" style={{ color: C.accent }}>
                                                Brand: {it.brand_name_snapshot}
                                            </span>
                                        )}
                                        {freightState === "mixed" && <ItemFreightPill item={it} order={order} viewer={variant} />}
                                    </Td>
                                    <Td><ItemQuantityLine item={it} mutedColor={C.muted} /></Td>
                                    <Td className="text-right tabular-nums">₹{inr(b.rate)}</Td>
                                    <Td className="text-right tabular-nums">
                                        {b.discountPercent > 0 ? (
                                            <span style={{ color: "#059669" }}>{b.discountPercent}%<br />(−₹{inr(b.discountAmount)})</span>
                                        ) : "—"}
                                    </Td>
                                    <Td className="text-right tabular-nums font-bold">₹{inr(b.taxableValue)}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile stacked rows */}
                <div className="mt-4 flex flex-col gap-2 sm:hidden">
                    {breakdownRows.length > 0 && (
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Items</span>
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>Taxable value</span>
                        </div>
                    )}

                    {breakdownRows.map(({ item: it, breakdown: b }, i) => (
                        <div key={it.id || i} className="rounded-lg border p-2.5" style={{ borderColor: C.hair }}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{i + 1}. {it.product_name_snapshot}</p>
                                    {it.brand_name_snapshot && (
                                        <p className="mt-0 text-[11px] font-bold tracking-wide" style={{ color: C.accent }}>Brand: {it.brand_name_snapshot}</p>
                                    )}
                                    {freightState === "mixed" && <ItemFreightPill item={it} order={order} viewer={variant} />}
                                </div>
                                <span className="shrink-0 text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>₹{inr(b.taxableValue)}</span>
                            </div>

                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <span>Quantity: <ItemQuantityLine item={it} mutedColor={C.muted} /></span>
                                <span>Rate (excl. GST): ₹{inr(b.rate)}</span>
                                {b.discountPercent > 0 && (
                                    <span style={{ color: "#059669" }}>Discount: {b.discountPercent}% (−₹{inr(b.discountAmount)})</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals — everything up to Taxable value stays GST-excluded;
                    GST is introduced exactly once, then Total Payable. */}
                <div className="mt-4 flex flex-col items-end gap-1.5 border-t pt-4" style={{ borderColor: C.hair }}>
                    {isSample ? (
                        <TotalRow label="Total" value={`₹${inr(order.total_amount)}`} bold />
                    ) : (
                        <>
                            <TotalRow label="Gross amount (excl. GST)" value={`₹${inr(grossAmount)}`} />
                            {discountAmount > 0 && (
                                <TotalRow label="Discount" value={`− ₹${inr(discountAmount)}`} color="#059669" />
                            )}
                            {round2(grossAmount) !== round2(taxableValue) && (
                                <TotalRow
                                    label="Taxable value"
                                    value={`₹${inr(taxableValue)}`}
                                />
                            )}
                            {isIntraState ? (
                                <>
                                    <TotalRow label={`CGST (${halfPercent}%)`} value={`₹${inr(half)}`} />
                                    <TotalRow label={`SGST (${halfPercent}%)`} value={`₹${inr(round2(gstAmount - half))}`} />
                                </>
                            ) : (
                                <TotalRow label={`IGST (${gstPercent}%)`} value={`₹${inr(gstAmount)}`} />
                            )}
                            <div className="mt-1 flex w-full max-w-[300px] justify-between border-t pt-2 text-[15px] font-extrabold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                                <span>Total Payable</span><span className="tabular-nums" style={{ color: C.accent }}>₹{inr(totalPayable)}</span>
                            </div>
                        </>
                    )}

                    {freightState === "included" && (
                        <p className="mt-0.5 flex max-w-[300px] items-center justify-end gap-1.5 text-right text-[12px] font-semibold tracking-wide" style={{ color: "#006F83" }}>
                            <FreightPill included viewer={variant} />
                            {isSellerView ? "No delivery charge — buyer pays nothing extra" : "No delivery charge — this is the final price"}
                        </p>
                    )}
                    {freightState === "extra" && (
                        <p className="mt-0.5 flex max-w-[300px] flex-wrap items-center justify-end gap-1.5 text-right text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            <FreightPill included={false} viewer={variant} />
                            {isSellerView ? "Delivery charge extra — buyer pays this, not you" : "Delivery charge extra — you'll pay this separately"}
                        </p>
                    )}
                    {freightState === "mixed" && (
                        <p className="mt-0.5 max-w-[300px] text-right text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Delivery charge is different for each item — check below.
                        </p>
                    )}

                    {isSellerView && !isSample && (
                        <p className="mt-1 max-w-[350px] text-right text-[12px] font-medium italic tracking-wide" style={{ color: C.muted }}>
                            Wallet deduction: ₹{inr(walletDeduction)} ({order.platform_fee_percent}% Promotion & Visibility Budget + 18%GST)
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