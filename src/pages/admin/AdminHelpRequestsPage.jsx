import { useEffect, useState, useCallback } from "react";
import { Loader2, Phone, Mail, CheckCircle2, Building2, Eye } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSocket } from "../../context/SocketContext.jsx";
import { adminListHelpRequests, adminAcknowledgeHelpRequest, adminResolveHelpRequest } from "../../utils/api.js";
import { formatIST } from "../../utils/formatIST.js";

const STAGE_BADGE = {
    pending: { label: "Pending", bg: "#fef3c7", color: "#a16207" },
    open: { label: "Open", bg: "#dbeafe", color: "#1d4ed8" },
    resolved: { label: "Resolved", bg: "#dcfce7", color: "#15803d" },
};

// Shared shape for both the "acknowledge" and "resolve" note-entry
// flows — same validation, same layout, different copy/action.
function NoteModal({ request, title, placeholder, presetNotes, confirmLabel, confirmColor, minLength = 3, onClose, onConfirm }) {
    const [notes, setNotes] = useState(presetNotes || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function submit() {
        if (notes.trim().length < minLength) return setError("Add a short note before continuing.");
        setSaving(true);
        const res = await onConfirm(notes.trim());
        setSaving(false);
        if (!res?.success) return setError(res?.message || "Something went wrong.");
        onClose();
    }

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5">
                <h3 className="text-[15px] font-extrabold text-slate-900">{title}</h3>
                <p className="mt-1 text-[12.5px] font-medium text-slate-500">
                    {request.profiles?.name || "User"}{request.company_name ? ` · ${request.company_name}` : ""} · raised {formatIST(request.triggered_at)}
                </p>
                <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
                    placeholder={placeholder}
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-900 focus:outline-none"
                />
                {error && <p className="mt-1.5 text-[12px] font-semibold text-[#c71f11]">{error}</p>}
                <div className="mt-3 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-slate-600">Cancel</button>
                    <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: confirmColor }}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AdminHelpRequestsPage() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [tab, setTab] = useState("pending");
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [acknowledging, setAcknowledging] = useState(null); // { request, presetNotes }
    const [resolving, setResolving] = useState(null);         // { request, presetNotes }

    const load = useCallback(async (status) => {
        setLoading(true);
        const res = await adminListHelpRequests(token, status);
        if (res?.success) setRequests(res.requests);
        setLoading(false);
    }, [token]);

    useEffect(() => { load(tab); }, [tab, load]);

    useEffect(() => {
        if (!socket || tab !== "pending") return;
        const onNew = (p) => setRequests((prev) => [{
            id: p.id, user_id: p.userId, status: "pending", triggered_at: p.triggeredAt,
            profiles: { name: p.name, phone: p.phone, email: p.email }, company_name: p.companyName,
        }, ...prev]);
        socket.on("help_request:new", onNew);
        return () => socket.off("help_request:new", onNew);
    }, [socket, tab]);

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-6 sm:px-6">
            <h1 className="text-[22px] font-extrabold text-slate-900">Support requests</h1>

            <div className="mt-3 flex gap-2">
                {["pending", "open", "resolved"].map((k) => (
                    <button key={k} onClick={() => setTab(k)} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
                        style={tab === k ? { background: STAGE_BADGE[k].color, color: "#fff" } : { background: "#f1f5f9", color: "#64748b" }}>
                        {STAGE_BADGE[k].label}
                    </button>
                ))}
            </div>

            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>}
                {!loading && requests.length === 0 && <p className="px-4 py-10 text-center text-[13px] font-medium text-slate-500">Nothing here.</p>}

                {!loading && requests.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 px-4 py-3.5">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-[13.5px] font-bold text-slate-900">{r.profiles?.name || "Unnamed user"}</p>
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: STAGE_BADGE[r.status].bg, color: STAGE_BADGE[r.status].color }}>
                                    {STAGE_BADGE[r.status].label}
                                </span>
                            </div>
                            {r.company_name && (
                                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
                                    <Building2 className="h-3 w-3" /> {r.company_name}
                                </p>
                            )}
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] font-medium text-slate-500">
                                {r.profiles?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.profiles.phone}</span>}
                                {r.profiles?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.profiles.email}</span>}
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">
                                Raised {formatIST(r.triggered_at)}
                                {r.status !== "pending" && r.acknowledged_at && ` · Acknowledged ${formatIST(r.acknowledged_at)}`}
                                {r.status === "resolved" && ` · Resolved ${formatIST(r.resolved_at)}`}
                            </p>
                            {r.acknowledgment_notes && (
                                <p className="mt-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11.5px] font-medium text-blue-800">
                                    <span className="font-bold">Discussed: </span>{r.acknowledgment_notes}
                                </p>
                            )}
                            {r.status === "resolved" && r.resolution_notes && (
                                <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-800">
                                    <span className="font-bold">Resolved: </span>{r.resolution_notes}
                                </p>
                            )}
                        </div>

                        {r.status === "pending" && (
                            <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                                <button
                                    onClick={() => setAcknowledging({ request: r, presetNotes: "" })}
                                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0ea5e9] px-3 py-1.5 text-[11.5px] font-bold text-white"
                                >
                                    <Eye className="h-3.5 w-3.5" /> Acknowledge
                                </button>
                                <button
                                    onClick={() => setResolving({ request: r, presetNotes: "Raised by mistake — no action needed." })}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-bold text-slate-600"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}
                        {r.status === "open" && (
                            <button onClick={() => setResolving({ request: r, presetNotes: "" })}
                                className="shrink-0 rounded-lg border border-[#047084]/30 px-3 py-1.5 text-[12px] font-bold text-[#047084]">
                                Resolve
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {acknowledging && (
                <NoteModal
                    request={acknowledging.request}
                    title="Acknowledge request"
                    placeholder="What was discussed with the user before acknowledging?"
                    presetNotes={acknowledging.presetNotes}
                    confirmLabel="Acknowledge"
                    confirmColor="#0ea5e9"
                    onClose={() => setAcknowledging(null)}
                    onConfirm={async (notes) => {
                        const res = await adminAcknowledgeHelpRequest(token, acknowledging.request.id, notes);
                        if (res?.success) setRequests((prev) => prev.filter((r) => r.id !== acknowledging.request.id));
                        return res;
                    }}
                />
            )}

            {resolving && (
                <NoteModal
                    request={resolving.request}
                    title="Resolve request"
                    placeholder="What was discussed / how was it resolved?"
                    presetNotes={resolving.presetNotes}
                    confirmLabel="Mark resolved"
                    confirmColor="#047084"
                    onClose={() => setResolving(null)}
                    onConfirm={async (notes) => {
                        const res = await adminResolveHelpRequest(token, resolving.request.id, notes);
                        if (res?.success) setRequests((prev) => prev.filter((r) => r.id !== resolving.request.id));
                        return res;
                    }}
                />
            )}
        </div>
    );
}