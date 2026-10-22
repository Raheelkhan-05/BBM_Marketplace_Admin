// utils/notificationDisplay.js
//
// Display helpers for the Console notification timeline:
//   - notificationCategory(n): which part of the app a notification belongs to
//     (label + icon + colour) for the tag shown on the first line of every card.
//   - stampOf / formatTime / dateKeyOf / dateLabelOf: timestamp helpers for the timeline.
//
// Classification order matters: type-based checks come first (a dispute notification links to an
// order page, but it is a "Dispute", not a "Sales order"), link-based checks come last.
import {
    Bell, Package, ShoppingBag, Truck, Wallet, CreditCard, ShieldAlert, Banknote,
} from "lucide-react";

export const CATEGORY = {
    sales: { key: "sales", label: "Sales order", Icon: Package, color: "#0B7285" },
    purchase: { key: "purchase", label: "Purchase order", Icon: ShoppingBag, color: "#114072" },
    transport: { key: "transport", label: "My transport options", Icon: Truck, color: "#9A6700" },
    products: { key: "products", label: "My products", Icon: Package, color: "#1B8559" },
    wallet: { key: "wallet", label: "Wallet", Icon: Wallet, color: "#6741D9" },
    credit: { key: "credit", label: "Credit", Icon: CreditCard, color: "#C2410C" },
    dispute: { key: "dispute", label: "Dispute", Icon: ShieldAlert, color: "#B42318" },
    payment: { key: "payment", label: "Payments", Icon: Banknote, color: "#0F766E" },
    general: { key: "general", label: "Update", Icon: Bell, color: "#5B6672" },
};

const SALES_LINK = /^\/(?:seller|grow)\/orders(?:[/?#]|$)/;
const PURCHASE_LINK = /^\/(?:save\/)?orders(?:[/?#]|$)/;
const WALLET_LINK = /^\/(?:seller|grow)\/wallet/;
const PRODUCTS_LINK = /^\/(?:seller|grow)\/(?:products|listings)|^\/home\?highlight=|^\/listings/;
const CREDIT_LINK = /^\/credit|^\/grow\/customers/;

export function notificationCategory(n) {
    const type = typeof n?.type === "string" ? n.type : "";
    const link = typeof n?.link === "string" ? n.link : "";

    if (type.startsWith("dispute_")) return CATEGORY.dispute;
    if (type.startsWith("transport_proposal_") || /transport/i.test(link)) return CATEGORY.transport;
    if (type.startsWith("payment_") || type.startsWith("refund_") || type === "payout_released") return CATEGORY.payment;
    if (type.startsWith("wallet_") || WALLET_LINK.test(link)) return CATEGORY.wallet;
    if (type.startsWith("credit_") || CREDIT_LINK.test(link)) return CATEGORY.credit;
    if (type.startsWith("listing_") || type.startsWith("seller_") || type === "brand_item_approved" || PRODUCTS_LINK.test(link)) {
        return CATEGORY.products;
    }
    if (SALES_LINK.test(link)) return CATEGORY.sales;
    if (PURCHASE_LINK.test(link)) return CATEGORY.purchase;
    return CATEGORY.general;
}

// The server's timestamp field name is not known here, so a few common ones are tried.
export const stampOf = (n) => n?.created_at ?? n?.createdAt ?? n?.timestamp ?? null;

const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
};

export function formatTime(v) {
    const d = toDate(v);
    return d ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "").toLowerCase() : "";
}

// Local-calendar-day key, used to split the timeline into one line per date.
export function dateKeyOf(v) {
    const d = toDate(v);
    return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "none";
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dateLabelOf(v) {
    const d = toDate(v);
    if (!d) return "Earlier";
    const now = new Date();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    const opts = d.getFullYear() === now.getFullYear()
        ? { weekday: "short", day: "numeric", month: "short" }
        : { day: "numeric", month: "short", year: "numeric" };
    return d.toLocaleDateString("en-IN", opts);
}