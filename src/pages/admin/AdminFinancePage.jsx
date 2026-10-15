// pages/admin/AdminFinancePage.jsx — money in, money out, money still owed. Built for audit.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, Search, Download, Loader2, X, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import {
    fetchFinanceOverview, fetchFinanceTransactions, fetchFinanceTransactionDetail,
    fetchPendingPayouts, fetchFinanceHealth, downloadFinanceCsv,
} from "../../utils/api.finance.js";

/* ------------------------------------------------------------------ helpers */
const GREEN = "#047857", RED = "#b91c1c", AMBER = "#b45309";
const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtIST = (iso) => iso ? new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
}) : "—";
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const fmtBucket = (b, bucket) => {
    const d = new Date(`${b}T00:00:00Z`);
    const o = { timeZone: "UTC" };
    if (bucket === "month") return d.toLocaleDateString("en-IN", { ...o, month: "short", year: "numeric" });
    const s = d.toLocaleDateString("en-IN", { ...o, day: "2-digit", month: "short", year: bucket === "week" ? undefined : "numeric" });
    return bucket === "week" ? `Week of ${s}` : s;
};

const KIND = {
    payment_in: { label: "Payment received", tone: "success", dir: "in" },
    wallet_topup: { label: "Wallet top-up (gateway)", tone: "violet", dir: "in" },
    wallet_manual: { label: "Wallet top-up (manual)", tone: "violet", dir: "in" },
    refund_out: { label: "Refund to buyer", tone: "warn", dir: "out" },
    seller_payout: { label: "Seller payout", tone: "info", dir: "out" },
    ledger_refund: { label: "Refund (dispute ledger)", tone: "neutral", dir: "none" },
};
const statusTone = (s) => (["success", "approved", "verified", "applied"].includes(s) ? "success"
    : ["failed", "rejected", "expired", "needs_review"].includes(s) ? "warn" : "neutral");

const PRESETS = [
    { key: "today", label: "Today", range: () => [todayIST(), todayIST()] },
    { key: "7d", label: "Last 7 days", range: () => [addDays(todayIST(), -6), todayIST()] },
    { key: "30d", label: "Last 30 days", range: () => [addDays(todayIST(), -29), todayIST()] },
    { key: "month", label: "This month", range: () => [monthStart(todayIST()), todayIST()] },
    { key: "last", label: "Last month", range: () => { const s = monthStart(todayIST()); return [monthStart(addDays(s, -1)), addDays(s, -1)]; } },
];
const TABS = [{ k: "overview", t: "Overview" }, { k: "transactions", t: "Transactions" }, { k: "payouts", t: "Owed to sellers" }, { k: "audit", t: "Audit checks" }];

function Skeleton({ h = 96 }) { return <div className="animate-pulse rounded-2xl" style={{ height: h, background: C.hairSoft }} />; }
function ErrorLine({ children }) { return children ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{children}</p> : null; }

function Pager({ page, total, pageSize, onPage }) {
    const pages = Math.max(Math.ceil(total / pageSize), 1);
    if (pages <= 1) return null;
    return (
        <div className="mt-4 flex items-center justify-center gap-3 text-[12.5px] font-bold">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: C.hair, color: C.ink }}>Prev</button>
            <span style={{ color: C.muted }}>Page {page} of {pages} · {total.toLocaleString("en-IN")} records</span>
            <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: C.hair, color: C.ink }}>Next</button>
        </div>
    );
}

/* ------------------------------------------------------------------ overview */
function Kpi({ label, value, sub, color = C.ink, warn }) {
    return (
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: warn ? "#f59e0b80" : C.hair }}>
            <p className="text-[12px] font-bold tracking-wide" style={{ color: C.muted }}>{label}</p>
            <p className="mt-1.5 text-[22px] font-extrabold tabular-nums leading-tight" style={{ color }}>{money(value)}</p>
            <p className="mt-1 text-[11.5px] font-semibold" style={{ color: C.muted }}>{sub}</p>
        </div>
    );
}

