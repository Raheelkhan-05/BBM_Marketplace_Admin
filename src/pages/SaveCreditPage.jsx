// src/pages/SaveCreditPage.jsx — buyer Credit in the Save (sh-) UI. Route: /save/credit (inside SaveLayout).
// BUYER ONLY: request credit from sellers, see which sellers approved you, your remaining limit, ask for a higher
// limit, and your credit history. There are no seller controls (no requests inbox, approve, decline, limits).
// Same data/actions as the old CreditPage buyer view: useCreditCenter (sellers, requestFrom, askIncrease, history),
// useNotifications (creditUnreadCount / markCreditViewed), useSocket (connected). Only the presentation changed.
// Deep links still work: /save/credit?tab=approved|sellers&highlight=<creditId>
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    History as HistoryIcon, ArrowLeft, CreditCard, Search, X, Loader2, Clock3, Check, Ban, TrendingUp, Store,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import useCreditCenter from "../hooks/useCreditCenter.js";
import { fmtINR, shortDate, timeLabel, dayLabel } from "../components/credit/tokens.js";
import "../components/save/save-credit.css";

/* ---------- buyer-side state of one seller's credit (unchanged logic) ---------- */
function buyerState(credit) {
    if (!credit) return { kind: "none" };
    const now = new Date();
    switch (credit.status) {
        case "pending": return { kind: "pending" };
        case "approved": {
            const limit = Number(credit.credit_limit || 0);
            const used = Number(credit.credit_used || 0);
            const remaining = Math.max(limit - used, 0);
            return {
                kind: "approved", limit, used, remaining,
                isOut: limit > 0 && remaining <= 0,
                increasePending: !!credit.limit_increase_request_message_id,
                increaseCooldown: credit.limit_increase_cooldown_until && new Date(credit.limit_increase_cooldown_until) > now
                    ? credit.limit_increase_cooldown_until : null,
            };
        }
        case "rejected":
            return credit.cooldown_until && new Date(credit.cooldown_until) > now
                ? { kind: "cooldown", until: credit.cooldown_until }
                : { kind: "retry" };
        case "revoked": return { kind: "revoked" };
        default: return { kind: "none" };
    }
}

const CAPTIONS = {
    none: ["No credit yet", ""],
    pending: ["Waiting for the seller", "warn"],
    approved: ["Credit approved", "ok"],
    cooldown: ["Request declined", "bad"],
    retry: ["Last request declined", ""],
    revoked: ["Turned off by seller", ""],
};
const canRequest = (k) => k === "none" || k === "retry" || k === "revoked";

/* ---------- small pieces ---------- */
function Thumb({ name, logo }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [logo]);
    return (
        <div className="sh-th">
            {logo && !broken
                ? <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
                : (name || "?").trim()[0]?.toUpperCase()}
        </div>
    );
}

