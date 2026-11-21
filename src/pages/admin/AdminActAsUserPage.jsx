// src/pages/admin/AdminActAsUserPage.jsx
import { useCallback, useEffect, useState } from "react";
import { Ban, ChevronDown, History, Loader2, Search, ShieldCheck, Store, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import ActAsUserButton from "../../components/ActAsUserButton.jsx";
import {
    searchImpersonationUsers, listImpersonationSessions, getImpersonationLog, revokeImpersonationSession,
} from "../../utils/impersonationApi.js";

const initials = (s) => (s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "—");

const STATUS = {
    active: { label: "Active", bg: "rgba(22,163,74,0.1)", fg: "#15803d" },
    ended: { label: "Ended", bg: "rgba(100,116,139,0.12)", fg: "#475569" },
    expired: { label: "Expired", bg: "rgba(217,119,6,0.1)", fg: "#b45309" },
    pending: { label: "Not opened yet", bg: "rgba(4,112,132,0.1)", fg: "#047084" },
    unused: { label: "Never opened", bg: "rgba(100,116,139,0.12)", fg: "#64748b" },
};

const TABS = [
    { key: "find", label: "Find a user", Icon: Users },
    { key: "history", label: "Session history", Icon: History },
];

export default function AdminActAsUserPage() {
    const [tab, setTab] = useState("find");
    return (
        <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-6 sm:px-6">
            <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#047084]" />
                <h1 className="text-[22px] font-extrabold text-slate-900">Act as user</h1>
            </div>
            <p className="mt-1 max-w-2xl text-[13px] font-medium text-slate-500">
                Open the marketplace signed in as any user to manage their profile, listings and more. Every session needs a reason and every change is logged under your name.
            </p>

            <div className="mt-4 flex gap-1.5">
                {TABS.map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
                        style={{ background: tab === key ? "#047084" : "#f1f5f9", color: tab === key ? "white" : "#64748b" }}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                ))}
            </div>

            {tab === "find" ? <FindTab /> : <HistoryTab />}
        </div>
    );
}

