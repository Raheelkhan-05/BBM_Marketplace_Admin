// components/orders/disputeUi.jsx — small shared helpers for the cancel / dispute UI.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileText } from "lucide-react";
import { C } from "../catalog/tokens.js";

export function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

export function fmtDateTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Re-renders every `intervalMs` so countdowns stay live without a refetch.
export function useNow(intervalMs = 30000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export function formatRemaining(ms) {
    if (ms <= 0) return "0m";
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${Math.max(m, 1)}m`;
}

const TONES = {
    neutral: { background: "#f1f3f4", color: "#4A535B" },
    info: { background: "#0B728514", color: "#0B7285" },
    warn: { background: "#f59e0b1a", color: "#b45309" },
    success: { background: "#05966914", color: "#047857" },
    danger: { background: "#c71f1112", color: "#c71f11" },
    violet: { background: "#7c3aed14", color: "#6d28d9" },
};
export function Chip({ tone = "neutral", children, className = "" }) {
    const t = TONES[tone] || TONES.neutral;
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-wide ${className}`} style={t}>
            {children}
        </span>
    );
}

// Bottom sheet on phones, centred card on desktop. Rendered in a portal so the
// animated order card (transform) can't trap `position: fixed`, and click events
// are stopped so they never bubble through React's tree to the clickable card.
export function ModalShell({ title, subtitle, onClose, busy = false, children, footer }) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [onClose, busy]);

    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
            onClick={(e) => { e.stopPropagation(); if (!busy) onClose(); }}>
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        {subtitle && <p className="text-[11px] font-bold tracking-wider" style={{ color: C.secondary }}>{subtitle}</p>}
                        <h2 className="mt-0.5 text-[16px] font-bold tracking-wide" style={{ color: C.ink }}>{title}</h2>
                    </div>
                    <button type="button" disabled={busy} onClick={onClose} aria-label="Close"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05] disabled:opacity-40">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="shrink-0 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>{footer}</div>}
            </div>
        </div>,
        document.body
    );
}

export function EvidenceList({ items }) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {list.map((f, i) => {
                const isImg = (f.type || "").startsWith("image/");
                return (
                    <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-white"
                        style={{ borderColor: C.hair }} title={f.name}>
                        {isImg ? <img src={f.url} alt={f.name || "evidence"} className="h-full w-full object-cover" />
                            : <FileText className="h-5 w-5" style={{ color: C.muted }} />}
                    </a>
                );
            })}
        </div>
    );
}

export function FilePicker({ files, onChange, max, maxBytes, accept, disabled }) {
    const [error, setError] = useState(null);
    const previews = useMemo(() => files.map((f) => ({ f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })), [files]);
    useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

    const add = (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        setError(null);
        const next = [...files];
        for (const f of picked) {
            if (next.length >= max) { setError(`You can attach up to ${max} files.`); break; }
            if (!accept.includes(f.type)) { setError("Only JPG, PNG, WebP or PDF files are allowed."); continue; }
            if (f.size > maxBytes) { setError(`"${f.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`); continue; }
            next.push(f);
        }
        onChange(next);
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2">
                {previews.map((p, i) => (
                    <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border bg-white" style={{ borderColor: C.hair }}>
                        {p.url ? <img src={p.url} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full items-center justify-center"><FileText className="h-5 w-5" style={{ color: C.muted }} /></div>}
                        <button type="button" disabled={disabled} aria-label="Remove file"
                            onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white">
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </div>
                ))}
                {files.length < max && (
                    <label className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed text-[22px] font-light ${disabled ? "opacity-40" : ""}`}
                        style={{ borderColor: C.hair, color: C.muted }}>
                        +
                        <input type="file" multiple accept={accept.join(",")} className="hidden" onChange={add} disabled={disabled} />
                    </label>
                )}
            </div>
            {error && <p className="mt-1.5 text-[11.5px] font-semibold text-red-700">{error}</p>}
        </div>
    );
}