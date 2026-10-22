// components/orders/OrderDisplayHelpers.jsx
//
// Shared presentational helpers for the order-facing pages
// (OrdersPage [purchase + sales cards], OrderDetailPage,
// SellerOrderDetailPage, PurchaseOrderDocument) so status / quantity /
// price / delivery / payment / freight formatting is defined once instead
// of drifting across separate implementations.
//
// NEW (this pass):
//  - PaymentTermsBanner: a solid, full-width strip at the very TOP of an
//    order card ("Purchased on credit" / "Advance payment") so it can't be
//    missed. credit → buyer + seller; advance → seller only.
//  - FreightNotice: a clear one-line "Freight included / extra in the final
//    price" statement on cards. Freight readers now accept more field
//    shapes (booleans, 0/1, "true"/"false", nested listing/submission).
//  - ChatWithBuyerButton: replaces showing the buyer's phone/email.
//
// EARLIER PASS:
//  - getPaymentTerms / visiblePaymentTerms: credit vs advance payment.
//  - itemFreightIncluded / orderFreightState / FreightPill: freight flag.
//  - PartyBlock / TotalRow / DOC_C: the "Deliver To" and totals styling
//    that PurchaseOrderDocument already used, now shared so the Sales
//    order card matches it exactly.
//  - computeWalletDeduction: single source of truth for the seller's
//    wallet deduction (was copy-pasted in three places).
//
// ASSUMED FIELD NAMES (adjust ONLY in the small readers below if your
// schema differs — nothing else in the UI needs to change):
//   payment terms : order.payment_mode | payment_type | payment_terms |
//                   payment_method  (value containing "credit" or
//                   "advance"/"prepaid"/"upfront"), or boolean
//                   order.is_credit_order / order.on_credit
//   freight       : order_items.freight_included_snapshot | freight_included
//                   (or nested item.submission / item.listing /
//                   item.product .freight_included), falling back to
//                   order.freight_included
//   buyer chat id : order.buyer_id | buyer_user_id | user_id | buyer.id
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { getOrCreateDirectConversation } from "../../utils/chatApi.js";

import { Calendar, Truck, CreditCard, Banknote, MessageCircle, Loader2, Users } from "lucide-react";

// One consistent pill language for every at-a-glance fact on a card —
// status/sample/group already used this shape; credit and freight now
// match instead of living in a banner + a separate text line.
function Pill({ icon: Icon, text, bg, fg }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide" style={{ background: bg, color: fg }}>
            <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
            {text}
        </span>
    );
}

export function CreditPill({ viewer = "buyer" }) {
    return <Pill icon={CreditCard} bg="#4f46e514" fg="#4f46e5" text={viewer === "seller" ? "Purchased on credit · Buyer pays later" : "Purchased on credit · You will Pay later"} />;
}

export function AdvancePaidPill() {
    return <Pill icon={Banknote} bg="#05966914" fg="#059669" text="Paid in advance" />;
}

export function FreightTag({ order, viewer = "buyer" }) {
    const state = orderFreightState(order);
    if (!state || state === "mixed") return null; // "mixed" needs a sentence, not a pill — shown separately
    if (state === "included") return <Pill icon={Truck} bg="#006F8314" fg="#006F83" text="Free delivery" />;
    return <Pill icon={Truck} bg="#f59e0b1a" fg="#b45309" text={viewer === "seller" ? "Buyer pays delivery charges" : "You will pay delivery charges"} />;
}

// Every scannable fact about an order in ONE row: status, sample,
// group, payment terms, freight. Replaces the old banner + separate
// freight line + separate group badge, so the card reads as one thing.
export function OrderTagsRow({ order, viewer, isSample, groupNumber }) {
    const terms = visiblePaymentTerms(order, viewer);
    const freightState = orderFreightState(order);
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {isSample && <SampleBadge />}
            {groupNumber && (
                <Pill icon={Users} bg="#0B728514" fg="#0B7285" text={`Group #${groupNumber}`} />
            )}
            {terms === "credit" && <CreditPill viewer={viewer} />}
            {terms === "advance" && <AdvancePaidPill />}
            <FreightTag order={order} viewer={viewer} />
            {freightState === "mixed" && (
                <Pill icon={Truck} bg={DOC_C.hairSoft} fg={DOC_C.muted} text="Delivery cost varies by item" />
            )}
        </div>
    );
}

