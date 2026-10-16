import { useEffect, useState, useCallback } from "react";
import { Loader2, Phone, Mail, Building2, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSocket } from "../../context/SocketContext.jsx";
import { adminListGstinReports, adminResolveGstinReport } from "../../utils/api.js";
import { formatIST } from "../../utils/formatIST.js";

const Person = ({ p, title }) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-400">{title}</p>
        <p className="text-[13px] font-bold text-slate-900">{p?.name || "Unnamed"}</p>
        {p?.company && <p className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500"><Building2 className="h-3 w-3" />{p.company}</p>}
        {p?.phone && <p className="flex items-center gap-1 text-[11.5px] text-slate-500"><Phone className="h-3 w-3" />{p.phone}{p.phone_verified ? " ✓" : " (unverified)"}</p>}
        {p?.email && <p className="flex items-center gap-1 text-[11.5px] text-slate-500"><Mail className="h-3 w-3" />{p.email}{p.email_verified ? " ✓" : " (unverified)"}</p>}
    </div>
);

export default function AdminGstinReportsPage() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [tab, setTab] = useState("pending");
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [target, setTarget] = useState(null);
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        const res = await adminListGstinReports(token, tab);
        if (res?.success) setReports(res.reports);
        setLoading(false);
    }, [token, tab]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!socket || tab !== "pending") return undefined;
        socket.on("gstin_report:new", load);
        return () => socket.off("gstin_report:new", load);
    }, [socket, tab, load]);

    const submit = async () => {
        if (message.trim().length < 3) { setError("Write the message the user will receive."); return; }
        setSaving(true); setError("");
        const res = await adminResolveGstinReport(token, target.id, message.trim());
        setSaving(false);
        if (!res?.success) { setError(res?.message || "Something went wrong."); return; }
        setReports((prev) => prev.filter((r) => r.id !== target.id));
        setTarget(null); setMessage("");
    };

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-6 sm:px-6">
            <h1 className="text-[22px] font-extrabold text-slate-900">GSTIN reports</h1>
            <div className="mt-3 flex gap-2">
                {["pending", "resolved"].map((k) => (
                    <button key={k} onClick={() => setTab(k)} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold capitalize"
                        style={tab === k ? { background: "#047084", color: "#fff" } : { background: "#f1f5f9", color: "#64748b" }}>{k}</button>
                ))}
            </div>

            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>}
                {!loading && reports.length === 0 && <p className="px-4 py-10 text-center text-[13px] font-medium text-slate-500">Nothing here.</p>}
                {!loading && reports.map((r) => (
                    <div key={r.id} className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-[13.5px] font-bold text-slate-900">{r.gstin}</p>
                            <p className="text-[11px] font-semibold text-slate-400">Reported {formatIST(r.created_at)}</p>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <Person p={r.reporter} title="Reported by" />
                            <Person p={r.existing} title="GSTIN currently on" />
                        </div>
                        {r.note && <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[12px] font-medium text-blue-800"><span className="font-bold">User note: </span>{r.note}</p>}
                        {r.status === "resolved" ? (
                            <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-800">
                                <span className="font-bold">Sent{r.notified_via?.length ? ` via ${r.notified_via.join(" + ")}` : " (delivery failed)"}: </span>{r.resolution_notes}
                            </p>
                        ) : (
                            <button onClick={() => { setTarget(r); setMessage(""); setError(""); }}
                                className="mt-2 rounded-lg border border-[#047084]/30 px-3 py-1.5 text-[12px] font-bold text-[#047084]">Reply and resolve</button>
                        )}
                    </div>
                ))}
            </div>

            {target && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={() => setTarget(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5">
                        <h3 className="text-[15px] font-extrabold text-slate-900">Reply to {target.reporter?.name || "user"}</h3>
                        <p className="mt-1 text-[12.5px] font-medium text-slate-500">
                            Sent to their verified {[target.reporter?.email_verified && "email", target.reporter?.phone_verified && "mobile"].filter(Boolean).join(" and ") || "contact (none verified)"}.
                        </p>
                        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000}
                            placeholder="What should the user do next?"
                            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-900 focus:outline-none" />
                        {error && <p className="mt-1.5 text-[12px] font-semibold text-[#c71f11]">{error}</p>}
                        <div className="mt-3 flex justify-end gap-2">
                            <button onClick={() => setTarget(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-slate-600">Cancel</button>
                            <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-[#047084] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Send and resolve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}