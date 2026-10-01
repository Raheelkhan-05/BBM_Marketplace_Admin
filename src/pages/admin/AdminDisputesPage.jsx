// pages/admin/AdminDisputesPage.jsx — dispute work queue + dummy payout ledger
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search, Loader2, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { fetchAdminDisputes, fetchSettlementLedger, runSettlementSweep } from "../../utils/api.disputes.js";
import { Chip, fmtDateTime, inr } from "../../components/orders/disputeUi.jsx";
import { DISPUTE_CATEGORIES, DISPUTE_STATUS_LABELS, RESOLUTION_LABELS, labelFor } from "../../../shared/disputeConfig.js";

const STATUS_TONE = { open: "warn", under_review: "info", resolved: "success" };
const QUEUE_TABS = [
    { key: "open", label: "Open" },
    { key: "under_review", label: "Under review" },
    { key: "resolved", label: "Resolved" },
    { key: "all", label: "All" },
];

function ageLabel(iso) {
    const mins = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60000), 0);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
}

function Pager({ page, total, pageSize, onPage }) {
    const pages = Math.max(Math.ceil(total / pageSize), 1);
    if (pages <= 1) return null;
    return (
        <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px] font-bold">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: C.hair, color: C.ink }}>Prev</button>
            <span style={{ color: C.muted }}>Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: C.hair, color: C.ink }}>Next</button>
        </div>
    );
}

function QueueView() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [status, setStatus] = useState("open");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ disputes: [], counts: {}, total: 0, pageSize: 20 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetchAdminDisputes(token, { status, q, page });
        if (res?.success) { setData(res); setError(null); } else setError(res?.message || "Couldn't load disputes.");
        setLoading(false);
    }, [token, status, q, page]);

    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
    useEffect(() => { setPage(1); }, [status, q]);

    return (
        <>
            <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {QUEUE_TABS.map((t) => {
                    const active = status === t.key;
                    const n = data.counts?.[t.key];
                    return (
                        <button key={t.key} onClick={() => setStatus(t.key)} className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                            style={{ borderColor: active ? C.primary : C.hair, background: active ? C.primary : "#fff", color: active ? "#fff" : C.muted }}>
                            {t.label}{n != null && t.key !== "all" ? ` (${n})` : ""}
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: C.hair }}>
                <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dispute or order number…" className="w-full text-[13px] font-medium outline-none" />
            </div>

            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}

            <div className="mt-4 flex flex-col gap-2.5">
                {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                    : data.disputes.length === 0 ? (
                        <p className="py-12 text-center text-[13px] font-semibold" style={{ color: C.muted }}>No disputes here.</p>
                    ) : data.disputes.map((d) => (
                        <button key={d.id} onClick={() => navigate(`/disputes/${d.id}`)} className="rounded-2xl border bg-white p-3.5 text-left transition-shadow hover:shadow-sm" style={{ borderColor: C.hair }}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                    <p className="font-mono text-[12px] font-bold" style={{ color: C.ink }}>{d.dispute_number}</p>
                                    <p className="font-mono text-[11px] font-semibold" style={{ color: C.muted }}>{d.order?.order_number}</p>
                                </div>
                                <Chip tone={STATUS_TONE[d.status]}>{DISPUTE_STATUS_LABELS[d.status]}</Chip>
                            </div>
                            <p className="mt-1.5 text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>{labelFor(DISPUTE_CATEGORIES, d.category)}</p>
                            <p className="mt-0.5 text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                {d.buyer_name || "Buyer"} vs {d.seller_name || "Seller"} · ₹{inr(d.order?.total_amount)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold" style={{ color: C.muted }}>Raised {ageLabel(d.created_at)}</span>
                                {d.status !== "resolved" && (d.seller_responded_at ? <Chip tone="success">Seller responded</Chip> : <Chip tone="neutral">Awaiting seller</Chip>)}
                                {d.status === "resolved" && <Chip tone="neutral">{RESOLUTION_LABELS[d.resolution_type] || "Resolved"}</Chip>}
                            </div>
                        </button>
                    ))}
            </div>
            <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
    );
}