// Same values PurchaseOrderDocument uses for its own palette.
export const DOC_C = { ink: "#0B1116", muted: "#667077", hair: "rgba(11,17,22,0.12)", hairSoft: "rgba(11,17,22,0.05)", accent: "#0B7285" };

function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const STATUS_STYLE = {
    awaiting_payment: { bg: "#64748b14", fg: "#475569", label: "Awaiting payment" },
    not_accepted: { bg: "#D2462B14", fg: "#D2462B", label: "Not accepted" },
    pending_confirmation: { bg: "#f59e0b14", fg: "#b45309", label: "Awaiting seller" },
    confirmed: { bg: "#006F8314", fg: "#006F83", label: "Confirmed" },
    processing: { bg: "#006F8314", fg: "#006F83", label: "Processing" },
    shipped: { bg: "#7c3aed14", fg: "#7c3aed", label: "Shipped" },
    delivered: { bg: "#05966914", fg: "#059669", label: "Delivered" },
    cancelled: { bg: "#64748b14", fg: "#64748b", label: "Cancelled" },
    rejected: { bg: "#D2462B14", fg: "#D2462B", label: "Rejected" },
};

export const displayStatus = (order) => (order?.auto_rejected_at ? "not_accepted" : order?.status);

export function StatusChip({ status, size = "sm" }) {
    const s = STATUS_STYLE[status] || { bg: "#64748b14", fg: "#64748b", label: String(status || "").replace(/_/g, " ") };
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
    // Pass through range labels like "10 Sept - 11 Sept" as-is —
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
        const ts = order.delivered_at || deliveredAt || order.updated_at;
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

/* ======================= payment terms (credit / advance) ======================= */

// Normalises whatever the order row stores into "credit" | "advance" | null.
// null = unknown → nothing is shown (better than guessing).
export function getPaymentTerms(order) {
    if (!order) return null;
    if (order.is_credit_order === true || order.on_credit === true) return "credit";
    const raw = order.payment_mode ?? order.payment_type ?? order.payment_terms ?? order.payment_method ?? null;
    const v = String(raw || "").toLowerCase();
    if (!v) return null;
    if (v.includes("credit")) return "credit";
    if (v.includes("upi") || v.includes("advance") || v.includes("prepaid") || v.includes("upfront")) return "advance";
    // if (v.includes("advance") || v.includes("prepaid") || v.includes("upfront")) return "advance";
    return null;
}

export function paymentTermsLabel(terms) {
    if (terms === "credit") return "Pay later — bought on credit";
    if (terms === "advance") return "Buyer paid in advance";
    return null;
}

// Visibility rule:
//   credit  → buyer + seller
//   advance → seller only
export function visiblePaymentTerms(order, viewer) {
    const terms = getPaymentTerms(order);
    if (!terms) return null;
    if (terms === "advance" && viewer !== "seller") return null;
    return terms;
}

// Solid, full-width strip meant to sit at the very top of an order card
// (it uses negative margins to cancel the card's own p-3.5 / sm:p-4
// padding and round its top corners to the card's radius). Pass
// `standalone` to render it as a normal rounded block instead (detail
// pages).
export function PaymentTermsBanner({ order, viewer, standalone = false }) {
    const terms = visiblePaymentTerms(order, viewer);
    if (!terms) return null;
    const isCredit = terms === "credit";
    const Icon = isCredit ? CreditCard : Banknote;
    return (
        <div
            className={`flex items-center gap-2 px-3.5 py-2 text-white sm:px-4 ${standalone ? "mt-4 rounded-xl" : "-mx-3.5 -mt-3.5 mb-3 rounded-t-[15px] sm:-mx-4 sm:-mt-4"}`}
            style={{ background: isCredit ? "#4f46e5" : "#059669" }}
        >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.4} />
            <span className="text-[12.5px] font-extrabold uppercase tracking-[0.08em]">{paymentTermsLabel(terms)}</span>
        </div>
    );
}

