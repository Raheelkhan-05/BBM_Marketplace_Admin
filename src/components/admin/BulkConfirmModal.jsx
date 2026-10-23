// components/admin/BulkConfirmModal.jsx
// Small confirmation dialog for bulk actions. `requireText` (e.g. "DELETE") makes the admin type it before confirming.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { C } from "../catalog/tokens";
import { useModalLock } from "./bulkSelect.jsx";

export default function BulkConfirmModal({ title, children, confirmLabel = "Confirm", danger = false, busy = false, progress = "", requireText = "", onConfirm, onClose }) {
    useModalLock();
    const [typed, setTyped] = useState("");
    const ok = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();

    return createPortal(
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={title}
                className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
                <div className="px-5 pb-4 pt-5">
                    <div className="flex items-start gap-3">
                        {danger && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>}
                        <div className="min-w-0">
                            <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>{title}</h3>
                            <div className="mt-1.5 space-y-1.5 text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>{children}</div>
                        </div>
                    </div>
                    {requireText && (
                        <label className="mt-4 block">
                            <span className="text-[12px] font-bold" style={{ color: C.muted }}>Type <b style={{ color: C.ink }}>{requireText}</b> to confirm</span>
                            <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false}
                                className="mt-1.5 w-full rounded-xl border px-3 py-2.5 font-mono text-[13px] font-semibold outline-none" style={{ borderColor: C.hair, color: C.ink }} />
                        </label>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    {busy && progress && <span className="mr-auto text-[12px] font-semibold" style={{ color: C.muted }}>{progress}</span>}
                    <button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-xl px-4 text-[13px] font-bold disabled:opacity-50" style={{ color: C.muted }}>Cancel</button>
                    <button type="button" onClick={onConfirm} disabled={busy || !ok}
                        className="flex min-h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: danger ? "#b91c1c" : C.primary }}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}