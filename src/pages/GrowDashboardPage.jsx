// src/pages/GrowDashboardPage.jsx — seller landing page (route: /grow/dashboard).
// Reads from the same endpoints as the other GROW pages: fetchSellerOrders (live via useRealtimeOrders),
// fetchRfqList, fetchWalletStatus, fetchPendingProposals, plus the existing stats / notification / chat contexts.
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
    ArrowRight, ChevronRight, Receipt, Megaphone, Package, Truck, MessageSquare, Wallet, Plus, IndianRupee, Inbox, AlertTriangle, Route as RouteIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useChatContext } from "../context/ChatContext.jsx";
import { fetchSellerOrders } from "../utils/api.js";
import { fetchRfqList } from "../utils/rfqApi.js";
import { fetchWalletStatus } from "../utils/walletApi.js";
import { fetchPendingProposals } from "../utils/api.transport.js";
import { fmtNum, timeAgo } from "../utils/rfqUtils.js";
import useRealtimeOrders from "../hooks/useRealtimeOrders.js";
import useSellerStats from "../components/growSeller/useSellerStats.js";
import { greeting, shopName, toTitleCase, inr } from "../components/growSeller/sellerHelpers.js";
import { STATUS_LABEL } from "./GrowOrdersPage.jsx";
import "../components/growSeller/grow-modules.css";

const D = 864e5;
const IN_PROGRESS = ["pending_confirmation", "confirmed", "processing", "shipped"];