// Some legacy address snapshots already have city/state/pincode baked
// into address_line1/2 (as saved at order time). Appending them again
// unconditionally produces visible duplication ("Rajkot, Rajkot, Gujarat
// - 360003, Rajkot, Gujarat - 360003"). This only appends the
// city/state/pincode tail when it isn't already present in the lines.
export function formatDeliveryAddress(addr) {
    if (!addr) return "";
    const lines = [addr.address_line1, addr.address_line2].filter(Boolean);
    const linesText = lines.join(", ").toLowerCase();
    const tail = [addr.city, addr.state].filter(Boolean).join(", ") + (addr.pincode ? ` - ${addr.pincode}` : "");

    const cityAlreadyThere = addr.city && linesText.includes(addr.city.toLowerCase());
    const pincodeAlreadyThere = addr.pincode && linesText.includes(String(addr.pincode));
    if (cityAlreadyThere && pincodeAlreadyThere) {
        return lines.join(", ");
    }
    return [...lines, tail].filter(Boolean).join(", ");
}

/* ================================ freight ================================ */

function toBool(v) {
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "1" || v === "true" || v === "t") return true;
    if (v === 0 || v === "0" || v === "false" || v === "f") return false;
    return null;
}

// NEW: your schema has no boolean freight flag anywhere — only the free-text
// seller_product_submissions.freight_terms column. Parse that as the
// source of truth instead of silently returning null forever.
export function parseFreightTerms(text) {
    if (typeof text !== "string" || !text.trim()) return null;
    const t = text.toLowerCase();
    if (t.includes("included") || t.includes("inclusive")) return true;
    if (t.includes("extra") || t.includes("borne by the buyer") || t.includes("not included")) return false;
    return null; // wording we don't recognize — better to show nothing than guess wrong
}

export function itemFreightIncluded(item, order) {
    const boolCandidates = [
        item?.freight_included_snapshot,
        item?.freight_included,
        item?.freightIncluded,
        item?.submission?.freight_included,
        item?.listing?.freight_included,
        item?.product?.freight_included,
        order?.freight_included,
    ];
    for (const c of boolCandidates) {
        const b = toBool(c);
        if (b !== null) return b;
    }
    // NEW: fall back to the actual text field that exists on your schema.
    const textCandidates = [
        item?.freight_terms_snapshot,
        item?.freight_terms,
        item?.submission?.freight_terms,
        item?.listing?.freight_terms,
        item?.product?.freight_terms,
        order?.freight_terms,
    ];
    for (const c of textCandidates) {
        const b = parseFreightTerms(c);
        if (b !== null) return b;
    }
    return null;
}

// "included" | "extra" | "mixed" | null for a whole order.
export function orderFreightState(order) {
    const items = order?.items || [];
    const states = items.map((it) => itemFreightIncluded(it, order)).filter((s) => s !== null);
    if (!states.length) {
        const b = toBool(order?.freight_included);
        return b === null ? null : (b ? "included" : "extra");
    }
    if (states.every((s) => s === true)) return "included";
    if (states.every((s) => s === false)) return "extra";
    return "mixed";
}

export function FreightPill({ included, viewer = "buyer" }) {
    const text = included
        ? "Delivery: Free"
        : viewer === "seller" ? "Buyer pays delivery" : "You pay delivery";
    return (
        <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide whitespace-nowrap"
            style={
                included
                    ? { background: `#006F8314`, color: "#006F83" }
                    : { background: "#f59e0b1a", color: "#b45309" }
            }
        >
            <Truck className="h-2.5 w-2.5" strokeWidth={2.5} />
            {text}
        </span>
    );
}

let __freightWarned = false;

