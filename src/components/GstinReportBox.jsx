import { useState } from "react";
import { Loader2, Flag, CheckCircle2 } from "lucide-react";
import { reportGstinConflict } from "../utils/api.js";

export default function GstinReportBox({ token, gstin }) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(null); // { reachedAt: [] }

    const send = async () => {
        setBusy(true); setError("");
        const res = await reportGstinConflict(token, gstin, note.trim());
        setBusy(false);
        if (!res?.success) { setError(res?.message || "Couldn't send your report."); return; }
        setDone({ reachedAt: res.reachedAt || [] });
    };

    if (done) {
        return (
            <div className="mt-3 flex gap-2.5 rounded-xl bg-emerald-50 p-3 text-[13px] font-semibold leading-snug text-emerald-800" role="status">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    Thanks, we've received your report. We'll look into it
                    {done.reachedAt.length ? ` and update you on ${done.reachedAt.join(" and ")}.` : " and contact you."}
                </span>
            </div>
        );
    }

    return (
        <div className="mt-3">
            {!open ? (
                <button type="button" onClick={() => setOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-bold" style={{ borderColor: "rgba(20,27,34,.15)" }}>
                    <Flag className="h-4 w-4" /> This is my GSTIN. Report to support
                </button>
            ) : (
                <div className="rounded-xl border p-3" style={{ borderColor: "rgba(20,27,34,.12)" }}>
                    <label htmlFor="gst-note" className="text-[13px] font-bold">Anything we should know? (optional)</label>
                    <textarea id="gst-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. I'm the owner, the earlier account was created by mistake"
                        className="mt-2 w-full rounded-lg border px-3 py-2 text-[13px] outline-none" style={{ borderColor: "rgba(20,27,34,.12)" }} />
                    {error && <p role="alert" className="mt-1.5 text-[12.5px] font-bold text-[#d2462b]">{error}</p>}
                    <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy} onClick={send}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B7285] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
                        </button>
                        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-2 text-[13px] font-bold text-slate-500">Cancel</button>
                    </div>
                    <p className="mt-2 text-[11.5px] font-medium text-slate-500">We'll reply on your verified email or mobile number.</p>
                </div>
            )}
        </div>
    );
}