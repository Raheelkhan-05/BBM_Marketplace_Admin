// Dismissable price-change notice (dismissal remembered per order + amounts) and a
// non-dismissable "can't be paid" notice.
import { useState } from "react";
import { X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

const KEY = "bbm_price_notice_dismissed_v1";
const MAX = 200;
const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function readAll() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || "{}");
        return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch { return {}; }
}
function remember(k) {
    try {
        const all = readAll();
        all[k] = Date.now();
        const keys = Object.keys(all);
        if (keys.length > MAX) keys.sort((a, b) => all[a] - all[b]).slice(0, keys.length - MAX).forEach((x) => delete all[x]);
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* private mode */ }
}

const TONES = {
    up: { bg: "#FEF6E7", fg: "#92600A", Icon: TrendingUp },
    down: { bg: "#E7F6EE", fg: "#12794A", Icon: TrendingDown },
    bad: { bg: "#FDECEA", fg: "#B3261E", Icon: AlertTriangle },
};

export function NoticeBox({ tone, title, children, onDismiss, role = "status" }) {
    const t = TONES[tone] || TONES.bad;
    return (
        <div role={role} style={{
            display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0 0",
            padding: "10px 12px", borderRadius: 12, background: t.bg, color: t.fg,
        }}>
            <t.Icon size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>
                <b style={{ display: "block", fontSize: 13.5 }}>{title}</b>
                {children}
            </div>
            {onDismiss && (
                <button type="button" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                    style={{ background: "transparent", border: 0, padding: 2, cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                    <X size={16} />
                </button>
            )}
        </div>
    );
}

export default function PriceChangeNotice({ id, from, to }) {
    const key = `${id}:${from}>${to}`;
    const [dismissed, setDismissed] = useState(null);
    if (dismissed === key || readAll()[key] != null) return null;

    const up = Number(to) > Number(from);
    return (
        <NoticeBox
            tone={up ? "up" : "down"}
            title={up ? `Price increased: ${money(from)} → ${money(to)}` : `Price dropped: ${money(from)} → ${money(to)}`}
            onDismiss={() => { remember(key); setDismissed(key); }}
        >
            {/* The seller updated the price after you placed this order. You'll pay the updated amount ({money(to)}). */}
        </NoticeBox>
    );
}

const REASON = {
    LISTING_UNAVAILABLE: "is no longer available from the seller",
    LISTING_EXPIRED: "is no longer available (the seller's offer has ended)",
    PACKAGING_CHANGED: "was repackaged by the seller, so this quantity no longer applies",
    BELOW_MOQ: "is now below the seller's minimum order quantity",
    OUT_OF_STOCK: "is out of stock",
    EXCEEDS_AVAILABLE_STOCK: "is now more than the seller has in stock",
};

export function OrderBlockedNotice({ code, product }) {
    return (
        <NoticeBox tone="bad" role="alert" title="This order can't be paid right now">
            {product || "An item"} {REASON[code] || "can't be bought right now"}. You can cancel the order and place a new one.
        </NoticeBox>
    );
}