function FlowChart({ series, bucket }) {
    const max = Math.max(1, ...series.map((r) => Math.max(r.received, r.refunds + r.payouts)));
    const colW = series.length > 45 ? 14 : series.length > 20 ? 22 : 34;
    return (
        <div>
            <div className="mb-2 flex items-center gap-4 text-[11.5px] font-bold" style={{ color: C.muted }}>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />Received</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />Refunds + seller payouts</span>
                <span className="ml-auto font-medium">Tallest bar = {money(max)}</span>
            </div>
            <div className="overflow-x-auto pb-1">
                <div className="flex h-44 items-end gap-1.5 border-b" style={{ borderColor: C.hair, minWidth: series.length * (colW + 6) }}>
                    {series.map((r) => {
                        const out = r.refunds + r.payouts;
                        const tip = `${fmtBucket(r.bucket, bucket)}\nReceived ${money(r.received)}\nRefunds ${money(r.refunds)}\nPayouts ${money(r.payouts)}`;
                        return (
                            <div key={r.bucket} title={tip} className="flex h-full items-end gap-[2px]" style={{ width: colW }}>
                                <div className="flex-1 rounded-t-sm" style={{ height: `${(r.received / max) * 100}%`, minHeight: r.received > 0 ? 2 : 0, background: GREEN }} />
                                <div className="flex-1 rounded-t-sm" style={{ height: `${(out / max) * 100}%`, minHeight: out > 0 ? 2 : 0, background: RED }} />
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-semibold" style={{ color: C.muted }}>
                <span>{fmtBucket(series[0].bucket, bucket)}</span><span>{fmtBucket(series[series.length - 1].bucket, bucket)}</span>
            </div>
        </div>
    );
}

function Overview({ token, from, to, bucket, onOpenTab }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const ctl = useRef(null);

    const load = useCallback(async () => {
        ctl.current?.abort();
        const c = new AbortController(); ctl.current = c;
        setLoading(true);
        const res = await fetchFinanceOverview(token, { from, to, bucket }, c.signal);
        if (res.aborted) return;
        if (res.success) { setData(res); setError(null); } else setError(res.message || "Couldn't load the overview.");
        setLoading(false);
    }, [token, from, to, bucket]);
    useEffect(() => { load(); return () => ctl.current?.abort(); }, [load]);

    if (loading && !data) return <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}</div>;
    if (!data) return <ErrorLine>{error}</ErrorLine>;

    const { totals: t, pending: p, series } = data;
    return (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
            <ErrorLine>{error}</ErrorLine>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Kpi label="Received from buyers" value={t.received} color={GREEN} sub={`${t.receivedCount.toLocaleString("en-IN")} successful payments`} />
                <Kpi label="Refunded to buyers" value={t.refunds} color={AMBER} sub={`${t.refundsCount.toLocaleString("en-IN")} completed refunds`} />
                <Kpi label="Paid out to sellers" value={t.payouts} sub={`${t.payoutsCount.toLocaleString("en-IN")} payouts released`} />
                <Kpi label="Still to pay sellers" value={p.total} warn={p.overdueCount > 0}
                    sub={`${p.heldCount} in dispute window · ${p.disputedCount} disputed${p.overdueCount ? ` · ${p.overdueCount} overdue` : ""}`} />
                <Kpi label="Net held by platform (period)" value={t.net} color={t.net < 0 ? RED : C.ink} sub="Received − refunds − payouts" />
                <Kpi label="Seller wallet top-ups" value={t.topups} sub={`${t.topupsCount} gateway top-ups (not in the figures above)`} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-5">
                <section className="rounded-2xl border bg-white p-4 lg:col-span-3" style={{ borderColor: C.hair }}>
                    <h2 className="mb-3 text-[14px] font-extrabold" style={{ color: C.ink }}>Money flow by {bucket}</h2>
                    {series.length ? <FlowChart series={series} bucket={bucket} /> : <p className="py-10 text-center text-[13px]" style={{ color: C.muted }}>No data for this range.</p>}
                </section>

                <section className="rounded-2xl border bg-white p-4 lg:col-span-2" style={{ borderColor: C.hair }}>
                    <h2 className="mb-3 text-[14px] font-extrabold" style={{ color: C.ink }}>How the numbers add up</h2>
                    {[
                        ["Received from buyers", t.received, GREEN, ""],
                        ["Refunded to buyers", t.refunds, AMBER, "−"],
                        ["Paid out to sellers", t.payouts, C.ink, "−"],
                    ].map(([l, v, col, sign]) => (
                        <div key={l} className="flex items-center justify-between border-b py-2 text-[13px]" style={{ borderColor: C.hairSoft }}>
                            <span className="font-semibold" style={{ color: C.muted }}>{sign} {l}</span>
                            <span className="font-extrabold tabular-nums" style={{ color: col }}>{money(v)}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between py-2 text-[13.5px]">
                        <span className="font-extrabold" style={{ color: C.ink }}>= Net held in this period</span>
                        <span className="font-extrabold tabular-nums" style={{ color: C.ink }}>{money(t.net)}</span>
                    </div>
                    <div className="mt-2 rounded-xl p-3 text-[12px] font-medium leading-relaxed" style={{ background: C.hairSoft, color: C.muted }}>
                        Of the money the platform holds, <b style={{ color: C.ink }}>{money(p.total)}</b> is owed to {p.sellers} seller{p.sellers === 1 ? "" : "s"} (all-time snapshot, not limited to this range).
                        {" "}<button onClick={() => onOpenTab("payouts")} className="font-bold underline" style={{ color: C.secondary }}>See who</button>
                    </div>
                </section>
            </div>

            <section className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: C.hair }}>
                <h2 className="mb-3 text-[14px] font-extrabold" style={{ color: C.ink }}>Breakdown by {bucket}</h2>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[12.5px]">
                        <thead>
                            <tr className="border-b text-left" style={{ borderColor: C.hair, color: C.muted }}>
                                {["Period", "Received", "Refunds", "Paid to sellers", "Net"].map((h, i) => <th key={h} className={`py-2 font-bold ${i ? "text-right" : ""}`}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[...series].reverse().map((r) => {
                                const net = r.received - r.refunds - r.payouts;
                                return (
                                    <tr key={r.bucket} className="border-b" style={{ borderColor: C.hairSoft }}>
                                        <td className="py-2 font-semibold" style={{ color: C.ink }}>{fmtBucket(r.bucket, bucket)}</td>
                                        <td className="py-2 text-right tabular-nums" style={{ color: GREEN }}>{money(r.received)} <span style={{ color: C.muted }}>({r.receivedCount})</span></td>
                                        <td className="py-2 text-right tabular-nums">{money(r.refunds)} <span style={{ color: C.muted }}>({r.refundsCount})</span></td>
                                        <td className="py-2 text-right tabular-nums">{money(r.payouts)} <span style={{ color: C.muted }}>({r.payoutsCount})</span></td>
                                        <td className="py-2 text-right font-bold tabular-nums" style={{ color: net < 0 ? RED : C.ink }}>{money(net)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="font-extrabold" style={{ color: C.ink }}>
                                <td className="pt-3">Total</td>
                                <td className="pt-3 text-right tabular-nums">{money(t.received)}</td>
                                <td className="pt-3 text-right tabular-nums">{money(t.refunds)}</td>
                                <td className="pt-3 text-right tabular-nums">{money(t.payouts)}</td>
                                <td className="pt-3 text-right tabular-nums">{money(t.net)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p className="mt-3 text-[11px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    Sources — Received: gateway payments with status “success” (by completion time). Refunds: refunds with status “success”. Paid to sellers: seller payout entries in the settlement ledger.
                    Days follow India time (IST). Every figure can be matched line by line in the Transactions tab or the CSV export.
                </p>
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ transactions */
function TransactionsTab({ token, from, to, onOpen }) {
    const [kind, setKind] = useState("");
    const [status, setStatus] = useState("");
    const [q, setQ] = useState("");
    const [dq, setDq] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ transactions: [], total: 0, pageSize: 25 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [exporting, setExporting] = useState(false);
    const ctl = useRef(null);

    useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
    useEffect(() => { setPage(1); }, [kind, status, dq, from, to]);

    useEffect(() => {
        ctl.current?.abort();
        const c = new AbortController(); ctl.current = c;
        setLoading(true);
        fetchFinanceTransactions(token, { from, to, kind, status, q: dq, page }, c.signal).then((res) => {
            if (res.aborted) return;
            if (res.success) { setData(res); setError(null); } else setError(res.message || "Couldn't load transactions.");
            setLoading(false);
        });
        return () => c.abort();
    }, [token, from, to, kind, status, dq, page]);

    const exportCsv = async () => {
        setExporting(true);
        const r = await downloadFinanceCsv(token, { from, to, kind, status, q: dq });
        setExporting(false);
        if (!r.success) return setError(r.message || "Export failed.");
        const url = URL.createObjectURL(r.blob);
        const a = Object.assign(document.createElement("a"), { href: url, download: r.filename });
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };

    const sel = "rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold";
    return (
        <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: C.hair }}>
                    <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, order number or name…" className="w-full text-[13px] font-medium outline-none" />
                </div>
                <select value={kind} onChange={(e) => setKind(e.target.value)} className={sel} style={{ borderColor: C.hair, color: C.ink }}>
                    <option value="">All types</option>
                    {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} style={{ borderColor: C.hair, color: C.ink }}>
                    <option value="">All statuses</option>
                    {["success", "pending", "initiated", "failed", "expired", "needs_review", "queued", "approved", "rejected"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
                <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export CSV
                </button>
            </div>
            <ErrorLine>{error}</ErrorLine>

            <div className="mt-3 overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: C.hair }}>
                <table className="w-full min-w-[900px] text-[12.5px]">
                    <thead>
                        <tr className="border-b text-left" style={{ borderColor: C.hair, color: C.muted, background: "#fafbfb" }}>
                            {["Time (IST)", "Type", "Reference", "Order / cart", "Party", "Amount", "Status"].map((h, i) => <th key={h} className={`px-3 py-2.5 font-bold ${h === "Amount" ? "text-right" : ""}`}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className={loading ? "opacity-50" : ""}>
                        {data.transactions.length === 0 && !loading && (
                            <tr><td colSpan={7} className="py-12 text-center font-semibold" style={{ color: C.muted }}>No transactions match these filters.</td></tr>
                        )}
                        {data.transactions.map((t) => {
                            const k = KIND[t.kind] || { label: t.kind, tone: "neutral", dir: "none" };
                            const sign = k.dir === "in" ? "+" : k.dir === "out" ? "−" : "";
                            return (
                                <tr key={`${t.kind}-${t.id}`} onClick={() => onOpen(t.kind, t.id)} className="cursor-pointer border-b hover:bg-[#fafbfb]" style={{ borderColor: C.hairSoft }}>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-medium" style={{ color: C.ink }}>{fmtIST(t.at)}</td>
                                    <td className="px-3 py-2.5"><Chip tone={k.tone}>{k.label}</Chip></td>
                                    <td className="px-3 py-2.5 font-mono text-[11.5px] font-semibold" style={{ color: C.ink }}>{t.reference || "—"}</td>
                                    <td className="px-3 py-2.5 font-mono text-[11.5px]" style={{ color: C.muted }}>{t.orderNumber || "—"}</td>
                                    <td className="px-3 py-2.5">
                                        <p className="font-semibold" style={{ color: C.ink }}>{t.party || "—"}</p>
                                        {t.counterparty && <p className="text-[11px]" style={{ color: C.muted }}>{t.counterparty}</p>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums" style={{ color: k.dir === "in" ? GREEN : k.dir === "out" ? RED : C.muted }}>{sign}{money(t.amount)}</td>
                                    <td className="px-3 py-2.5"><Chip tone={statusTone(t.status)}>{(t.status || "").replace("_", " ")}</Chip></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            <p className="mt-3 text-[11px] font-medium" style={{ color: C.muted }}>
                “Refund (dispute ledger)” lines mirror a refund to the buyer and are listed for audit only — they are never added to the totals, so nothing is counted twice. Click any row for its full audit trail.
            </p>
        </>
    );
}

/* ------------------------------------------------------------------ owed to sellers */
function PayoutsTab({ token }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetchPendingPayouts(token).then((r) => (r.success ? setRows(r.sellers) : setError(r.message || "Couldn't load payouts.")));
    }, [token]);
    if (error) return <ErrorLine>{error}</ErrorLine>;
    if (!rows) return <div className="mt-4"><Skeleton h={200} /></div>;

    const tot = rows.reduce((a, r) => ({ held: a.held + r.held, disputed: a.disputed + r.disputed }), { held: 0, disputed: 0 });
    return (
        <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Kpi label="Waiting out the dispute window" value={tot.held} sub="Released automatically when the window ends" />
                <Kpi label="On hold · disputed" value={tot.disputed} color={AMBER} sub="Released only after an admin decision" />
                <Kpi label="Total owed to sellers" value={tot.held + tot.disputed} sub={`${rows.length} seller${rows.length === 1 ? "" : "s"}`} />
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: C.hair }}>
                <table className="w-full min-w-[720px] text-[12.5px]">
                    <thead>
                        <tr className="border-b text-left" style={{ borderColor: C.hair, color: C.muted, background: "#fafbfb" }}>
                            <th className="px-3 py-2.5 font-bold">Seller</th>
                            <th className="px-3 py-2.5 text-right font-bold">In window</th>
                            <th className="px-3 py-2.5 text-right font-bold">Disputed</th>
                            <th className="px-3 py-2.5 text-right font-bold">Total</th>
                            <th className="px-3 py-2.5 font-bold">Next release (IST)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={5} className="py-12 text-center font-semibold" style={{ color: C.muted }}>Nothing is owed to any seller right now.</td></tr>}
                        {rows.map((r) => (
                            <tr key={r.sellerId} className="border-b" style={{ borderColor: C.hairSoft }}>
                                <td className="px-3 py-2.5 font-semibold" style={{ color: C.ink }}>
                                    {r.sellerName}
                                    {r.overdueCount > 0 && <span className="ml-2"><Chip tone="warn">{r.overdueCount} overdue</Chip></span>}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.held)} <span style={{ color: C.muted }}>({r.heldCount})</span></td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.disputed)} <span style={{ color: C.muted }}>({r.disputedCount})</span></td>
                                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums" style={{ color: C.ink }}>{money(r.held + r.disputed)}</td>
                                <td className="whitespace-nowrap px-3 py-2.5" style={{ color: C.muted }}>{fmtIST(r.nextRelease)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ audit checks */
function AuditTab({ token, onOpen }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        setBusy(true);
        const r = await fetchFinanceHealth(token);
        if (r.success) { setData(r); setError(null); } else setError(r.message || "Couldn't run the checks.");
        setBusy(false);
    }, [token]);
    useEffect(() => { load(); }, [load]);

    if (!data) return error ? <ErrorLine>{error}</ErrorLine> : <div className="mt-4"><Skeleton h={160} /></div>;
    return (
        <>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border bg-white p-4" style={{ borderColor: data.healthy ? "#34d39980" : "#f59e0b80" }}>
                <div className="flex items-center gap-2.5">
                    {data.healthy ? <CheckCircle2 className="h-5 w-5" style={{ color: GREEN }} /> : <AlertTriangle className="h-5 w-5" style={{ color: AMBER }} />}
                    <div>
                        <p className="text-[14px] font-extrabold" style={{ color: C.ink }}>{data.healthy ? "All checks passed" : "Some records need attention"}</p>
                        <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Checked {fmtIST(data.generatedAt)}</p>
                    </div>
                </div>
                <button onClick={load} disabled={busy} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>
                    <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Run again
                </button>
            </div>
            <ErrorLine>{error}</ErrorLine>
            <div className="mt-3 flex flex-col gap-3">
                {data.checks.map((c) => (
                    <section key={c.key} className="rounded-2xl border bg-white p-4" style={{ borderColor: c.count ? "#f59e0b60" : C.hair }}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-[13.5px] font-extrabold" style={{ color: C.ink }}>{c.title}</h3>
                                <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>{c.help}</p>
                            </div>
                            <Chip tone={c.count ? "warn" : "success"}>{c.count ? `${c.count} found` : "Clear"}</Chip>
                        </div>
                        {c.rows.length > 0 && (
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[560px] text-[12px]">
                                    <tbody>
                                        {c.rows.map((r) => (
                                            <tr key={r.id} onClick={r.kind ? () => onOpen(r.kind, r.id) : undefined} className={`border-t ${r.kind ? "cursor-pointer hover:bg-[#fafbfb]" : ""}`} style={{ borderColor: C.hairSoft }}>
                                                <td className="py-2 font-mono font-semibold" style={{ color: C.ink }}>{r.reference}</td>
                                                <td className="py-2 text-right font-bold tabular-nums">{money(r.amount)}</td>
                                                <td className="px-3 py-2" style={{ color: C.muted }}>{r.note}</td>
                                                <td className="whitespace-nowrap py-2 text-right" style={{ color: C.muted }}>{fmtIST(r.at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {c.count > c.rows.length && <p className="mt-1 text-[11px] font-semibold" style={{ color: C.muted }}>Showing the first {c.rows.length} of {c.count}.</p>}
                            </div>
                        )}
                    </section>
                ))}
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ audit drawer */
function fieldValue(k, v) {
    if (v && typeof v === "object") return JSON.stringify(v);
    if (/_at$|^at$/.test(k) && typeof v === "string") return fmtIST(v);
    if (/paise/.test(k) && Number.isFinite(Number(v))) return `${v} (${money(Number(v) / 100)})`;
    return String(v);
}

function DetailDrawer({ token, target, onClose }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        let live = true;
        setD(null); setError(null);
        fetchFinanceTransactionDetail(token, target.kind, target.id).then((r) => {
            if (!live) return;
            if (r.success) setD(r); else setError(r.message || "Couldn't load this record.");
        });
        return () => { live = false; };
    }, [token, target]);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const k = KIND[target.kind];
    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Transaction audit trail">
            <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" />
            <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <Chip tone={k?.tone}>{k?.label}</Chip>
                        <h2 className="mt-2 text-[16px] font-extrabold" style={{ color: C.ink }}>Audit trail</h2>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: C.hair }} aria-label="Close"><X className="h-4 w-4" /></button>
                </div>
                <ErrorLine>{error}</ErrorLine>
                {!d && !error && <div className="mt-4 flex flex-col gap-3"><Skeleton h={120} /><Skeleton h={120} /></div>}
                {d && (
                    <>
                        <h3 className="mt-5 text-[12.5px] font-extrabold" style={{ color: C.ink }}>Record</h3>
                        <dl className="mt-2 divide-y rounded-xl border text-[12px]" style={{ borderColor: C.hair }}>
                            {Object.entries(d.record).filter(([, v]) => v !== null && v !== "").map(([key, v]) => (
                                <div key={key} className="flex gap-3 px-3 py-1.5" style={{ borderColor: C.hairSoft }}>
                                    <dt className="w-40 shrink-0 font-semibold" style={{ color: C.muted }}>{key.replace(/_/g, " ")}</dt>
                                    <dd className="min-w-0 break-words font-medium" style={{ color: C.ink }}>{fieldValue(key, v)}</dd>
                                </div>
                            ))}
                        </dl>

                        {d.orders.length > 0 && (
                            <>
                                <h3 className="mt-5 text-[12.5px] font-extrabold" style={{ color: C.ink }}>Linked orders</h3>
                                <div className="mt-2 flex flex-col gap-2">
                                    {d.orders.map((o) => (
                                        <div key={o.id} className="rounded-xl border p-3 text-[12px]" style={{ borderColor: C.hair }}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono font-bold" style={{ color: C.ink }}>{o.order_number}</span>
                                                <span className="font-extrabold tabular-nums">{money(o.total_amount)}</span>
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                <Chip tone="neutral">{o.status}</Chip>
                                                <Chip tone={statusTone(o.payment_status)}>payment: {o.payment_status}</Chip>
                                                <Chip tone="info">payout: {o.settlement_status || "n/a"}{o.settlement_seller_amount ? ` · ${money(o.settlement_seller_amount)}` : ""}</Chip>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {d.related.length > 0 && (
                            <>
                                <h3 className="mt-5 text-[12.5px] font-extrabold" style={{ color: C.ink }}>Related money movements</h3>
                                <div className="mt-2 flex flex-col gap-2">
                                    {d.related.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between rounded-xl border px-3 py-2 text-[12px]" style={{ borderColor: C.hair }}>
                                            <span><b style={{ color: C.ink }}>{r.type}</b> <span className="font-mono" style={{ color: C.muted }}>{r.reference}</span></span>
                                            <span className="flex items-center gap-2"><span className="font-extrabold tabular-nums">{money(r.amount)}</span><Chip tone={statusTone(r.status)}>{r.status}</Chip></span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <h3 className="mt-5 text-[12.5px] font-extrabold" style={{ color: C.ink }}>Event log ({d.events.length})</h3>
                        {d.events.length === 0 ? <p className="mt-2 text-[12px]" style={{ color: C.muted }}>No gateway or order events recorded for this item.</p> : (
                            <ol className="mt-2 flex flex-col gap-2">
                                {d.events.map((e) => (
                                    <li key={e.id} className="rounded-xl border p-3 text-[12px]" style={{ borderColor: C.hair }}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-bold" style={{ color: C.ink }}>{(e.source || "event").replace(/_/g, " ")}{e.response_code ? ` · ${e.response_code}` : ""}</span>
                                            <span style={{ color: C.muted }}>{fmtIST(e.created_at)}</span>
                                        </div>
                                        {e.hash_valid !== undefined && e.hash_valid !== null && (
                                            <div className="mt-1"><Chip tone={e.hash_valid ? "success" : "warn"}>{e.hash_valid ? "Signature verified" : "Signature failed"}</Chip></div>
                                        )}
                                        {e.payload && (
                                            <details className="mt-1.5">
                                                <summary className="cursor-pointer font-semibold" style={{ color: C.secondary }}>Raw data</summary>
                                                <pre className="mt-1 max-h-48 overflow-auto rounded-lg p-2 text-[11px]" style={{ background: C.hairSoft }}>{JSON.stringify(e.payload, null, 2)}</pre>
                                            </details>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </>
                )}
            </aside>
        </div>
    );
}

/* ------------------------------------------------------------------ page */
export default function AdminFinancePage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [tab, setTab] = useState("overview");
    const [[from, to], setRange] = useState(PRESETS[2].range);
    const [bucket, setBucket] = useState("day");
    const [open, setOpen] = useState(null);

    const activePreset = useMemo(() => PRESETS.find((p) => { const [f, t] = p.range(); return f === from && t === to; })?.key || "custom", [from, to]);
    const inputCls = "rounded-lg border bg-white px-2 py-1.5 text-[12.5px] font-semibold";

    const setFrom = (v) => v && setRange([v, v > to ? v : to]);
    const setTo = (v) => v && setRange([v < from ? v : from, v]);

    return (
        <div className="mx-auto min-h-screen max-w-6xl px-2.5 pb-12 pt-3 sm:px-4">
            <div className="mt-3 flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div>
                    <h1 className="font-extrabold tracking-wide" style={{ color: C.ink, fontSize: "clamp(20px,1.8vw,26px)" }}>Finance &amp; Payments</h1>
                    <p className="text-[12px] font-medium" style={{ color: C.muted }}>Money received, refunded, paid out and still owed — all times in IST.</p>
                </div>
            </div>

            {/* range controls */}
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => {
                        const on = activePreset === p.key;
                        return <button key={p.key} onClick={() => setRange(p.range())} className="rounded-full border px-3 py-1.5 text-[11.5px] font-bold"
                            style={{ borderColor: on ? C.primary : C.hair, background: on ? C.primary : "#fff", color: on ? "#fff" : C.muted }}>{p.label}</button>;
                    })}
                </div>
                <div className="flex items-center gap-1.5">
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={{ borderColor: C.hair, color: C.ink }} aria-label="From date" />
                    <span className="text-[12px]" style={{ color: C.muted }}>to</span>
                    <input type="date" value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} className={inputCls} style={{ borderColor: C.hair, color: C.ink }} aria-label="To date" />
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: C.hair, background: "#fafbfb" }} role="group" aria-label="Group by">
                    {["day", "week", "month"].map((b) => (
                        <button key={b} onClick={() => setBucket(b)} className="rounded-md px-3 py-1 text-[12px] font-bold capitalize"
                            style={{ background: bucket === b ? C.primary : "transparent", color: bucket === b ? "#fff" : C.muted }}>{b}</button>
                    ))}
                </div>
            </div>

            {/* tabs */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border p-1 sm:grid-cols-4" style={{ borderColor: C.hair, background: "#fafbfb" }} role="tablist">
                {TABS.map(({ k, t }) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="rounded-md px-4 py-1.5 text-[13px] font-bold tracking-wide"
                        style={{ background: tab === k ? C.primary : "transparent", color: tab === k ? "#fff" : C.muted }}>{t}</button>
                ))}
            </div>

            {tab === "overview" && <Overview token={token} from={from} to={to} bucket={bucket} onOpenTab={setTab} />}
            {tab === "transactions" && <TransactionsTab token={token} from={from} to={to} onOpen={(kind, id) => setOpen({ kind, id })} />}
            {tab === "payouts" && <PayoutsTab token={token} />}
            {tab === "audit" && <AuditTab token={token} onOpen={(kind, id) => setOpen({ kind, id })} />}

            {open && <DetailDrawer token={token} target={open} onClose={() => setOpen(null)} />}
        </div>
    );
}