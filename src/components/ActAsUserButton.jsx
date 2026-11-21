// src/components/ActAsUserButton.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, ShieldAlert, UserCog, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { startImpersonation } from "../utils/impersonationApi.js";

const LANDINGS = [
    { value: "/home", label: "Marketplace home" },
    { value: "/sell/dashboard", label: "Seller dashboard" },
    { value: "/buy/orders", label: "Buyer orders" },
];
const QUICK_REASONS = ["Support request", "Fixing a listing", "Onboarding help", "Verifying a reported issue"];
const MIN_REASON = 5;

/** Pass either userId or sellerId (the id in /sellers/:id). */
export default function ActAsUserButton({ userId, sellerId, name, label = "Act as user", compact = false }) {
    const { token } = useAuth();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [landing, setLanding] = useState("/home");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null); // { url, opened, targetName, viaTeamMember }
    const areaRef = useRef(null);

    const close = useCallback(() => {
        if (busy) return;
        setOpen(false); setResult(null); setError(""); setReason("");
    }, [busy]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", onKey);
        const t = setTimeout(() => areaRef.current?.focus(), 60);
        return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
    }, [open, close]);

    const valid = reason.trim().length >= MIN_REASON;

    const submit = async () => {
        if (!valid || busy) return;
        setBusy(true); setError("");

        // Open the tab NOW (inside the click) so pop-up blockers allow it, then point it at the session link.
        const win = window.open("about:blank", "_blank");
        try { if (win) win.opener = null; } catch { /* ignore */ }

        const res = await startImpersonation(token, { userId, sellerId, reason: reason.trim() });
        if (!res?.success) {
            try { win?.close(); } catch { /* ignore */ }
            setError(res?.message || "Couldn't start the session. Try again.");
            setBusy(false);
            return;
        }

        const url = `${res.url}#code=${encodeURIComponent(res.code)}&next=${encodeURIComponent(landing)}`;
        if (win) win.location.href = url;
        setResult({ url, opened: !!win, targetName: res.target?.company || res.target?.name || name || "the user", viaTeamMember: !!res.viaTeamMember });
        setBusy(false);
    };

    return (
        <>
            <button
                type="button" onClick={() => setOpen(true)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg font-bold text-white transition hover:brightness-105 active:scale-[.985] ${compact ? "px-3 py-1.5 text-[12px]" : "px-4 py-2.5 text-[13px]"}`}
                style={{ background: "linear-gradient(135deg, #047084, #0a95ab)" }}
            >
                <UserCog className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> {label}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
                    >
                        <motion.div
                            role="dialog" aria-modal="true" aria-labelledby="act-as-title"
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#047084]/10 text-[#047084]"><UserCog className="h-[18px] w-[18px]" /></span>
                                    <div>
                                        <h2 id="act-as-title" className="text-[16px] font-extrabold text-slate-900">
                                            {result ? "Session opened" : `Act as ${name || "this user"}`}
                                        </h2>
                                        <p className="text-[12px] font-medium text-slate-500">Opens the marketplace in a new tab, signed in as them.</p>
                                    </div>
                                </div>
                                <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                            </div>

                            {result ? (
                                <div className="mt-4">
                                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700">
                                        {result.opened
                                            ? `A new tab is opening as ${result.targetName}. You can close this window.`
                                            : "Your browser blocked the new tab. Open the session with the button below (valid for 60 seconds)."}
                                    </p>
                                    {result.viaTeamMember && (
                                        <p className="mt-2 text-[12px] font-medium text-slate-500">This user belongs to a company team, so you are signed in as the company account.</p>
                                    )}
                                    <div className="mt-4 flex justify-end gap-2">
                                        {!result.opened && (
                                            <a href={result.url} target="_blank" rel="noreferrer noopener"
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2 text-[13px] font-bold text-white">
                                                Open session <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        )}
                                        <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-600">Done</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <label htmlFor="act-as-reason" className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason (recorded in the audit log)</label>
                                    <textarea
                                        id="act-as-reason" ref={areaRef} rows={3} maxLength={300} value={reason} disabled={busy}
                                        onChange={(e) => setReason(e.target.value)} placeholder="e.g. Seller asked us to fix the pack size on their Shell listing"
                                        className="mt-1.5 w-full rounded-lg border-2 border-slate-200 px-3 py-2 text-[13px] font-medium focus:border-[#047084] focus:outline-none disabled:opacity-60"
                                    />
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {QUICK_REASONS.map((r) => (
                                            <button key={r} type="button" disabled={busy} onClick={() => setReason(r)}
                                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">{r}</button>
                                        ))}
                                    </div>

                                    <label htmlFor="act-as-landing" className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Open on</label>
                                    <select id="act-as-landing" value={landing} onChange={(e) => setLanding(e.target.value)} disabled={busy}
                                        className="mt-1.5 w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold focus:border-[#047084] focus:outline-none">
                                        {LANDINGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                    </select>

                                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] font-medium leading-relaxed text-amber-800">
                                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>Everything you do is logged under your name. Phone/email changes, bank details, wallet, payments and team access are blocked. The session lasts 2 hours.</span>
                                    </div>

                                    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p>}

                                    <div className="mt-5 flex justify-end gap-2">
                                        <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-600 disabled:opacity-50">Cancel</button>
                                        <button type="button" onClick={submit} disabled={!valid || busy}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Open session
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}