function FindTab() {
    const { token } = useAuth();
    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setItems([]); setSearched(false); setLoading(false); setError(""); return undefined; }
        let live = true;
        setLoading(true);
        const t = setTimeout(async () => {
            const res = await searchImpersonationUsers(token, term);
            if (!live) return;
            setItems(res?.success ? res.items : []);
            setError(res?.success ? "" : res?.message || "Search failed.");
            setSearched(true); setLoading(false);
        }, 350);
        return () => { live = false; clearTimeout(t); };
    }, [q, token]);

    return (
        <div className="mt-5">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                    placeholder="Search by name, phone, email, company or GSTIN…"
                    className="w-full bg-transparent text-[13.5px] font-semibold focus:outline-none" />
                {loading && <Loader2 className="h-4 w-4 animate-spin text-[#047084]" />}
            </div>

            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p>}
            {!loading && searched && !items.length && !error && (
                <p className="py-12 text-center text-[13px] font-medium text-slate-400">No users found.</p>
            )}
            {!searched && !loading && <p className="py-12 text-center text-[13px] font-medium text-slate-400">Type at least 2 characters to search.</p>}

            {items.length > 0 && (
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                    {items.map((u) => {
                        const title = u.company || u.name || u.email || u.phone || "User";
                        return (
                            <div key={u.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[13px] font-extrabold text-slate-500">{initials(title)}</span>
                                    <div className="min-w-0">
                                        <p className="truncate text-[14px] font-bold text-slate-900">{title}</p>
                                        <p className="truncate text-[12px] font-medium text-slate-400">
                                            {[u.company ? u.name : null, u.phone && `+91 ${u.phone}`, u.email].filter(Boolean).join(" · ") || "No contact details"}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            {u.gstin && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-slate-500">{u.gstin}</span>}
                                            {u.isSeller && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-[#047084]/10 px-2 py-0.5 text-[10.5px] font-bold text-[#047084]">
                                                    <Store className="h-3 w-3" /> Seller{u.sellerStatus ? ` · ${u.sellerStatus.replace(/_/g, " ")}` : ""}
                                                </span>
                                            )}
                                            {!u.onboarded && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">Onboarding unfinished</span>}
                                        </div>
                                    </div>
                                </div>
                                <ActAsUserButton userId={u.id} name={title} compact />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function HistoryTab() {
    const { token } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [more, setMore] = useState({ hasMore: false, before: null, loading: false });
    const [onlyActive, setOnlyActive] = useState(false);
    const [openId, setOpenId] = useState(null);
    const [logs, setLogs] = useState({});
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await listImpersonationSessions(token, { status: onlyActive ? "active" : undefined });
        if (res?.success) { setItems(res.items); setMore({ hasMore: res.hasMore, before: res.nextBefore, loading: false }); }
        setLoading(false);
    }, [token, onlyActive]);
    useEffect(() => { load(); }, [load]);

    const loadMore = async () => {
        setMore((m) => ({ ...m, loading: true }));
        const res = await listImpersonationSessions(token, { status: onlyActive ? "active" : undefined, before: more.before });
        if (res?.success) { setItems((l) => [...l, ...res.items]); setMore({ hasMore: res.hasMore, before: res.nextBefore, loading: false }); }
        else setMore((m) => ({ ...m, loading: false }));
    };

    const toggle = async (id) => {
        if (openId === id) { setOpenId(null); return; }
        setOpenId(id);
        if (!logs[id]) {
            const res = await getImpersonationLog(token, id);
            setLogs((l) => ({ ...l, [id]: res?.success ? res.items : [] }));
        }
    };

    const revoke = async (id) => {
        if (!window.confirm("End this session now? The admin will be signed out of it immediately.")) return;
        setBusyId(id);
        const res = await revokeImpersonationSession(token, id);
        if (res?.success) setItems((l) => l.map((s) => (s.id === id ? { ...s, status: "ended", endedAt: new Date().toISOString() } : s)));
        setBusyId(null);
    };

    return (
        <div className="mt-5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-bold text-slate-600">
                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="h-4 w-4 accent-[#047084]" />
                Active sessions only
            </label>

            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>}
                {!loading && !items.length && <p className="py-10 text-center text-[13px] font-medium text-slate-400">No sessions yet.</p>}

                {items.map((s) => {
                    const tone = STATUS[s.status] || STATUS.ended;
                    const open = openId === s.id;
                    return (
                        <div key={s.id} className="px-4 py-3.5">
                            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13.5px] font-bold text-slate-900">
                                        {s.admin.name} <span className="font-medium text-slate-400">as</span> {s.target.company || s.target.name}
                                    </p>
                                    <p className="mt-0.5 text-[12px] font-medium text-slate-500">“{s.reason}”</p>
                                    <p className="mt-1 text-[11.5px] font-medium text-slate-400">
                                        {fmt(s.startedAt || s.createdAt)}{s.endedAt ? ` → ${fmt(s.endedAt)}` : ""}
                                        {s.endedBy?.startsWith("revoked") ? " · revoked" : ""}
                                    </p>
                                </div>
                                <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                                {s.status === "active" && (
                                    <button onClick={() => revoke(s.id)} disabled={busyId === s.id}
                                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#c71f11]/30 px-2.5 py-1 text-[11.5px] font-bold text-[#c71f11] disabled:opacity-50">
                                        {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} End now
                                    </button>
                                )}
                                <button onClick={() => toggle(s.id)} aria-expanded={open}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-600">
                                    Activity <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                                </button>
                            </div>

                            {open && (
                                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
                                    {!logs[s.id] ? (
                                        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#047084]" /></div>
                                    ) : logs[s.id].length === 0 ? (
                                        <p className="px-3 py-3 text-[12px] font-medium text-slate-400">No changes were made in this session.</p>
                                    ) : (
                                        <table className="w-full min-w-[420px] text-left text-[11.5px]">
                                            <tbody>
                                                {logs[s.id].map((l) => (
                                                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                                                        <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-400">{fmt(l.created_at)}</td>
                                                        <td className="px-2 py-1.5 font-extrabold text-slate-700">{l.method}</td>
                                                        <td className="px-2 py-1.5 font-mono font-semibold text-slate-600">{l.route}</td>
                                                        <td className="px-3 py-1.5 text-right font-bold" style={{ color: l.status >= 400 ? "#c71f11" : "#15803d" }}>{l.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {more.hasMore && (
                <div className="mt-4 flex justify-center">
                    <button onClick={loadMore} disabled={more.loading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[12.5px] font-bold text-slate-600 disabled:opacity-50">
                        {more.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load more
                    </button>
                </div>
            )}
        </div>
    );
}