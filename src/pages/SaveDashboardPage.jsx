// src/pages/SaveDashboardPage.jsx — buyer Dashboard (route: /save, via SaveEntry, inside SaveLayout).
// One overview of everything the buyer does in the other tabs, in the Grow dashboard UI (gd-* classes):
//   RFQs (price list + quotes) · Orders · Cart · Credit · Chat.
// It only READS data, using the same calls/hooks the other Save pages use:
//   fetchRfqList + useRfqLive (RFQ), fetchMyOrders + useRealtimeOrders (Orders), useCreditCenter (Credit),
//   useSaveBadges (cart / unread counts). Every card links to the tab where the work is done.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Send, Inbox, Package, CreditCard, ShoppingCart, MessageSquare, ChevronRight, AlertCircle, Check, Receipt,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchRfqList } from "../utils/rfqApi.js";
import useRfqLive from "../hooks/useRfqLive.js";
import { fetchMyOrders } from "../utils/api.js";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import useCreditCenter from "../hooks/useCreditCenter.js";
import useSaveBadges from "../components/save/useSaveBadges.js";
import { STATUS_LABEL as RFQ_STATUS } from "../components/save/SaveEnquiryInfoModal.jsx";
import { displayStatus, displayAmount } from "../components/orders/OrderDisplayHelpers.jsx";
import { fmtINR } from "../components/credit/tokens.js";
import { fmtNum } from "../utils/rfqUtils.js";
import "../components/growSeller/grow-modules.css";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
const toTitle = (s = "") => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ORDER_LABEL = {
    pending_confirmation: "Pending", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped",
    delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled", awaiting_payment: "Awaiting payment", not_accepted: "Not accepted",
};
const orderText = (s) => ORDER_LABEL[s] || String(s || "").replace(/_/g, " ");

// RFQ status -> the pill colours already defined for orders in grow-modules.css
const RFQ_PILL = { pending_review: "pending_confirmation", rejected: "rejected", closed: "awaiting_payment" };

const IN_PROGRESS = new Set(["pending_confirmation", "confirmed", "processing", "shipped"]);
const NOT_SPENT = new Set(["cancelled", "rejected", "not_accepted", "awaiting_payment"]);