// One plain sentence, worded so it's always clear the BUYER is the one
// who pays delivery when it's not included — never ambiguous about who
// bears the cost, for either the buyer or the seller reading it.
export function FreightNotice({ order, viewer = "buyer", className = "mt-2.5" }) {
    const state = orderFreightState(order);
    if (!state) {
        if (import.meta.env?.DEV && !__freightWarned) {
            __freightWarned = true;
            // eslint-disable-next-line no-console
            console.warn(
                "[FreightNotice] No freight flag found on this order, so nothing is shown. " +
                "The orders API isn't returning it. Item keys:", Object.keys(order?.items?.[0] || {}),
                "Order keys:", Object.keys(order || {})
            );
        }
        return null;
    }
    const cfg = state === "included"
        ? {
            bg: "#006F8314", fg: "#006F83",
            text: viewer === "seller" ? "No delivery charge — buyer pays nothing extra" : "No delivery charge — this price is final",
        }
        : state === "extra"
            ? {
                bg: "#f59e0b1a", fg: "#b45309",
                text: viewer === "seller" ? "Delivery charge extra — buyer pays this, not you" : "Delivery charge extra — you'll pay this separately",
            }
            : {
                bg: DOC_C.hairSoft, fg: DOC_C.muted,
                text: "Delivery charge: not the same for every item",
            };
    return (
        <div className={className}>
            <span
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg ps-2 text-[11.5px] font-bold tracking-wide"
                style={{ color: cfg.fg }}
            >
                <Truck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                {cfg.text}
            </span>
        </div>
    );
}

/* ================== document-style blocks (shared with PO doc) ================== */

// "Vendor (Seller)" / "Deliver To" style block: small uppercase caption,
// bold name, optional muted subline, then any extra lines as children.
export function PartyBlock({ label, name, subline, children }) {
    return (
        <div>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: DOC_C.muted }}>{label}</p>
            {name && <p className="mt-1 text-[14px] font-extrabold tracking-wide" style={{ color: DOC_C.ink }}>{name}</p>}
            {subline && <p className="text-[12px] font-semibold tracking-wide" style={{ color: DOC_C.muted }}>{subline}</p>}
            {children}
        </div>
    );
}

export function TotalRow({ label, value, bold, color }) {
    return (
        <div className="flex w-full max-w-[300px] justify-between text-[12.5px] font-semibold tracking-wide" style={{ color: color || DOC_C.muted }}>
            <span className={bold ? "font-extrabold" : ""}>{label}</span>
            <span className={`tabular-nums ${bold ? "font-extrabold" : ""}`} style={{ color: bold ? DOC_C.ink : (color || DOC_C.ink) }}>{value}</span>
        </div>
    );
}

// Seller's wallet deduction for an order: platform fee % of the subtotal
// plus 18% GST on that fee. Single source of truth (previously repeated in
// OrdersPage and PurchaseOrderDocument).
export function computeWalletDeduction(order) {
    const subtotal = Number(order?.subtotal_amount) || 0;
    const feePercent = Number(order?.platform_fee_percent) || 0;
    return round2(subtotal * feePercent / 100 * 1.18);
}

/* ============================== buyer chat ============================== */

// Id used in the /chat/:id route for this order's buyer.
export function buyerChatId(order) {
    return order?.buyer_id ?? order?.buyer_user_id ?? order?.user_id ?? order?.buyer?.id ?? null;
}

// Replaces showing the buyer's phone / email. Stops click propagation so
// it works inside clickable order cards.
export function ChatWithBuyerButton({ order, className = "mt-2" }) {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const id = buyerChatId(order);

    if (!id) {
        if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.warn("[ChatWithBuyerButton] No buyer id on this order. Order keys:", Object.keys(order || {}));
        }
        return null;
    }

    const handleClick = async (e) => {
        e.stopPropagation();
        if (loading) return;
        setLoading(true);
        try {
            // BUG FIX: this used to navigate straight to /chat/${id} using the
            // buyer's USER id as if it were a conversation id. Conversations
            // have their own id — has to be looked up/created first, exactly
            // like ConversationList.startChat does.
            const res = await getOrCreateDirectConversation(token, id);
            if (res?.success && res.conversationId) {
                navigate(`/chat/${res.conversationId}`);
            } else {
                window.alert(res?.message || "Couldn't open a chat with this buyer.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold tracking-wide transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-60 ${className}`}
            style={{ borderColor: DOC_C.accent, color: DOC_C.accent }}
        >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.3} />}
            Chat with buyer
        </button>
    );
}