const money = (n) => `₹${inr(n)}`;
const short = (n) => {
    if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}k`;
    return `₹${Math.round(n)}`;
};
const RANGES = [
    { k: "7", l: "7 days", t: "last 7 days" },
    { k: "14", l: "14 days", t: "last 14 days" },
    { k: "30", l: "1 month", t: "last 30 days" },
    { k: "90", l: "Quarter", t: "last 90 days" },
    { k: "365", l: "Year", t: "last 12 months" },
    { k: "custom", l: "Custom", t: "custom range" },
];
const MAX_DAYS = 366;
const pad = (n) => String(n).padStart(2, "0");
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromInput = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const sod = (v) => { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dm = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });


// Round the top of the chart up to a clean number so the gridlines read well.
const niceMax = (v) => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * p;
};

// Animated number: eases from the previous value to the new one.
function useCountUp(value) {
    const [n, setN] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(value); from.current = value; return undefined; }
        const s = from.current, t0 = performance.now(), dur = 600;
        let raf;
        const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            const cur = s + (value - s) * (1 - Math.pow(1 - p, 3));
            setN(cur); from.current = cur;
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return n;
}

// Delivered sales grouped into bars: daily (<=31 days), weekly (<=120 days), otherwise monthly.
function buildSales(list, range, from, to) {
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
                s: d.getTime(), e: d.getTime(), value: 0,
                count: 0,
                label: span <= 7 ? (isToday ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" })) : String(d.getDate()),
                full: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
            });
        }
    } else if (mode === "week") {
        for (let s = new Date(start); s <= end; s = addDays(s, 7)) {
            const e = addDays(s, 6) > end ? end : addDays(s, 6);
            buckets.push({ s: s.getTime(), e: e.getTime(), value: 0, count: 0, label: dm(s), full: `${dm(s)} – ${dm(e)}` });
        }
    } else {
        for (let c = new Date(start.getFullYear(), start.getMonth(), 1); c <= end; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
            const s = c < start ? start : c;
            const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
            const e = last > end ? end : last;
            const name = c.toLocaleDateString("en-IN", { month: "short", ...(multiYear ? { year: "2-digit" } : {}) });
            buckets.push({ s: s.getTime(), e: e.getTime(), value: 0, count: 0, label: name, full: c.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) });
        }
    }

    const sumRange = (a, z) => list.reduce((n, o) => {
        if (o.status !== "delivered") return n;
        const t = sod(o.delivered_at || o.updated_at || o.created_at).getTime();
        return t >= a.getTime() && t <= z.getTime() ? n + amountOf(o) : n;
    }, 0);

    list.forEach((o) => {
        if (o.status !== "delivered") return;
        const t = sod(o.delivered_at || o.updated_at || o.created_at).getTime();
        const b = buckets.find((x) => t >= x.s && t <= x.e);
        if (b) { b.value += amountOf(o); b.count += 1; }
    });

    buckets.forEach((b) => { b.today = today.getTime() >= b.s && today.getTime() <= b.e; });
    const total = buckets.reduce((n, b) => n + b.value, 0);
    const prev = sumRange(addDays(start, -span), addDays(start, -1));
    return { buckets, total, start, end, span, mode, prev };
}

const amountOf = (o) => (o.order_type === "sample" ? 0 : Number(o.subtotal_amount) || 0);

export default function GrowDashboardPage() {
    const nav = useNavigate();
    const { token, profile } = useAuth();
    const stats = useSellerStats();
    const location = useLocation();
    const { conversations } = useChatContext();

    const fetcher = useCallback(async () => {
        const res = await fetchSellerOrders(token);
        if (!res?.success) throw new Error(res?.message || "Couldn't load orders.");
        return res.orders;
    }, [token]);
    const { orders, loading } = useRealtimeOrders({ channelToken: profile?.notificationChannel, fetcher });

    const [wallet, setWallet] = useState(null);
    const [enquiries, setEnquiries] = useState(null);
    const [proposals, setProposals] = useState(0);
    const [range, setRange] = useState("7");
    const [active, setActive] = useState(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    useEffect(() => {
        if (!token) return undefined;
        let live = true;
        const ctrl = new AbortController();
        fetchWalletStatus(token).then((r) => { if (live && r?.success) setWallet(r.wallet); }).catch(() => { });
        fetchRfqList(token, { scope: "all", q: "", status: "", limit: 8, offset: 0, signal: ctrl.signal })
            .then((r) => { if (live) setEnquiries(r?.success ? (r.items || []) : []); })
            .catch(() => { if (live) setEnquiries([]); });
        fetchPendingProposals(token).then((r) => { if (live) setProposals((r?.proposals || []).length); }).catch(() => { });
        return () => { live = false; ctrl.abort(); };
    }, [token]);

    const list = useMemo(() => orders || [], [orders]);
    const newOrders = useMemo(() => list.filter((o) => o.status === "pending_confirmation"), [list]);
    const toDispatch = useMemo(() => list.filter((o) => o.status === "confirmed"), [list]);
    const quotable = useMemo(() => (enquiries || []).filter((e) => !e.isMine && e.status === "approved"), [enquiries]);
    const unreadChats = (conversations || []).reduce((n, c) => n + (Number(c.unreadCount) || 0), 0);

    const totals = useMemo(() => {
        let delivered = 0, progress = 0;
        list.forEach((o) => {
            if (o.status === "delivered") delivered += amountOf(o);
            else if (IN_PROGRESS.includes(o.status)) progress += amountOf(o);
        });
        return { delivered, progress };
    }, [list]);

    const sales = useMemo(() => buildSales(list, range, from, to), [list, range, from, to]);
    const n = sales.buckets.length;
    const top = niceMax(Math.max(...sales.buckets.map((b) => b.value), 0));
    const labelStep = n > 8 ? Math.ceil(n / 8) : 1;
    const showValues = n <= 10;
    const rangeInfo = RANGES.find((r) => r.k === range);
    const rangeTitle = range === "custom" ? `${dm(sales.start)} – ${dm(sales.end)}` : rangeInfo.t;
    const animTotal = useCountUp(sales.total);
    const unit = { day: "day", week: "week", month: "month" }[sales.mode];
    const avg = sales.total / n;
    const best = sales.buckets.reduce((a, b) => (b.value > (a?.value || 0) ? b : a), null);
    const delta = sales.prev > 0 ? ((sales.total - sales.prev) / sales.prev) * 100 : null;
    const act = active != null ? sales.buckets[active] : null;

    const blocked = !!wallet?.is_blocked;
    const lowWallet = !!wallet && !blocked && Number(wallet.threshold_amount) > 0 && Number(wallet.balance_due) <= Number(wallet.threshold_amount) * 0.25;
    const walletTone = blocked ? "bad" : lowWallet ? "warn" : "";
    const openEnq = stats.enq ?? quotable.length;

    const ordersReady = !loading || orders != null;

    const addProduct = () => nav("/grow?start=1", { state: { from: location.pathname + location.search } });

    // Each hero has either a route (`to`) or a custom handler (`onClick`).
    const hero = (() => {
        if (blocked) return { tone: "red", kicker: "Action needed", title: "New orders are paused", text: "Add credits to your wallet to start receiving orders again.", cta: "Add credits", to: "/grow/wallet", Icon: Wallet };
        if (newOrders.length) return { tone: "bl", kicker: "Your next step", title: `Confirm ${newOrders.length} new order${newOrders.length > 1 ? "s" : ""}`, text: "Buyers are waiting. Confirm to start dispatch.", cta: "Review orders", to: "/grow/orders", Icon: Receipt };
        if (toDispatch.length) return { tone: "gr", kicker: "Your next step", title: `Dispatch ${toDispatch.length} confirmed order${toDispatch.length > 1 ? "s" : ""}`, text: "Add the transport details and mark them as shipped.", cta: "Go to orders", to: "/grow/orders", Icon: Truck };
        if (quotable.length || openEnq > 0) return { tone: "or", kicker: "Your next step", title: `Quote on ${openEnq || quotable.length} open enquir${(openEnq || quotable.length) > 1 ? "ies" : "y"}`, text: quotable[0] ? `${toTitleCase(quotable[0].productName)} · deliver to ${quotable[0].deliveryCity}` : "Buyers are asking for products you sell.", cta: "See enquiries", to: "/grow/enquiries", Icon: Megaphone };
        return { tone: "gr", kicker: "You are all caught up", title: "Add more products", text: "More live products means more buyers can find and order from you.", cta: "Add product", onClick: addProduct, Icon: Plus };
    })();

    const attention = [];
    if (blocked) attention.push({ to: "/grow/wallet", tone: "red", Icon: Wallet, t: "New orders are paused", s: "Add credits to resume" });
    else if (lowWallet) attention.push({ to: "/grow/wallet", tone: "go", Icon: Wallet, t: "Wallet credits are running low", s: "Recharge to keep receiving orders" });
    if (newOrders.length) attention.push({ to: "/grow/orders", tone: "bl", Icon: Receipt, t: `${newOrders.length} new order${newOrders.length > 1 ? "s" : ""} to confirm`, s: "Buyers are waiting" });
    if (toDispatch.length) attention.push({ to: "/grow/orders", tone: "gr", Icon: Truck, t: `${toDispatch.length} order${toDispatch.length > 1 ? "s" : ""} ready to dispatch`, s: "Add LR and bill, then ship" });
    if (unreadChats) attention.push({ to: "/grow/chat", tone: "bl", Icon: MessageSquare, t: `${unreadChats} unread message${unreadChats > 1 ? "s" : ""}`, s: "Reply to keep deals moving" });
    if (proposals) attention.push({ to: "/grow/transport", tone: "go", Icon: RouteIcon, t: `${proposals} transport proposal${proposals > 1 ? "s" : ""}`, s: "Approve or decline" });
    if (openEnq > 0) attention.push({ to: "/grow/enquiries", tone: "or", Icon: Megaphone, t: `${openEnq} enquir${openEnq > 1 ? "ies" : "y"} to quote`, s: quotable[0] ? `Newest ${timeAgo(quotable[0].publishedAt || quotable[0].createdAt)}` : "Buyers are asking now" });

    const kp = (v) => (v == null ? "–" : v);
    const HeroIcon = hero.Icon;

    return (
        <div className="gk gd">
            <div className="gd-greet gk-rise" style={{ "--i": 0 }}>
                <h1>Good {greeting()},<span>{shopName(profile)}</span></h1>
                <p>Here is how your business is doing today.</p>
            </div>

            {!ordersReady ? (
                <div className="gk-skel" style={{ height: 150, marginTop: 18, borderRadius: 26 }} aria-busy="true" />
            ) : (
                <section className="gd-hero gk-rise" style={{ "--i": 1, "--a": `var(--k-${hero.tone})` }}>
                    <div>
                        <p className="nl"><HeroIcon size={16} />{hero.kicker}</p>
                        <h2>{hero.title}</h2>
                        <p>{hero.text}</p>
                    </div>
                    <button type="button" className="gk-btn go" onClick={() => (hero.onClick ? hero.onClick() : nav(hero.to))}>{hero.cta}<ArrowRight size={18} /></button>
                </section>
            )}

            <div className="gd-kpis">
                {[
                    { l: "Delivered sales", v: ordersReady ? money(totals.delivered) : "–", Icon: IndianRupee, a: "var(--k-gr)", to: "/grow/orders" },
                    { l: "Orders in progress", v: ordersReady ? money(totals.progress) : "–", Icon: Receipt, a: "var(--k-bl)", to: "/grow/orders" },
                    { l: "Open enquiries", v: kp(openEnq), Icon: Megaphone, a: "var(--k-or)", to: "/grow/enquiries" },
                    { l: "Live products", v: kp(stats.prod), Icon: Package, a: "var(--k-go)", to: "/grow/products" },
                ].map((k, i) => (
                    <button key={k.l} type="button" className="gd-kpi gk-rise" style={{ "--i": 2 + i, "--a": k.a }} onClick={() => nav(k.to)}>
                        <span className="gk-ico"><k.Icon /></span>
                        <span><b>{k.v}</b><span className="l">{k.l}</span></span>
                    </button>
                ))}
            </div>

            <div className="gd-grid">
                <section className="gd-panel gd-a-attn gk-rise" style={{ "--i": 6 }}>
                    <div className="gd-ph"><h2>Needs your attention</h2></div>
                    {!ordersReady ? (
                        <div className="gk-skel" style={{ height: 120 }} />
                    ) : attention.length ? attention.map((a) => (
                        <button key={a.t} type="button" className="gd-att" style={{ "--a": `var(--k-${a.tone})` }} onClick={() => nav(a.to)}>
                            <span className="gk-ico"><a.Icon /></span>
                            <span><b>{a.t}</b><small>{a.s}</small></span>
                            <ChevronRight size={18} />
                        </button>
                    )) : (
                        <div className="gk-empty" style={{ padding: "26px 16px" }}><AlertTriangle size={22} /><b>All clear</b>Nothing needs your attention right now.</div>
                    )}
                </section>

                <section className="gd-a-wallet gk-rise" style={{ "--i": 7 }}>
                    <div className={`gd-wallet ${walletTone}`}>
                        <small>Wallet credits</small>
                        <div className="bal">{wallet ? money(wallet.balance_due) : "–"}</div>
                        <p>{blocked ? "Orders are paused until you add credits." : lowWallet ? "Running low. Recharge to keep receiving orders." : "Credits cover marketing fees when an order is generated."}</p>
                        <button type="button" className="gk-btn sm" onClick={() => nav("/grow/wallet")}><Wallet size={16} />{blocked || lowWallet ? "Add credits" : "Open wallet"}</button>
                    </div>
                </section>

                <section className="gk-card gd-panel gd-a-chart gk-rise" style={{ "--i": 8 }}>
                    <div className="gd-ph"><h2>Sales</h2><small>Delivered orders</small></div>

                    <div className="gd-ranges" role="group" aria-label="Sales date range">
                        {RANGES.map((r) => (
                            <button key={r.k} type="button" aria-pressed={range === r.k} onClick={() => { setRange(r.k); setActive(null); }}>{r.l}</button>
                        ))}
                    </div>

                    {range === "custom" && (
                        <div className="gd-dates">
                            <label className="gk-field"><label htmlFor="gd-from">From</label>
                                <input id="gd-from" type="date" className="gk-inp" value={from || toInput(sales.start)} max={toInput(new Date())} onChange={(e) => setFrom(e.target.value)} /></label>
                            <label className="gk-field"><label htmlFor="gd-to">To</label>
                                <input id="gd-to" type="date" className="gk-inp" value={to || toInput(sales.end)} max={toInput(new Date())} onChange={(e) => setTo(e.target.value)} /></label>
                        </div>
                    )}

                    <div className="gd-sum">
                        <b>{money(Math.round(animTotal))}</b><small>{rangeTitle}</small>
                        {/* {delta != null && (
                            <span className={`gd-delta ${delta >= 0 ? "up" : "dn"}`}>
                                {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta))}% vs previous {sales.span} day{sales.span > 1 ? "s" : ""}
                            </span>
                        )} */}
                    </div>
                    <p className="gd-note">
                        {sales.total > 0
                            ? <>Each bar is one {unit}. Tap a bar for details.</>
                            : <>No delivered sales in this period. Each bar is one {unit}.</>}
                    </p>

                    <div className="gd-plot" onPointerLeave={(e) => { if (e.pointerType === "mouse") setActive(null); }}>
                        <div className="gd-grid-lines" aria-hidden="true">
                            {[1, 0.5, 0].map((f) => (
                                <div key={f} className="gd-gl" style={{ bottom: `${f * 100}%` }}><span>{f ? short(top * f) : "₹0"}</span></div>
                            ))}
                        </div>

                        {act && (
                            <div className="gd-tip" role="status" style={{ left: `${Math.min(82, Math.max(18, ((active + 0.5) / n) * 100))}%` }}>
                                <b>{act.full}</b>
                                <span>{money(act.value)}</span>
                                <small>{act.count} order{act.count !== 1 ? "s" : ""}{sales.total > 0 ? ` · ${Math.round((act.value / sales.total) * 100)}% of total` : ""}</small>
                            </div>
                        )}

                        <div className="gd-chart" role="img" aria-label={`Delivered sales for ${rangeTitle}, total ${money(sales.total)}`}>
                            {sales.buckets.map((d, i) => (
                                <button
                                    key={i} type="button"
                                    className={`gd-col${d.today ? " today" : ""}${best && d === best && d.value > 0 ? " best" : ""}${active === i ? " on" : ""}`}
                                    onPointerEnter={(e) => { if (e.pointerType === "mouse") setActive(i); }}
                                    onClick={() => setActive((a) => (a === i ? null : i))}
                                    aria-label={`${d.full}: ${money(d.value)}, ${d.count} orders`}
                                >
                                    <em>{showValues && d.value > 0 ? short(d.value) : ""}</em>
                                    <div className="gd-track">
                                        <div className={`gd-bar${d.value ? "" : " zero"}`} style={{ height: `${d.value ? Math.max(3, (d.value / top) * 100) : 2}%`, "--i": Math.min(i, 12) }} />
                                    </div>
                                    <span>{i % labelStep === 0 || i === n - 1 ? d.label : ""}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="gk-card gd-panel gd-a-orders gk-rise" style={{ "--i": 9 }}>
                    <div className="gd-ph"><h2>Latest orders</h2><button type="button" className="gd-link" onClick={() => nav("/grow/orders")}>View all<ChevronRight size={16} /></button></div>
                    {!ordersReady ? <div className="gk-skel" style={{ height: 150 }} />
                        : list.length === 0 ? <div className="gk-empty" style={{ border: 0, padding: "24px 8px" }}><Inbox size={22} /><b>No orders yet</b>Orders will appear as buyers place them.</div>
                            : list.slice(0, 4).map((o) => (
                                <button key={o.id} type="button" className="gd-row" onClick={() => nav(`/grow/orders/${o.id}`)}>
                                    {/* <span className="gd-th">{(o.buyer_business_name || o.buyer_contact_name || "B")[0].toUpperCase()}</span> */}
                                    <span className="t"><b>{o.buyer_business_name || o.buyer_contact_name}</b><small>{o.order_number} · {timeAgo(o.created_at)}</small></span>
                                    <span className="r"><b>{o.order_type === "sample" ? "Free" : money(o.subtotal_amount)}</b><span className="gk-pill" data-s={o.status}>{STATUS_LABEL[o.status] || o.status}</span></span>
                                </button>
                            ))}
                </section>

                <section className="gk-card gd-panel gd-a-enq gk-rise" style={{ "--i": 10 }}>
                    <div className="gd-ph"><h2>Live enquiries</h2><button type="button" className="gd-link" onClick={() => nav("/grow/enquiries")}>View all<ChevronRight size={16} /></button></div>
                    {enquiries == null ? <div className="gk-skel" style={{ height: 150 }} />
                        : quotable.length === 0 ? <div className="gk-empty" style={{ border: 0, padding: "24px 8px" }}><Megaphone size={22} /><b>No live enquiries</b>New enquiries from buyers appear here.</div>
                            : quotable.slice(0, 3).map((e) => (
                                <button key={e.id} type="button" className="gd-row" onClick={() => nav(`/grow/enquiry/${e.id}`, { state: { enquiry: e } })}>
                                    <span className="gd-th">{e.images?.[0] ? <img src={e.images[0]} alt="" /> : (e.productName || "E")[0].toUpperCase()}</span>
                                    <span className="t"><b>{toTitleCase(e.productName)}</b><small>{fmtNum(e.quantity)} × {fmtNum(e.packSize)} {e.unit} · {e.deliveryCity}</small></span>
                                    <span className="r"><small style={{ color: "var(--k-mute)", fontWeight: 700, fontSize: ".74rem" }}>{timeAgo(e.publishedAt || e.createdAt)}</small></span>
                                </button>
                            ))}
                </section>
            </div>
        </div>
    );
}