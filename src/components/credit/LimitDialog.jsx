
// components/credit/LimitDialog.jsx
//
// One dialog for both seller actions that need a number:
//   mode="approve" — first approval (shows the liability notice)
//   mode="update"  — change the limit / answer a buyer's "higher limit" ask
// Styled like the Home feed's own modals (portal, blurred backdrop, rounded-[22px]).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import { C, EASE, fmtINR } from "./tokens.js";

const PRESETS = [10000, 25000, 50000, 100000];

export default function LimitDialog({ open, mode, buyerLabel, currentLimit, usageNote, confirming, onClose, onConfirm }) {
    const [limit, setLimit] = useState("");
    const numeric = Number(limit);
    const canConfirm = limit !== "" && numeric > 0 && Number.isFinite(numeric);
    const isApprove = mode === "approve";

    // reset each time the dialog opens
    useEffect(() => {
        if (!open) return;
        setLimit(!isApprove && currentLimit != null ? String(currentLimit) : "");
    }, [open, isApprove, currentLimit]);

    // lock page scroll while open
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    // Esc closes (unless a request is in flight)
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape" && !confirming) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, confirming, onClose]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    data-lenis-prevent=""
                    className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={confirming ? undefined : onClose}
                >
                    <motion.div
                        role="dialog" aria-modal="true"
                        initial={{ y: 24, opacity: 0, scale: 0.97 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 16, opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        onClick={(e) => e.stopPropagation()}
                        className="my-auto w-full max-w-sm rounded-[22px] bg-white p-5"
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: C.imgBg }}>
                                <CreditCard className="h-5 w-5" style={{ color: C.ink }} />
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className="text-[15px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
                                    {isApprove ? "Approve credit" : "Update credit limit"}
                                </p>
                                <p className="mt-0.5 truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                    {buyerLabel}
                                </p>
                            </div>
                            <button
                                onClick={onClose} disabled={confirming} aria-label="Close"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05] disabled:opacity-40"
                            >
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        </div>

                        <div className="mt-4">
                            <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                Monthly credit limit
                            </label>
                            <div className="mt-1.5 flex items-center gap-1.5 rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                                <span className="text-[14px] font-bold" style={{ color: C.muted }}>₹</span>
                                <input
                                    type="number" inputMode="decimal" min="1" value={limit}
                                    onChange={(e) => setLimit(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && canConfirm && !confirming) onConfirm(numeric); }}
                                    placeholder="e.g. 30000"
                                    className="w-full bg-transparent text-[16px] font-extrabold tabular-nums outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-[14px]"
                                    style={{ color: C.ink }}
                                />
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {PRESETS.map((p) => {
                                    const active = numeric === p;
                                    return (
                                        <button
                                            key={p} type="button" onClick={() => setLimit(String(p))}
                                            className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide tabular-nums transition-colors"
                                            style={active ? { background: C.primary, color: "#fff" } : { background: C.hairSoft, color: C.muted }}
                                        >
                                            {fmtINR(p)}
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="mt-2.5 text-[11px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                {isApprove
                                    ? "The buyer can order up to this much on credit per calendar month, across any number of orders. Resets automatically each month."
                                    : `Current limit: ${currentLimit != null ? fmtINR(currentLimit) : "not set"}. ${usageNote ?? "Updating resets this month's usage to zero."}`}
                            </p>
                        </div>

                        {isApprove && (
                            <div className="mt-4 rounded-xl border px-3.5 py-3" style={{ background: C.panel, borderColor: C.hair }}>
                                <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                                    <ShieldCheck className="h-3 w-3" strokeWidth={2.5} /> Before you approve
                                </p>
                                <p className="mt-1.5 text-[11.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>
                                    Credit terms, repayment, and any dispute arising from a credit sale are strictly between you and the buyer.
                                    BBM Marketplace does not process, hold, or guarantee any payment made under a credit arrangement, and is not
                                    a party to it. BBM Marketplace shall not be liable for any loss, non-payment, delay, or dispute connected with
                                    credit extended under this feature. Approving this request is your independent business decision.
                                </p>
                            </div>
                        )}

                        <div className="mt-5 flex gap-2.5">
                            <button
                                onClick={onClose} disabled={confirming}
                                className="flex h-10 flex-1 items-center justify-center rounded-xl border text-[12.5px] font-bold tracking-wide transition-colors hover:bg-black/[0.03] disabled:opacity-60"
                                style={{ borderColor: C.hair, color: C.ink }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => onConfirm(numeric)} disabled={confirming || !canConfirm}
                                className="flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-black text-[12.5px] font-bold tracking-wide text-white transition-transform hover:bg-black/90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                            >
                                {confirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {isApprove ? "I understand, approve" : "Update limit"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}