/* ---------- purchases chart helpers (same logic as the Grow Sales chart) ---------- */
const D = 864e5;
const MAX_DAYS = 366;
const RANGES = [
    { k: "7", l: "7 days", t: "last 7 days" },
    { k: "14", l: "14 days", t: "last 14 days" },
    { k: "30", l: "1 month", t: "last 30 days" },
    { k: "90", l: "Quarter", t: "last 90 days" },
    { k: "365", l: "Year", t: "last 12 months" },
    { k: "custom", l: "Custom", t: "custom range" },
];
const pad = (n) => String(n).padStart(2, "0");
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromInput = (v) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d); };
const sod = (v) => { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dm = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const short = (n) => {
    if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}k`;
    return `₹${Math.round(n)}`;
};
// Round the top of the chart up to a clean number so the gridlines read well.
const niceMax = (v) => {
    if (v <= 0) return 1;
    const pw = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / pw;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * pw;
};

// Animated number: eases from the previous value to the new one.
function useCountUp(value) {
    const [n, setN] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(value); from.current = value; return undefined; }
        const st = from.current, t0 = performance.now(), dur = 600;
        let raf;
        const step = (now) => {
            const pr = Math.min(1, (now - t0) / dur);
            const cur = st + (value - st) * (1 - Math.pow(1 - pr, 3));
            setN(cur); from.current = cur;
            if (pr < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return n;
}

// A purchase counts on the day the order was placed, unless it was cancelled / rejected / never paid.
const countsAsPurchase = (o) => !NOT_SPENT.has(o.status) && !o.auto_rejected_at;
const amountOf = (o) => Number(o.total_amount) || 0;

// Purchases grouped into bars: daily (<=31 days), weekly (<=120 days), otherwise monthly.
function buildPurchases(list, range, from, to) {
    const today = sod(Date.now());
    let start, end;
    if (range === "custom") {
        end = to ? fromInput(to) : today;
        start = from ? fromInput(from) : addDays(end, -29);
        if (start > end) [start, end] = [end, start];
        if (end > today) end = today;
        if (start > end) start = end;
        if (Math.round((end - start) / D) + 1 > MAX_DAYS) start = addDays(end, -(MAX_DAYS - 1));
    } else {
        end = today;
        start = addDays(today, -(Number(range) - 1));
    }

    const span = Math.round((end - start) / D) + 1;
    const mode = span <= 31 ? "day" : span <= 120 ? "week" : "month";
    const multiYear = start.getFullYear() !== end.getFullYear();
    const buckets = [];

    if (mode === "day") {
        for (let i = 0; i < span; i++) {
            const d = addDays(start, i);
            const isToday = d.getTime() === today.getTime();
            buckets.push({
                s: d.getTime(), e: d.getTime(), value: 0, count: 0,
                label: span <= 7 ? (isToday ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" })) : String(d.getDate()),
                full: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
            });
        }
    } else if (mode === "week") {
        for (let st = new Date(start); st <= end; st = addDays(st, 7)) {
            const e = addDays(st, 6) > end ? end : addDays(st, 6);
            buckets.push({ s: st.getTime(), e: e.getTime(), value: 0, count: 0, label: dm(st), full: `${dm(st)} – ${dm(e)}` });
        }
    } else {
        for (let c = new Date(start.getFullYear(), start.getMonth(), 1); c <= end; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
            const st = c < start ? start : c;
            const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
            const e = last > end ? end : last;
            const name = c.toLocaleDateString("en-IN", { month: "short", ...(multiYear ? { year: "2-digit" } : {}) });
            buckets.push({ s: st.getTime(), e: e.getTime(), value: 0, count: 0, label: name, full: c.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) });
        }
    }

    list.forEach((o) => {
        if (!countsAsPurchase(o)) return;
        const t = sod(o.created_at).getTime();
        const b = buckets.find((x) => t >= x.s && t <= x.e);
        if (b) { b.value += amountOf(o); b.count += 1; }
    });

    buckets.forEach((b) => { b.today = today.getTime() >= b.s && today.getTime() <= b.e; });
    const total = buckets.reduce((n, b) => n + b.value, 0);
    return { buckets, total, start, end, span, mode };
}

function Thumb({ src, name }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [src]);
    return (
        <span className="gd-th">
            {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : (name || "?").trim()[0]?.toUpperCase()}
        </span>
    );
}

function PanelHead({ title, hint, to, label = "View all", nav }) {
    return (
        <div className="gd-ph">
            <h2>{title}</h2>
            {to ? <button type="button" className="gd-link" onClick={() => nav(to)}>{label}<ChevronRight size={15} /></button> : hint && <small>{hint}</small>}
        </div>
    );
}

export default function SaveDashboardPage() {
    const nav = useNavigate();
    const { token, profile } = useAuth();
    const badges = useSaveBadges();

    const shopName = profile?.shop_name || profile?.display_name || profile?.businessProfile?.trade_name
        || profile?.businessProfile?.display_name || profile?.name || "your shop";

    /* ---------- RFQs (same call as the RFQ tab) ---------- */
    const [rfq, setRfq] = useState({ loaded: false, items: [], open: null, quotes: null, rejected: null });
    const loadRfq = useCallback(async () => {
        if (!token) return;
        const base = { scope: "mine", q: "", limit: 1, offset: 0 };
        try {
            const [list, open, rejected] = await Promise.all([
                fetchRfqList(token, { scope: "mine", q: "", status: "", limit: 5, offset: 0 }),
                fetchRfqList(token, { ...base, status: "approved" }),
                fetchRfqList(token, { ...base, status: "rejected" }),
            ]);
            setRfq({
                loaded: true,
                items: list?.success ? list.items || [] : [],
                quotes: list?.success && list.quotesTotal != null ? list.quotesTotal : null,
                open: open?.success ? open.total ?? 0 : null,
                rejected: rejected?.success ? rejected.total ?? 0 : null,
            });
        } catch {
            setRfq((p) => ({ ...p, loaded: true }));
        }
    }, [token]);
    useEffect(() => { loadRfq(); }, [loadRfq]);
    useRfqLive(() => { loadRfq(); }, { enabled: !!token }); // a seller sent / changed a quote

    /* ---------- Orders (same call as the Orders tab) ---------- */
    const fetchOrders = useCallback(async () => {
        const res = await fetchMyOrders(token);
        if (!res?.success) throw new Error(res?.message || "Couldn't load orders.");
        return res.orders;
    }, [token]);
    const { orders: rawOrders, loading: ordersLoading } = useRealtimeOrders({ channelToken: profile?.notificationChannel, fetcher: fetchOrders });

    const orders = useMemo(
        () => [...(rawOrders || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        [rawOrders]
    );
    const orderStats = useMemo(() => {
        let unpaid = 0, inProgress = 0;
        for (const o of orders) {
            if (o.status === "awaiting_payment") unpaid += 1;
            if (IN_PROGRESS.has(o.status)) inProgress += 1;
        }
        return { unpaid, inProgress };
    }, [orders]);

    // Purchases chart (same controls as the Grow Sales chart: date ranges, custom dates, tap / hover a bar).
    const [range, setRange] = useState("7");
    const [active, setActive] = useState(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const sales = useMemo(() => buildPurchases(orders, range, from, to), [orders, range, from, to]);
    const nBars = sales.buckets.length;
    const top = niceMax(Math.max(...sales.buckets.map((x) => x.value), 0));
    const labelStep = nBars > 8 ? Math.ceil(nBars / 8) : 1;
    const showValues = nBars <= 10;
    const rangeInfo = RANGES.find((r) => r.k === range);
    const rangeTitle = range === "custom" ? `${dm(sales.start)} – ${dm(sales.end)}` : rangeInfo.t;
    const animTotal = useCountUp(sales.total);
    const unit = { day: "day", week: "week", month: "month" }[sales.mode];
    const best = sales.buckets.reduce((acc, x) => (x.value > (acc?.value || 0) ? x : acc), null);
    const act = active != null ? sales.buckets[active] : null;

    /* ---------- Credit (same hook as the Credit tab) ---------- */
    const credit = useCreditCenter({ isSeller: false, historyOpen: false, historyRole: "buyer" });
    const creditStats = useMemo(() => {
        let approved = 0, available = 0, out = 0, pending = 0;
        for (const s of credit.sellers || []) {
            if (s.sellerUserId === profile?.id) continue;
            const cr = s.credit;
            if (!cr) continue;
            if (cr.status === "pending") pending += 1;
            if (cr.status === "approved") {
                const limit = Number(cr.credit_limit || 0);
                const left = Math.max(limit - Number(cr.credit_used || 0), 0);
                approved += 1; available += left;
                if (limit > 0 && left <= 0) out += 1;
            }
        }
        return { approved, available, out, pending };
    }, [credit.sellers, profile?.id]);

    /* ---------- derived numbers ---------- */
    const quotesTotal = rfq.quotes ?? (rfq.items.length ? rfq.items.reduce((s, it) => s + (Number(it.quotesCount ?? it.quoteCount ?? it.quotes?.length) || 0), 0) : null);
    const loaded = rfq.loaded && !ordersLoading && credit.sellersLoaded;

    const kpis = [
        { key: "rfq", Icon: Send, a: "var(--k-or)", value: rfq.open ?? "–", label: "Open RFQs", to: "/save/rfq" },
        { key: "quotes", Icon: Inbox, a: "var(--k-bl)", value: quotesTotal ?? "–", label: "Quotes received", to: "/save/rfq" },
        { key: "orders", Icon: Package, a: "var(--k-gr)", value: ordersLoading ? "–" : orderStats.inProgress, label: "Orders in progress", to: "/save/orders" },
        { key: "credit", Icon: CreditCard, a: "var(--k-tt)", value: credit.sellersLoaded ? fmtINR(creditStats.available) : "–", label: "Credit available", to: "/save/credit" },
    ];

    const attention = [];
    if (orderStats.unpaid > 0) attention.push({ key: "pay", Icon: Receipt, a: "var(--k-or)", title: `${plural(orderStats.unpaid, "order", "orders")} awaiting payment`, sub: "Complete payment so the seller can confirm", to: "/save/orders" });
    if (badges.orders > 0) attention.push({ key: "ord", Icon: Package, a: "var(--k-gr)", title: `${plural(badges.orders, "order update", "order updates")}`, sub: "New activity on your orders", to: "/save/orders" });
    if (quotesTotal > 0) attention.push({ key: "q", Icon: Inbox, a: "var(--k-bl)", title: `${plural(quotesTotal, "quote", "quotes")} received`, sub: "Compare supplier prices on your RFQs", to: "/save/rfq" });
    if (rfq.rejected > 0) attention.push({ key: "rej", Icon: AlertCircle, a: "var(--k-red)", title: `${plural(rfq.rejected, "RFQ needs", "RFQs need")} changes`, sub: "Fix and resubmit for review", to: "/save/rfq" });
    if (badges.cart > 0) attention.push({ key: "cart", Icon: ShoppingCart, a: "var(--k-yt)", title: `${plural(badges.cart, "item", "items")} in your cart`, sub: "Pick transport and pay", to: "/save/cart" });
    if (badges.chat > 0) attention.push({ key: "chat", Icon: MessageSquare, a: "var(--k-bl)", title: `${plural(badges.chat, "unread message", "unread messages")}`, sub: "Reply to your sellers", to: "/save/chat" });
    if (creditStats.out > 0) attention.push({ key: "limit", Icon: CreditCard, a: "var(--k-red)", title: `Credit limit reached with ${plural(creditStats.out, "seller", "sellers")}`, sub: "Ask for a higher limit", to: "/save/credit" });
    if (creditStats.pending > 0) attention.push({ key: "cp", Icon: CreditCard, a: "var(--k-tt)", title: `${plural(creditStats.pending, "credit request", "credit requests")} pending`, sub: "Waiting for the seller to respond", to: "/save/credit" });

    return (
        <div className="sh-w svc">
            <div className="gk gd">
                <div className="gd-greet gk-rise" style={{ "--i": 0 }}>
                    <h1>Good {greeting()},<span>{shopName}</span></h1>
                    <p>Your buying at a glance.</p>
                </div>

                {/* primary action */}
                <section className="gd-hero gk-rise" style={{ "--i": 1, "--a": "var(--k-or)" }}>
                    <div>
                        <div className="nl"><Send size={14} />Get quotes</div>
                        <h2>Tell suppliers what you need</h2>
                        <p>Add a product to your price list and sellers will send you their best prices.</p>
                    </div>
                    <button type="button" className="gk-btn go" onClick={() => nav("/save/rfq?new=1")}><Send size={16} />Post an RFQ</button>
                </section>

                {/* numbers */}
                <div className="gd-kpis gk-rise" style={{ "--i": 2 }}>
                    {kpis.map((k) => (
                        <button key={k.key} type="button" className="gd-kpi" style={{ "--a": k.a }} onClick={() => nav(k.to)}>
                            <span className="gk-ico" style={{ "--a": k.a }}><k.Icon /></span>
                            <div><b>{k.value}</b><span className="l">{k.label}</span></div>
                        </button>
                    ))}
                </div>

                <div className="gd-grid">
                    {/* needs attention */}
                    <section className="gk-card gd-panel gd-a-attn">
                        <PanelHead title="Needs your attention" />
                        {!loaded ? (
                            <div style={{ display: "grid", gap: 8 }} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 58 }} />)}</div>
                        ) : attention.length === 0 ? (
                            <div className="gk-empty" style={{ padding: 24 }}><Check size={24} /><b>You're all caught up</b>Nothing needs your attention right now.</div>
                        ) : attention.slice(0, 5).map((a) => (
                            <button key={a.key} type="button" className="gd-att" style={{ "--a": a.a }} onClick={() => nav(a.to)}>
                                <span className="gk-ico" style={{ "--a": a.a }}><a.Icon /></span>
                                <span><b>{a.title}</b><small>{a.sub}</small></span>
                                <ChevronRight size={18} />
                            </button>
                        ))}
                    </section>

                    {/* credit */}
                    <section className="gd-wallet gd-a-wallet">
                        <small>Credit available</small>
                        <div className="bal">{credit.sellersLoaded ? fmtINR(creditStats.available) : "—"}</div>
                        <p>
                            {!credit.sellersLoaded ? "Loading…"
                                : creditStats.approved > 0 ? `Approved by ${plural(creditStats.approved, "seller", "sellers")}`
                                    : "No seller has approved credit yet"}
                        </p>
                        <button type="button" className="gk-btn" onClick={() => nav("/save/credit")}>
                            {creditStats.approved > 0 ? "Manage credit" : "Request credit"}
                        </button>
                    </section>

                    {/* purchases chart */}
                    <section className="gk-card gd-panel gd-a-chart">
                        <div className="gd-ph"><h2>Purchases</h2><small>Orders placed</small></div>

                        <div className="gd-ranges" role="group" aria-label="Purchases date range">
                            {RANGES.map((r) => (
                                <button key={r.k} type="button" aria-pressed={range === r.k} onClick={() => { setRange(r.k); setActive(null); }}>{r.l}</button>
                            ))}
                        </div>

                        {range === "custom" && (
                            <div className="gd-dates">
                                <div className="gk-field"><label htmlFor="gd-from">From</label>
                                    <input id="gd-from" type="date" className="gk-inp" value={from || toInput(sales.start)} max={toInput(new Date())} onChange={(e) => { setFrom(e.target.value); setActive(null); }} /></div>
                                <div className="gk-field"><label htmlFor="gd-to">To</label>
                                    <input id="gd-to" type="date" className="gk-inp" value={to || toInput(sales.end)} max={toInput(new Date())} onChange={(e) => { setTo(e.target.value); setActive(null); }} /></div>
                            </div>
                        )}

                        <div className="gd-sum">
                            <b>{ordersLoading ? "–" : fmtINR(Math.round(animTotal))}</b><small>{rangeTitle}</small>
                        </div>
                        <p className="gd-note">
                            {sales.total > 0
                                ? <>Each bar is one {unit}. Tap a bar for details.</>
                                : <>No purchases in this period. Each bar is one {unit}.</>}
                        </p>

                        {ordersLoading ? (
                            <div className="gk-skel" style={{ height: 240 }} aria-busy="true" />
                        ) : (
                            <div className="gd-plot" onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
                                <div className="gd-grid-lines" aria-hidden="true">
                                    {[1, 0.5, 0].map((f) => (
                                        <div key={f} className="gd-gl" style={{ bottom: `${f * 100}%` }}><span>{f ? short(top * f) : "₹0"}</span></div>
                                    ))}
                                </div>

                                {act && (
                                    <div className="gd-tip" role="status" style={{ left: `${Math.min(82, Math.max(18, ((active + 0.5) / nBars) * 100))}%` }}>
                                        <b>{act.full}</b>
                                        <span>{fmtINR(act.value)}</span>
                                        <small>{act.count} order{act.count !== 1 ? "s" : ""}{sales.total > 0 ? ` · ${Math.round((act.value / sales.total) * 100)}% of total` : ""}</small>
                                    </div>
                                )}

                                <div className="gd-chart" role="img" aria-label={`Purchases for ${rangeTitle}, total ${fmtINR(sales.total)}`}>
                                    {sales.buckets.map((d, i) => (
                                        <button
                                            key={i} type="button"
                                            className={`gd-col${d.today ? " today" : ""}${best && d === best && d.value > 0 ? " best" : ""}${active === i ? " on" : ""}`}
                                            onPointerEnter={(e) => { if (e.pointerType === "mouse") setActive(i); }}
                                            onClick={() => setActive((a) => (a === i ? null : i))}
                                            aria-label={`${d.full}: ${fmtINR(d.value)}, ${d.count} orders`}
                                        >
                                            <em>{showValues && d.value > 0 ? short(d.value) : ""}</em>
                                            <div className="gd-track">
                                                <div className={`gd-bar${d.value ? "" : " zero"}`} style={{ height: `${d.value ? Math.max(3, (d.value / top) * 100) : 2}%`, "--i": Math.min(i, 12) }} />
                                            </div>
                                            <span>{i % labelStep === 0 || i === nBars - 1 ? d.label : ""}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* recent orders */}
                    <section className="gk-card gd-panel gd-a-orders">
                        <PanelHead title="Recent orders" to="/save/orders" nav={nav} />
                        {ordersLoading ? (
                            <div style={{ display: "grid", gap: 8 }} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 58 }} />)}</div>
                        ) : orders.length === 0 ? (
                            <div className="gk-empty" style={{ padding: 24 }}><Package size={24} /><b>No orders yet</b>Orders you place with sellers will show up here.
                                <button type="button" className="gk-btn go" onClick={() => nav("/home")}>Explore products</button></div>
                        ) : orders.slice(0, 4).map((o) => {
                            const item = o.items?.[0];
                            const status = displayStatus(o);
                            return (
                                <button key={o.id} type="button" className="gd-row" onClick={() => nav(`/save/orders/${o.id}`)}>
                                    <Thumb src={item?.image_snapshot} name={item?.product_name_snapshot} />
                                    <span className="t">
                                        <b>{item?.product_name_snapshot || o.order_number}</b>
                                        <small>{[o.order_number, o.seller?.display_name].filter(Boolean).join(" · ")}</small>
                                    </span>
                                    <span className="r">
                                        <b>{displayAmount(o.total_amount, { isSample: o.order_type === "sample" })}</b>
                                        <span className="gk-pill" data-s={status}>{orderText(status)}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </section>

                    {/* my RFQs */}
                    <section className="gk-card gd-panel gd-a-enq">
                        <PanelHead title="My RFQs" to="/save/rfq" nav={nav} />
                        {!rfq.loaded ? (
                            <div style={{ display: "grid", gap: 8 }} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="gk-skel" style={{ height: 58 }} />)}</div>
                        ) : rfq.items.length === 0 ? (
                            <div className="gk-empty" style={{ padding: 24 }}><Send size={24} /><b>Your price list is empty</b>Add a product you buy and suppliers will price it.
                                <button type="button" className="gk-btn go" onClick={() => nav("/save/rfq?new=1")}><Send size={16} />Post an RFQ</button></div>
                        ) : rfq.items.slice(0, 4).map((it) => {
                            const units = Math.round(it.quantity * it.packSize * 1e6) / 1e6;
                            const count = Number(it.quotesCount ?? it.quoteCount ?? it.quotes?.length) || 0;
                            return (
                                <button key={it.id} type="button" className="gd-row" onClick={() => nav("/save/rfq")}>
                                    <Thumb src={it.images?.[0]} name={it.productName} />
                                    <span className="t">
                                        <b>{toTitle(it.productName)}</b>
                                        <small>{fmtNum(units)} {it.unit}</small>
                                    </span>
                                    <span className="r">
                                        <b>{plural(count, "quote", "quotes")}</b>
                                        <span className="gk-pill" data-s={RFQ_PILL[it.status]}>{RFQ_STATUS[it.status] || it.status}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </section>
                </div>
            </div>
        </div>
    );
}