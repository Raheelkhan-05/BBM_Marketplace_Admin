// components/orders/OrderDisplayHelpers.jsx
//
// Shared presentational helpers for the four order-facing pages
// (PurchaseOrdersPage, SalesOrdersPage, OrderDetailPage,
// SellerOrderDetailPage) so status/quantity/price/delivery formatting is
// defined once instead of drifting across four separate implementations.
import { Calendar } from "lucide-react";

export const STATUS_STYLE = {
    pending_confirmation: { bg: "#f59e0b14", fg: "#b45309", label: "Awaiting seller" },
    confirmed: { bg: "#006F8314", fg: "#006F83", label: "Confirmed" },
    processing: { bg: "#006F8314", fg: "#006F83", label: "Processing" },
    shipped: { bg: "#7c3aed14", fg: "#7c3aed", label: "Shipped" },
    delivered: { bg: "#05966914", fg: "#059669", label: "Delivered" },
    cancelled: { bg: "#64748b14", fg: "#64748b", label: "Cancelled" },
    rejected: { bg: "#D2462B14", fg: "#D2462B", label: "Rejected" },
};

export function StatusChip({ status, size = "sm" }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.pending_confirmation;
    return (
        <span
            className={`shrink-0 rounded-full font-extrabold capitalize tracking-wider ${size === "lg" ? "px-2.5 py-1 text-[11.5px]" : "px-2 py-0.5 text-[11.5px]"}`}
            style={{ background: s.bg, color: s.fg }}
        >
            {s.label}
        </span>
    );
}

export function SampleBadge({ size = "sm" }) {
    return (
        <span className={`flex shrink-0 items-center gap-1 rounded-full font-extrabold tracking-wider ${size === "lg" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"}`} style={{ background: "#7c3aed14", color: "#7c3aed" }}>
            Sample
        </span>
    );
}

export function basisLabel(basis) {
    if (basis === "per_pack") return "pack";
    if (basis === "per_master_pack") return "master pack";
    return null;
}

// Renders "12 master packs (600 pcs)" when pack data exists, otherwise
// falls back to the raw unit quantity for orders placed before the
// pack_quantity_snapshot column existed.
export function ItemQuantityLine({ item, mutedColor = "#667077" }) {
    const bLabel = basisLabel(item.purchase_basis);
    if (bLabel && item.pack_quantity_snapshot != null) {
        const packQty = item.pack_quantity_snapshot;
        return (
            <span className="text-xs font-extrabold tracking-wider capitalize">
                {packQty} {bLabel}{Number(packQty) === 1 ? "" : "s"}
                <span style={{ color: mutedColor }}> ({item.quantity} {item.unit})</span>
            </span>
        );
    }
    return <span>{item.quantity} {item.unit}</span>;
}

// lead_time_snapshot holds the RPC-computed "DD Mon" estimated delivery
// date string for orders placed after this rollout; older orders may
// still carry the previous free-text lead-time value, in which case we
// just don't render anything.
export function looksLikeDeliveryDate(value) {
    return typeof value === "string" && /^\d{2}\s[A-Za-z]{3}$/.test(value);
}

// Accepts the ISO date ("2026-08-20") the RPC actually stores, and stays
// backward-compatible with any legacy "DD Mon" free-text values that may
// exist on orders placed before lead_time_snapshot held a real date.
export function parseDeliveryDate(value) {
    if (typeof value !== "string") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const d = new Date(value + "T00:00:00");
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }
    if (/^\d{2}\s[A-Za-z]{3}$/.test(value)) return value;
    // NEW: pass through range labels like "10 Sept - 11 Sept" as-is —
    // this is what place_order now stores in lead_time_snapshot.
    if (/^\d{1,2}\s[A-Za-z]{3}\s-\s\d{1,2}\s[A-Za-z]{3}$/.test(value)) return value;
    return null;
}

// Shortfall only matters before the seller has acted — matches
// update_order_status's own transition table, where 'confirmed'/'rejected'
// are the only moves out of pending_confirmation.
export function shouldShowShortfall(order) {
    return !!order.stock_shortfall && order.status === "pending_confirmation";
}

export function shouldShowDelivery(order, item) {
    if (order.status === "delivered") return true; // always resolvable — updated_at is always present
    return !!parseDeliveryDate(item?.lead_time_snapshot);
}

// deliveredAt: pass an explicit ISO timestamp when you have it (detail
// pages, from the 'delivered' order_event) — falls back to order.updated_at
// otherwise (list pages, which don't fetch events).
export function DeliveryEstimate({ order, item, deliveredAt, label = "Estimated delivery" }) {
    if (order.status === "delivered") {
        const ts = deliveredAt || order.updated_at;
        if (!ts) return null;
        const formatted = new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        return (
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide" style={{ color: "#059669" }}>
                <Calendar className="h-3 w-3" /> Delivered on: {formatted}
            </p>
        );
    }
    const formatted = parseDeliveryDate(item?.lead_time_snapshot);
    if (!formatted) return null;
    return (
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide" style={{ color: "#006F83" }}>
            <Calendar className="h-3 w-3" /> {label}: {formatted}
        </p>
    );
}

// A genuinely free sample should read as "Free", not "₹0" — and this
// stays readable even for older orders placed before the DB constraint
// fix that still carry the nominal ₹0.01 floor.
export function displayAmount(amount, { isSample = false } = {}) {
    const n = Number(amount) || 0;
    if (isSample && n <= 0.01) return "Free";
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function StockShortfallNote({ audience = "buyer" }) {
    const text = audience === "seller"
        ? "Ordered quantity exceeded your listed stock at the time of order — let the buyer know if fulfilment will take longer."
        : "This item was short on stock when ordered — it may take a little longer to fulfil.";
    return (
        <p className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold leading-snug tracking-wide" style={{ background: "#fef3c7", color: "#a16207" }}>
            {text}
        </p>
    );
}