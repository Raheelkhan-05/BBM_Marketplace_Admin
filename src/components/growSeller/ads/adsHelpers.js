// Shared helpers for the Promote (ads) screens. All wall-clock text is IST, because slots are IST hours.
export const TZ = "Asia/Kolkata";

export const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const fmt = (opts) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts });
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const istDateKey = (d = new Date()) => ymd.format(d); // "YYYY-MM-DD"
const parts = (opts, iso) => Object.fromEntries(fmt(opts).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
export function fmtHour(iso) {
    const p = parts({ hour: "numeric", hour12: true }, iso);
    return `${p.hour} ${String(p.dayPeriod || "").toLowerCase()}`.trim(); // "2 pm"
}
export function fmtDateTime(iso) {
    const p = parts({ day: "numeric", month: "short", hour: "numeric", hour12: true }, iso);
    return `${p.day} ${p.month}, ${p.hour} ${String(p.dayPeriod || "").toLowerCase()}`.trim(); // "3 Dec, 2 pm"
}
export const fmtDay = (key) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(`${key}T00:00:00+05:30`));
export const endIso = (startIso, hours) => new Date(new Date(startIso).getTime() + Number(hours) * 3600000).toISOString();

export const monthOf = (key) => String(key).slice(0, 7);
export function addMonths(monthKey, n) {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function addDays(key, n) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function monthLabel(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
// Monday-first grid: null padding, then "YYYY-MM-DD" keys.
export function monthGrid(monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) cells.push(`${monthKey}-${String(d).padStart(2, "0")}`);
    return cells;
}

export const newIdemKey = () =>
    String(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^\w-]/g, "").slice(0, 60);

// Consecutive hours with the same price/reason collapse into one line of the breakdown.
export function groupLines(lines) {
    const out = [];
    for (const l of lines || []) {
        const t = new Date(l.hour).getTime();
        const rate = Number(l.rate) || 0;
        const last = out[out.length - 1];
        if (last && last.rate === rate && last.override === (l.override || null) && t === last.endMs) {
            last.hours += 1; last.endMs = t + 3600000; last.sum += rate; last.occ = Math.max(last.occ, Number(l.occupancy) || 0);
        } else {
            out.push({ startMs: t, endMs: t + 3600000, hours: 1, rate, sum: rate, override: l.override || null, occ: Number(l.occupancy) || 0 });
        }
    }
    return out;
}

export function demandLabel(lines) {
    const occ = (lines || []).reduce((a, l) => Math.max(a, Number(l.occupancy) || 0), 0);
    if (occ >= 0.66) return { key: "high", text: "High demand. Prices rise as this time fills up." };
    if (occ >= 0.33) return { key: "mid", text: "Moderate demand." };
    return { key: "low", text: "Low demand right now, so this is a good price." };
}

/* ------- wallet round trip ------- */
// Where a seller goes to top up, and where they come back to. The wallet page keeps this URL, and
// redirectToGateway() remembers it, so PaymentReturnPage can read `returnTo` back out of it.
export const RETURN_AFTER_TOPUP = "/sell/ads?resume=1";
export const topUpPath = (shortfall) =>
    `/sell/wallet?amount=${Math.max(1, Math.ceil(Number(shortfall) || 0))}&returnTo=${encodeURIComponent(RETURN_AFTER_TOPUP)}`;

// Only ever navigate to our own Promote screen. Rejects "//host", full URLs and anything else.
export function safeReturnTo(v) {
    const s = String(v || "");
    return /^\/sell\/ads(\?[\w=&%.\-]*)?$/.test(s) ? s : null;
}
// "/sell/wallet?amount=500&returnTo=%2Fsell%2Fads%3Fresume%3D1" -> "/sell/ads?resume=1" (or null)
export function returnToFromWalletPath(path) {
    try { return safeReturnTo(new URL(String(path || ""), "https://x.invalid").searchParams.get("returnTo")); }
    catch { return null; }
}

/* ------- draft (survives the wallet round trip; 2 hours) -------
   sessionStorage first. localStorage is a fallback because on the Android app the gateway opens in a
   Custom Tab and the app WebView can be recreated, which would lose sessionStorage. */
const DRAFT_KEY = "bbm_ad_draft_v1";
const DRAFT_TTL = 2 * 3600 * 1000;
function parseDraft(raw) {
    try {
        const d = JSON.parse(raw || "null");
        if (!d || !d.placementKey || Date.now() - Number(d.ts) > DRAFT_TTL) return null;
        return d;
    } catch { return null; }
}
export function readDraft() {
    let raw = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { /* ignore */ }
    const a = parseDraft(raw);
    if (a) return a;
    try { return parseDraft(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}
export function writeDraft(d) {
    const s = JSON.stringify({ ...d, ts: Date.now() });
    try { sessionStorage.setItem(DRAFT_KEY, s); } catch { /* private mode */ }
    try { localStorage.setItem(DRAFT_KEY, s); } catch { /* private mode */ }
}
export function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export const emptyCreative = () => ({ images: {}, alt: "", linkType: "shop", linkSubmissionId: "", submissionId: "" });

export function creativeReady(placement, c) {
    if (!placement || !c) return false;
    if (placement.kind === "product") return !!c.submissionId;
    if (!placement.aspectKeys.every((k) => c.images?.[k])) return false;
    return c.linkType === "shop" || !!c.linkSubmissionId;
}

export function toCreativeInput(placement, c) {
    if (placement.kind === "product") return { submissionId: c.submissionId };
    return {
        images: c.images, alt: c.alt || "",
        link: c.linkType === "product" ? { type: "product", submissionId: c.linkSubmissionId } : { type: "shop" },
    };
}

export const REASON_TEXT = {
    SLOT_TAKEN: "Someone just booked that time. Pick another slot.",
    BLACKED_OUT: "That time is closed for new bookings.",
    OUT_OF_WINDOW: "That start time is in the past or too far ahead.",
    INVALID_START: "Bookings must start on the hour.",
    INVALID_DURATION: "That duration isn't allowed for this placement.",
    PLACEMENT_UNAVAILABLE: "This placement isn't available right now.",
};

export function bookingState(b) {
    if (b.status === "removed") return { key: "removed", label: "Removed by BBM" };
    const now = Date.now(), s = new Date(b.starts_at).getTime(), e = new Date(b.ends_at).getTime();
    if (now < s) return { key: "scheduled", label: "Scheduled" };
    if (now < e) return { key: "live", label: "Live now" };
    return { key: "ended", label: "Ended" };
}