function LedgerView() {
    const { token } = useAuth();
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ entries: [], summary: null, total: 0, pageSize: 30 });
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetchSettlementLedger(token, { type, page });
        if (res?.success) setData(res);
        setLoading(false);
    }, [token, type, page]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { setPage(1); }, [type]);

    const runNow = async () => {
        setRunning(true); setNotice(null);
        const res = await runSettlementSweep(token);
        setRunning(false);
        setNotice(res?.success ? `Released ${res.releasedCount} payout(s) totalling ₹${inr(res.totalAmount)}.` : (res?.message || "Couldn't run the sweep."));
        if (res?.success) load();
    };

    const s = data.summary;
    return (
        <>
            {s && (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <div className="rounded-2xl border p-3.5" style={{ borderColor: C.hair }}>
                        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>In dispute window</p>
                        <p className="mt-1 text-[18px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(s.heldAmount)}</p>
                        <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{s.heldCount} order(s)</p>
                    </div>
                    <div className="rounded-2xl border p-3.5" style={{ borderColor: "#f59e0b50" }}>
                        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#b45309" }}>On hold · disputed</p>
                        <p className="mt-1 text-[18px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(s.disputedAmount)}</p>
                        <p className="text-[11.5px] font-semibold" style={{ color: C.muted }}>{s.disputedCount} order(s)</p>
                    </div>
                </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
                <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                    <option value="">All entries</option>
                    <option value="seller_payout">Seller payouts</option>
                    <option value="buyer_refund">Buyer refunds</option>
                </select>
                <button onClick={runNow} disabled={running} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Release due payouts now
                </button>
            </div>
            {notice && <p className="mt-2 text-[12.5px] font-semibold" style={{ color: C.ink }}>{notice}</p>}
            <p className="mt-2 text-[11px] font-medium" style={{ color: C.muted }}>Dummy ledger — no real bank transfer happens yet. Payouts are also released automatically every minute once a window ends.</p>

            <div className="mt-3 flex flex-col gap-2">
                {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                    : data.entries.length === 0 ? <p className="py-10 text-center text-[13px] font-semibold" style={{ color: C.muted }}>No entries yet.</p>
                        : data.entries.map((e) => (
                            <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <Chip tone={e.entry_type === "seller_payout" ? "success" : "violet"}>{e.entry_type === "seller_payout" ? "Seller payout" : "Buyer refund"}</Chip>
                                        <span className="font-mono text-[11.5px] font-bold" style={{ color: C.ink }}>{e.order?.order_number}</span>
                                    </div>
                                    <p className="mt-1 truncate text-[11.5px] font-semibold" style={{ color: C.muted }}>
                                        {e.entry_type === "seller_payout" ? e.seller_name : e.buyer_name} · {e.reference} · {e.trigger_source === "auto_window_elapsed" ? "auto (window elapsed)" : "dispute resolution"} · {fmtDateTime(e.created_at)}
                                    </p>
                                </div>
                                <p className="shrink-0 text-[14px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(e.amount)}</p>
                            </div>
                        ))}
            </div>
            <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
    );
}

export default function AdminDisputesPage() {
    const navigate = useNavigate();
    const [tab, setTab] = useState("queue");
    return (
        <div className="mx-auto min-h-screen max-w-4xl px-2.5 pb-10 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">

                <h1 className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>Disputes & Payouts</h1>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border p-1" style={{ borderColor: C.hair, background: "#fafbfb" }}>
                {[{ k: "queue", t: "Disputes" }, { k: "ledger", t: "Payout ledger" }].map(({ k, t }) => (
                    <button key={k} onClick={() => setTab(k)} className="rounded-md px-4 py-1.5 text-[13px] font-bold tracking-wide"
                        style={{ background: tab === k ? C.primary : "transparent", color: tab === k ? "#fff" : C.muted }}>{t}</button>
                ))}
            </div>
            {tab === "queue" ? <QueueView /> : <LedgerView />}
        </div>
    );
}