function Usage({ used, limit }) {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const left = Math.max(limit - used, 0);
    const tone = limit > 0 && left <= 0 ? "bad" : pct >= 75 ? "warn" : "";
    return (
        <div className="cd-use">
            <div className={`cd-bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Credit used">
                <i style={{ width: `${pct}%` }} />
            </div>
            <div className="cd-uf"><span>Used {fmtINR(used)}</span><span>Limit {fmtINR(limit)}</span></div>
        </div>
    );
}

function ApprovedCard({ seller, st, busy, onAsk }) {
    return (
        <article id={seller.credit?.id ? `credit-${seller.credit.id}` : undefined} className="cd-c">
            <div className="cd-top">
                <Thumb name={seller.shopName} logo={seller.logoUrl} />
                <div className="sh-in">
                    <p className="sh-rn">{seller.shopName || "Seller"}</p>
                    <p className={`cd-sub ${st.isOut ? "bad" : "ok"}`}><i />{st.isOut ? "Limit reached" : "Credit active"}</p>
                </div>
                <div className="cd-amt">
                    <b className={st.isOut ? "bad" : ""}>{fmtINR(st.remaining)}</b>
                    <small>left</small>
                </div>
            </div>

            {st.limit > 0 && <Usage used={st.used} limit={st.limit} />}

            {st.isOut && (
                <div className="cd-act">
                    {!st.increasePending && !st.increaseCooldown && (
                        <button type="button" className="sh-btn sm" disabled={busy} onClick={onAsk}>
                            {busy ? <Loader2 size={15} className="sh-spin" /> : <TrendingUp size={15} />}Ask for higher limit
                        </button>
                    )}
                    {st.increasePending && <span className="sh-tg o"><Clock3 size={13} />Higher limit requested</span>}
                    {!st.increasePending && st.increaseCooldown && (
                        <span className="sh-tg"><Ban size={13} />Higher limit declined · retry {shortDate(st.increaseCooldown)}</span>
                    )}
                </div>
            )}
        </article>
    );
}

function SellerRow({ seller, st, busy, onRequest }) {
    const [text, tone] = CAPTIONS[st.kind];
    return (
        <article id={seller.credit?.id ? `credit-${seller.credit.id}` : undefined} className="cd-c cd-r">
            <Thumb name={seller.shopName} logo={seller.logoUrl} />
            <div className="sh-in">
                <p className="sh-rn">{seller.shopName || "Seller"}</p>
                <p className={`cd-sub ${tone}`}><i />{text}</p>
            </div>
            <div className="cd-ra">
                {canRequest(st.kind) && (
                    <button type="button" className="sh-btn sm go" disabled={busy} onClick={onRequest}>
                        {busy && <Loader2 size={15} className="sh-spin" />}{st.kind === "none" ? "Request" : "Request again"}
                    </button>
                )}
                {st.kind === "pending" && <span className="sh-tg o"><Clock3 size={13} />Pending</span>}
                {st.kind === "cooldown" && <span className="sh-tg"><Ban size={13} />Retry {shortDate(st.until)}</span>}
            </div>
        </article>
    );
}

function Empty({ icon: Icon, title, hint, action }) {
    return (
        <div className="sh-emp">
            <Icon size={30} style={{ margin: "0 auto 10px", display: "block" }} />
            <b>{title}</b>
            {hint}
            {action && <div>{action}</div>}
        </div>
    );
}

function Skeletons() {
    return <div className="sh-og" aria-busy="true">{[0, 1, 2, 3].map((i) => <div className="sh-sk" style={{ height: 104 }} key={i} />)}</div>;
}

/* ---------- history ---------- */
function describe(e) {
    const who = e.counterpartName || (e.myRole === "seller" ? "A buyer" : "The seller");
    const me = e.actorIsMe;
    const lim = e.creditLimit != null ? fmtINR(e.creditLimit) : null;
    switch (e.eventType) {
        case "requested":
            return { icon: CreditCard, tone: "accent", text: me ? `You requested credit from ${who}` : `${who} requested credit from you` };
        case "approved":
            return { icon: Check, tone: "ok", text: me ? `You approved credit for ${who}` : `${who} approved your credit request`, extra: lim && `Limit ${lim}` };
        case "rejected":
            return { icon: X, tone: "danger", text: me ? `You declined ${who}'s credit request` : `${who} declined your credit request` };
        case "revoked":
            return { icon: Ban, tone: "", text: me ? `You turned off credit for ${who}` : `${who} turned off your credit` };
        case "enabled":
            return { icon: Check, tone: "ok", text: me ? `You turned credit back on for ${who}` : `${who} turned your credit back on` };
        case "limit_updated":
            return { icon: CreditCard, tone: "accent", text: me ? `You set ${who}'s credit limit` : `${who} updated your credit limit`, extra: lim && `New limit ${lim}` };
        case "limit_increase_requested":
            return { icon: TrendingUp, tone: "warn", text: me ? `You asked ${who} for a higher limit` : `${who} asked for a higher credit limit` };
        case "limit_increase_declined":
            return { icon: X, tone: "danger", text: me ? `You declined ${who}'s higher-limit request` : `${who} declined your higher-limit request` };
        default:
            return { icon: CreditCard, tone: "", text: "Credit update" };
    }
}

function HistoryView({ c, onBack }) {
    const groups = useMemo(() => {
        const out = [];
        for (const e of c.history) {
            const day = dayLabel(e.createdAt);
            const last = out[out.length - 1];
            if (last && last.day === day) last.events.push(e);
            else out.push({ day, events: [e] });
        }
        return out;
    }, [c.history]);

    return (
        <>
            <div className="sh-bkr">
                <button type="button" className="sh-bk" aria-label="Back to credit" onClick={onBack}><ArrowLeft size={18} /></button>
                <div className="sh-hh"><h1>History</h1></div>
            </div>

            {c.historyLoading ? (
                <div className="sh-grid" style={{ marginTop: 18 }} aria-busy="true">{[0, 1, 2].map((i) => <div className="sh-sk" style={{ height: 76 }} key={i} />)}</div>
            ) : c.history.length === 0 ? (
                <div style={{ marginTop: 18 }}>
                    <Empty icon={HistoryIcon} title="No activity yet" hint="Requests, approvals and limit changes will be logged here." />
                </div>
            ) : (
                <div className="cd-hist">
                    {groups.map((g, gi) => (
                        <section key={g.day + gi} className="cd-hg">
                            <h2 className="cd-hd">{g.day}</h2>
                            <div className="cd-hl">
                                {g.events.map((e) => {
                                    const d = describe(e);
                                    const Icon = d.icon;
                                    return (
                                        <div key={e.id} className="cd-ev">
                                            <span className={`cd-ic ${d.tone}`}><Icon size={17} strokeWidth={2.4} /></span>
                                            <div className="cd-et">
                                                <p>{d.text}</p>
                                                {d.extra && <span className="sh-tg">{d.extra}</span>}
                                            </div>
                                            <time>{timeLabel(e.createdAt)}</time>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                    {c.historyHasMore && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                            <button type="button" className="sh-btn" disabled={c.historyLoadingMore} onClick={c.loadMoreHistory}>
                                {c.historyLoadingMore && <Loader2 size={16} className="sh-spin" />}Load older
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/* ---------- page ---------- */
export default function SaveCreditPage() {
    const { profile } = useAuth();
    const { connected } = useSocket();
    const { creditUnreadCount, markCreditViewed } = useNotifications();

    const [tab, setTab] = useState("approved"); // approved | sellers
    const [filter, setFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [toast, setToast] = useState("");

    // Buyer view only: no seller inbox, and history is limited to my activity as a buyer.
    const c = useCreditCenter({ isSeller: false, historyOpen, historyRole: "buyer" });

    /* deep link: /save/credit?tab=approved|sellers&highlight=<creditId> */
    const [searchParams, setSearchParams] = useSearchParams();
    const [pendingHighlight, setPendingHighlight] = useState(null);

    useEffect(() => {
        const t = searchParams.get("tab");
        const hl = searchParams.get("highlight");
        if (!t && !hl) return;
        if (t === "approved" || t === "sellers") setTab(t);
        setFilter("all");
        setQuery("");
        setHistoryOpen(false);
        if (hl) setPendingHighlight(hl);
        setSearchParams({}, { replace: true }); // so tapping the same notification again works
    }, [searchParams, setSearchParams]);

    // Scroll to the record and flash it; retries until the row exists, gives up after 5s.
    useEffect(() => {
        if (!pendingHighlight || historyOpen || !c.sellersLoaded) return;
        const el = document.getElementById(`credit-${pendingHighlight}`);
        if (!el) return;
        setPendingHighlight(null);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.animate(
            [
                { boxShadow: "0 0 0 3px #1E78D6", backgroundColor: "#E8F1FB" },
                { boxShadow: "0 0 0 3px #1E78D6", backgroundColor: "#E8F1FB", offset: 0.75 },
                { boxShadow: "0 0 0 3px rgba(30,120,214,0)", backgroundColor: "rgba(255,255,255,0)" },
            ],
            { duration: 3600, easing: "ease-out" }
        );
    }, [pendingHighlight, tab, historyOpen, c.sellersLoaded, c.sellers]);

    useEffect(() => {
        if (!pendingHighlight) return undefined;
        const t = setTimeout(() => setPendingHighlight(null), 5000);
        return () => clearTimeout(t);
    }, [pendingHighlight]);

    // Opening this page clears the credit notification badge.
    useEffect(() => {
        const mark = () => { if (document.visibilityState === "visible") markCreditViewed(); };
        if (creditUnreadCount > 0) mark();
        document.addEventListener("visibilitychange", mark);
        return () => document.removeEventListener("visibilitychange", mark);
    }, [creditUnreadCount, markCreditViewed]);

    // API errors show as a toast and clear themselves.
    useEffect(() => {
        if (!c.error) return undefined;
        setToast(c.error);
        const t = setTimeout(c.clearError, 4500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [c.error]);

    const q = query.trim().toLowerCase();
    const matchName = (s) => !q || (s.shopName || "").toLowerCase().includes(q);

    const buyerRows = useMemo(
        () => c.sellers
            .filter((s) => s.sellerUserId !== profile?.id) // never list my own shop
            .map((s) => ({ seller: s, st: buyerState(s.credit) }))
            .sort((a, b) => (a.seller.shopName || "").localeCompare(b.seller.shopName || "")),
        [c.sellers, profile?.id]
    );

    // Approved: only sellers that approved my credit.
    const approvedAll = useMemo(() => buyerRows.filter((r) => r.st.kind === "approved"), [buyerRows]);
    const approvedList = useMemo(
        () => approvedAll.filter((r) => matchName(r.seller)
            && (filter === "all" || (filter === "available" && !r.st.isOut) || (filter === "out" && r.st.isOut))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [approvedAll, q, filter]
    );

    // Sellers: everyone else (approved sellers live in the Approved tab).
    const directoryAll = useMemo(() => buyerRows.filter((r) => r.st.kind !== "approved"), [buyerRows]);
    const sellersList = useMemo(
        () => directoryAll.filter((r) => matchName(r.seller) && (
            filter === "all"
            || (filter === "open" && (canRequest(r.st.kind) || r.st.kind === "cooldown"))
            || (filter === "pending" && r.st.kind === "pending")
        )),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [directoryAll, q, filter]
    );

    const approvedCounts = useMemo(() => ({
        all: approvedAll.length,
        available: approvedAll.filter((r) => !r.st.isOut).length,
        out: approvedAll.filter((r) => r.st.isOut).length,
    }), [approvedAll]);
    const sellerCounts = useMemo(() => ({
        all: directoryAll.length,
        open: directoryAll.filter((r) => canRequest(r.st.kind) || r.st.kind === "cooldown").length,
        pending: directoryAll.filter((r) => r.st.kind === "pending").length,
    }), [directoryAll]);
    const availableTotal = useMemo(() => approvedAll.reduce((n, r) => n + r.st.remaining, 0), [approvedAll]);

    const switchTab = (v) => { setTab(v); setQuery(""); setFilter("all"); };

    const filters = tab === "approved"
        ? [["all", "All", approvedCounts.all], ["available", "Available", approvedCounts.available], ["out", "Limit reached", approvedCounts.out]]
        : [["all", "All", sellerCounts.all], ["open", "Not requested", sellerCounts.open], ["pending", "Pending", sellerCounts.pending]];
    const total = tab === "approved" ? approvedList.length : sellersList.length;
    const loaded = c.sellersLoaded;

    return (
        <div className="sh-w">
            {!connected && (
                <div className="sh-nt danger" role="status"><Loader2 size={16} className="sh-spin" /><div><span>Reconnecting…</span></div></div>
            )}

            {historyOpen ? (
                <HistoryView c={c} onBack={() => setHistoryOpen(false)} />
            ) : (
                <>
                    <div className="sh-sec" style={{ marginTop: 22 }}>
                        <div>
                            <h1 className="sh-pt">Credit</h1>
                            <p className="sh-sub" style={{ marginTop: 4 }}>Request credit from sellers and track your limits.</p>
                        </div>
                        <button type="button" className="sh-bk" aria-label="Credit history" title="History" onClick={() => setHistoryOpen(true)}>
                            <HistoryIcon size={18} />
                        </button>
                    </div>

                    {/* <div className="sh-kp" style={{ marginTop: 6 }}>
                        <button type="button" style={{ "--a": "var(--gr)" }} onClick={() => switchTab("approved")}>
                            <b>{loaded ? approvedAll.length : "–"}</b><span>Sellers who approved you</span>
                        </button>
                        <button type="button" style={{ "--a": "var(--bl)" }} onClick={() => switchTab("approved")}>
                            <b>{loaded ? fmtINR(availableTotal) : "–"}</b><span>Credit available</span>
                        </button>
                    </div> */}

                    <div className="cd-tabs">
                        <div className="sh-seg" role="group" aria-label="Credit sections">
                            <button type="button" aria-pressed={tab === "approved"} onClick={() => switchTab("approved")}>Approved{loaded ? ` · ${approvedAll.length}` : ""}</button>
                            <button type="button" aria-pressed={tab === "sellers"} onClick={() => switchTab("sellers")}>Sellers{loaded ? ` · ${directoryAll.length}` : ""}</button>
                        </div>
                        {loaded && <span className="sh-cntp">{total} seller{total === 1 ? "" : "s"}</span>}
                    </div>

                    <div className="sh-tb">
                        <label className="sh-srch">
                            <Search size={18} />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sellers" aria-label="Search sellers" />
                            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}
                        </label>
                        <div className="sh-chs">
                            {filters.map(([v, l, n]) => (
                                <button
                                    key={v} type="button" aria-pressed={filter === v}
                                    onClick={() => setFilter(filter === v && v !== "all" ? "all" : v)}
                                >
                                    {l} · {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!loaded ? <Skeletons /> : tab === "approved" ? (
                        approvedAll.length === 0 ? (
                            <Empty
                                icon={Store} title="No approved sellers yet"
                                hint="Sellers who approve your credit request will appear here with your remaining limit."
                                action={<button type="button" className="sh-btn go" style={{ marginTop: 16 }} onClick={() => switchTab("sellers")}>Browse sellers</button>}
                            />
                        ) : approvedList.length === 0 ? (
                            <Empty icon={Search} title="No matching sellers" hint={q ? "Try a different name." : "Tap the active filter again to clear it."} />
                        ) : (
                            <div className="sh-og">
                                {approvedList.map(({ seller, st }) => (
                                    <ApprovedCard
                                        key={seller.sellerId} seller={seller} st={st}
                                        busy={!!(seller.credit?.id && c.busy[`c:${seller.credit.id}`])}
                                        onAsk={() => c.askIncrease(seller.credit)}
                                    />
                                ))}
                            </div>
                        )
                    ) : sellersList.length === 0 ? (
                        <Empty
                            icon={Search}
                            title={q || filter !== "all" ? "No matching sellers" : "No sellers available yet"}
                            hint={q ? "Try a different name." : filter !== "all" ? "Tap the active filter again to clear it." : undefined}
                        />
                    ) : (
                        <div className="sh-og">
                            {sellersList.map(({ seller, st }) => (
                                <SellerRow
                                    key={seller.sellerId} seller={seller} st={st}
                                    busy={!!c.busy[`s:${seller.sellerId}`]}
                                    onRequest={() => c.requestFrom(seller)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            <div className={`sh-toast${c.error ? " on" : ""}`} role="alert">{toast}</div>
        </div>
    );
}