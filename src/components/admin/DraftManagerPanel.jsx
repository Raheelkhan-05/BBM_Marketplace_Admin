// components/admin/DraftManagerPanel.jsx   (replaces DraftPhotoPanel.jsx — you can delete that file)
// Pick many unfinished bulk-upload products, then add photos, remove them, or submit the ready ones in one go.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ImagePlus, Trash2, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { C } from "../catalog/tokens";
import { Checkbox, SelectAllRow, useSelection, useModalLock } from "./bulkSelect.jsx";
import BulkPhotoModal from "./BulkPhotoModal.jsx";
import BulkConfirmModal from "./BulkConfirmModal.jsx";

const EMPTY = new Map();
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const hasPhoto = (i) => !!i.data?.im?.length;

export default function DraftManagerPanel({ items, getIssues, live, uploadToken, onApplyPhotos, onRemove, onSubmit, onClose, say }) {
    useModalLock();
    const [stage, setStage] = useState("pick"); // pick | run | result
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const [photoOpen, setPhotoOpen] = useState(false);
    const [confirm, setConfirm] = useState(null); // "remove" | "submit"
    const [busy, setBusy] = useState(false);
    const [prog, setProg] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState(null);
    const stop = useRef(false);
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);

    const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
    // only computed while picking, so a running submit (which changes `items` on every product) stays cheap
    const issues = useMemo(() => (stage === "pick" ? getIssues(items) : EMPTY), [stage, items, getIssues]);
    const bad = (i) => !!issues.get(i.id)?.length;

    const counts = useMemo(() => {
        let fix = 0, nophoto = 0;
        for (const i of pending) { if (issues.get(i.id)?.length) fix += 1; if (!hasPhoto(i)) nophoto += 1; }
        return { all: pending.length, ready: pending.length - fix, fix, nophoto };
    }, [pending, issues]);

    const list = useMemo(() => {
        const t = q.trim().toLowerCase();
        return pending.filter((i) => {
            const b = !!issues.get(i.id)?.length;
            if (filter === "ready" && b) return false;
            if (filter === "fix" && !b) return false;
            if (filter === "nophoto" && hasPhoto(i)) return false;
            return !t || `${i.data?.n || ""} ${i.data?.b || ""}`.toLowerCase().includes(t);
        });
    }, [pending, issues, q, filter]);
    const ids = useMemo(() => list.map((i) => i.id), [list]);
    const sel = useSelection(ids);

    const selIds = [...sel.selected];
    const readyIds = selIds.filter((id) => !issues.get(id)?.length);
    const fixCount = selIds.length - readyIds.length;

    const doRemove = async () => {
        setBusy(true);
        const r = await onRemove(selIds);
        if (!alive.current) return;
        setBusy(false); setConfirm(null);
        if (r?.success) sel.clear();
    };

    const doSubmit = async () => {
        const run = readyIds;
        setConfirm(null); stop.current = false;
        setProg({ done: 0, total: run.length }); setStage("run");
        let r;
        try {
            r = await onSubmit(run, { onProgress: (d, t) => alive.current && setProg({ done: d, total: t }), shouldStop: () => stop.current });
        } catch { r = { success: false, message: "Something went wrong while submitting." }; }
        if (!alive.current) return;
        setResult(r); setStage("result"); sel.clear();
    };

    const chips = [["all", "All", counts.all], ["ready", "Ready to submit", counts.ready], ["fix", "Needs fixing", counts.fix], ["nophoto", "No photos", counts.nophoto]];
    const running = stage === "run";

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4" onClick={() => !running && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage unfinished products"
                className="flex h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[90vh] sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>Manage unfinished products</h3>
                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>
                            {stage === "pick" ? "Tick products to add photos, remove them, or submit the ready ones. Hold Shift to select a range." : stage === "run" ? "Submitting. Please keep this window open." : "Submit finished."}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={running} aria-label="Close" className="shrink-0 rounded-full p-1.5 disabled:opacity-40" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                {stage === "pick" && (
                    <>
                        <div className="shrink-0 space-y-2 border-b px-5 py-3" style={{ borderColor: C.hairSoft }}>
                            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: C.hair }}>
                                <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product or brand, e.g. SKF 6205" aria-label="Search products" className="w-full text-[13px] font-medium outline-none" />
                                {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4" style={{ color: C.muted }} /></button>}
                            </label>
                            <div className="flex gap-1.5 overflow-x-auto">
                                {chips.map(([k, l, n]) => (
                                    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className="shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold"
                                        style={{ borderColor: filter === k ? C.primary : C.hair, background: filter === k ? C.primary : "#fff", color: filter === k ? "#fff" : C.muted }}>{l} · {n}</button>
                                ))}
                            </div>
                            {list.length > 0 && (
                                <SelectAllRow accent={C.primary} checked={sel.isAll} indeterminate={sel.count > 0 && !sel.isAll} count={sel.count} total={list.length}
                                    noun="shown" onChange={() => (sel.isAll ? sel.clear() : sel.selectAll())}>
                                    {counts.ready > 0 && (
                                        <button type="button" onClick={() => sel.setMany(list.filter((i) => !bad(i)).map((i) => i.id))} className="text-[12px] font-bold underline underline-offset-2" style={{ color: C.primary }}>
                                            Select all ready
                                        </button>
                                    )}
                                </SelectAllRow>
                            )}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                            {!list.length && <p className="px-5 py-14 text-center text-[13px] font-semibold" style={{ color: C.muted }}>{pending.length ? "No products match." : "No unfinished products."}</p>}
                            {list.map((i) => {
                                const on = sel.selected.has(i.id);
                                const probs = issues.get(i.id) || [];
                                const n = i.data?.im?.length || 0;
                                return (
                                    <div key={i.id} role="presentation" onClick={(e) => sel.toggle(i.id, e)}
                                        className="flex cursor-pointer select-none items-center gap-3 border-b px-5 py-2.5" style={{ borderColor: C.hairSoft, background: on ? `${C.primary}0d` : "#fff" }}>
                                        <Checkbox checked={on} onChange={(e) => sel.toggle(i.id, e)} accent={C.primary} label={`Select ${i.data?.n || "product"}`} />
                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-slate-50" style={{ borderColor: C.hair }}>
                                            {i.data?.im?.[0] && <img src={i.data.im[0]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-extrabold" style={{ color: C.ink }}>{i.data?.n?.trim() || `Product ${i.row_no ?? ""}`}</p>
                                            <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>
                                                {i.data?.nb ? "No brand" : i.data?.b || "No brand yet"}{i.row_no ? ` · Row ${i.row_no}` : ""} · {n ? `${n} photo${n === 1 ? "" : "s"}` : "No photos"}
                                            </p>
                                            {probs.length > 0 && (
                                                <p className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold" style={{ color: "#a16207" }}>{probs[0]}{probs.length > 1 ? ` (+${probs.length - 1} more)` : ""}</p>
                                            )}
                                        </div>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: probs.length ? "#fef3c7" : "#dcfce7", color: probs.length ? "#a16207" : "#15803d" }}>
                                            {probs.length ? `${plural(probs.length, "issue", "issues")}` : "Ready"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="shrink-0 border-t px-5 py-3" style={{ borderColor: C.hairSoft }}>
                            <p className="mb-2 min-h-[16px] text-[11.5px] font-semibold" style={{ color: C.muted }}>
                                {sel.count === 0 ? `${counts.ready} of ${counts.all} products are ready to submit.`
                                    : fixCount > 0 ? `${plural(readyIds.length, "selected product is", "selected products are")} ready. ${fixCount} still need fixing and will be skipped on submit.`
                                        : `All ${plural(sel.count, "selected product is", "selected products are")} ready to submit.`}
                            </p>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <button type="button" disabled={!sel.count} onClick={() => setPhotoOpen(true)}
                                    className="flex min-h-10 items-center gap-1.5 rounded-xl border px-4 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.ink }}>
                                    <ImagePlus className="h-4 w-4" />Add photos
                                </button>
                                <button type="button" disabled={!sel.count} onClick={() => setConfirm("remove")}
                                    className="flex min-h-10 items-center gap-1.5 rounded-xl border px-4 text-[13px] font-bold text-red-700 disabled:opacity-50" style={{ borderColor: "#fecaca" }}>
                                    <Trash2 className="h-4 w-4" />Remove{sel.count ? ` ${sel.count}` : ""}
                                </button>
                                <button type="button" disabled={!readyIds.length} onClick={() => setConfirm("submit")}
                                    className="flex min-h-10 items-center gap-1.5 rounded-xl px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                                    <Send className="h-4 w-4" />Submit{readyIds.length ? ` ${readyIds.length}` : ""}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {stage === "run" && (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin" style={{ color: C.primary }} />
                        <div>
                            <p className="text-[15px] font-extrabold" style={{ color: C.ink }}>Submitting {prog.done} of {prog.total}</p>
                            <p className="mt-1 text-[12px] font-medium" style={{ color: C.muted }}>{live ? "Each product goes live as soon as it is saved." : "Products are saved for this GSTIN."}</p>
                        </div>
                        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%`, background: C.primary }} />
                        </div>
                        <button type="button" onClick={() => { stop.current = true; }} className="min-h-10 rounded-xl border px-5 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Stop after current products</button>
                    </div>
                )}

                {stage === "result" && result && (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" data-lenis-prevent>
                            {result.success === false && !result.total ? (
                                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{result.message || "Could not submit."}</p>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2.5">
                                        <CheckCircle2 className="h-6 w-6" style={{ color: "#047857" }} />
                                        <h4 className="text-[16px] font-extrabold" style={{ color: C.ink }}>
                                            {plural(result.submitted, "product", "products")} {live ? "now live" : "saved for this GSTIN"}
                                        </h4>
                                    </div>
                                    {result.expired && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">The seller session expired, so submitting stopped. Load the seller again and continue.</p>}
                                    {result.stopped && !result.expired && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">Stopped early. The remaining products were not touched and are still in your list.</p>}
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        {[["Submitted", result.submitted, "#15803d", "#dcfce7"], ["Already listed", result.already, "#475569", "#f1f5f9"],
                                        ["Packing updated", result.review, "#a16207", "#fef3c7"], ["Failed", result.failed?.length || 0, "#b91c1c", "#fee2e2"]].map(([l, n, fg, bg]) => (
                                            <div key={l} className="rounded-xl px-3 py-2.5" style={{ background: bg }}>
                                                <p className="text-[20px] font-extrabold tabular-nums" style={{ color: fg }}>{n}</p>
                                                <p className="text-[11.5px] font-bold" style={{ color: fg }}>{l}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {result.review > 0 && (
                                        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{plural(result.review, "product was", "products were")} already on the marketplace, so its packing and GST were applied and it was not submitted. Check minimum order, stock and price, then submit {result.review === 1 ? "it" : "them"} again.
                                        </p>
                                    )}
                                    {result.failed?.length > 0 && (
                                        <div className="mt-4">
                                            <p className="text-[12px] font-bold" style={{ color: C.muted }}>These could not be submitted and are still in your list</p>
                                            <ul className="mt-1.5 space-y-1">
                                                {result.failed.slice(0, 30).map((f, k) => (
                                                    <li key={k} className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: C.hair }}>
                                                        <b style={{ color: C.ink }}>{f.name || "Product"}</b><span className="block font-medium text-red-700">{f.msg}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            {result.failed.length > 30 && <p className="mt-1 text-[11.5px] font-medium" style={{ color: C.muted }}>…and {result.failed.length - 30} more.</p>}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                            <button type="button" onClick={() => setStage("pick")} className="min-h-10 rounded-xl border px-4 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Back to list</button>
                            <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-5 text-[13px] font-bold text-white" style={{ background: C.primary }}>Done</button>
                        </div>
                    </>
                )}
            </div>

            {photoOpen && sel.count > 0 && (
                <BulkPhotoModal count={sel.count} noun="product" uploadToken={uploadToken} onApply={(images, mode, p) => onApplyPhotos(selIds, images, mode, p)} onClose={() => setPhotoOpen(false)} say={say} />
            )}

            {confirm === "remove" && (
                <BulkConfirmModal danger title={`Remove ${plural(sel.count, "product", "products")} from this upload?`} confirmLabel={`Remove ${sel.count}`} busy={busy} onConfirm={doRemove} onClose={() => setConfirm(null)}>
                    <p>They are deleted from your unfinished products. This cannot be undone.</p>
                    <p>Nothing is added to the marketplace.</p>
                </BulkConfirmModal>
            )}
            {confirm === "submit" && (
                <BulkConfirmModal title={`Submit ${plural(readyIds.length, "product", "products")}?`} confirmLabel={`Submit ${readyIds.length}`} onConfirm={doSubmit} onClose={() => setConfirm(null)}>
                    <p>{live ? "Each product goes live as soon as it is saved." : "Each product is saved for this GSTIN and goes live once the business finishes seller setup."}</p>
                    {fixCount > 0 && <p><b>{plural(fixCount, "selected product still needs", "selected products still need")} fixing</b> and will be skipped.</p>}
                </BulkConfirmModal>
            )}
        </div>,
        document.body
    );
}