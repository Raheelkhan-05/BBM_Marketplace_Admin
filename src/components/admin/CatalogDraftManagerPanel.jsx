// components/admin/CatalogDraftManagerPanel.jsx
// Pick many unfinished catalog products, then add photos, generate AI images (only for products with no photo),
// remove them, or submit the ready ones in one go.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ImagePlus, Trash2, Send, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { C } from "../catalog/tokens";
import { Checkbox, SelectAllRow, useSelection, useModalLock } from "./bulkSelect.jsx";
import BulkPhotoModal from "./BulkPhotoModal.jsx";
import BulkConfirmModal from "./BulkConfirmModal.jsx";
import { MAX_PHOTOS } from "../../utils/catalogBulkSchema.js";
import { isActiveJob } from "../../utils/useCatalogImageJobs.js";

const EMPTY = new Map();
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const hasPhoto = (i) => !!i.data?.im?.length;
const hasName = (i) => String(i.data?.n || "").trim().length >= 2 && !!String(i.data?.b || "").trim();

// ai = { jobs: Map(draftId -> job), onGenerate(ids, { useReference }) -> Promise<{ success }> }
export default function CatalogDraftManagerPanel({ items, getIssues, uploadFn, onApplyPhotos, onRemove, onSubmit, onClose, say, ai }) {
    useModalLock();
    const [stage, setStage] = useState("pick"); // pick | run | result
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const [photoOpen, setPhotoOpen] = useState(false);
    const [confirm, setConfirm] = useState(null); // "remove" | "submit" | "ai"
    const [busy, setBusy] = useState(false);
    const [prog, setProg] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState(null);
    const stop = useRef(false);
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);

    const jobs = ai?.jobs || EMPTY;
    const pending = useMemo(() => items.filter((i) => i.status === "pending"), [items]);
    const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
    // only computed while picking, so a running submit (which changes `items` often) stays cheap
    const issues = useMemo(() => (stage === "pick" ? getIssues(items) : EMPTY), [stage, items, getIssues]);
    const bad = (i) => !!issues.get(i.id)?.length;

    const counts = useMemo(() => {
        let fix = 0, nophoto = 0, gen = 0;
        for (const i of pending) {
            if (issues.get(i.id)?.length) fix += 1;
            if (!hasPhoto(i)) nophoto += 1;
            if (isActiveJob(jobs.get(i.id))) gen += 1;
        }
        return { all: pending.length, ready: pending.length - fix, fix, nophoto, gen };
    }, [pending, issues, jobs]);

    const list = useMemo(() => {
        const t = q.trim().toLowerCase();
        return pending.filter((i) => {
            const b = !!issues.get(i.id)?.length;
            if (filter === "ready" && b) return false;
            if (filter === "fix" && !b) return false;
            if (filter === "nophoto" && hasPhoto(i)) return false;
            if (filter === "ai" && !isActiveJob(jobs.get(i.id))) return false;
            const d = i.data || {};
            return !t || `${d.n || ""} ${d.b || ""} ${d.model || ""}`.toLowerCase().includes(t);
        });
    }, [pending, issues, q, filter, jobs]);
    const ids = useMemo(() => list.map((i) => i.id), [list]);
    const sel = useSelection(ids);

    const selIds = [...sel.selected];
    const readyIds = selIds.filter((id) => !issues.get(id)?.length);
    const fixCount = selIds.length - readyIds.length;
    const genSelected = selIds.filter((id) => isActiveJob(jobs.get(id))).length;

    // AI is only for products that have no photo yet, a name and a brand, and are not already generating
    const aiPool = selIds.map((id) => byId.get(id)).filter((it) => it && it.status === "pending" && !hasPhoto(it) && hasName(it) && !isActiveJob(jobs.get(it.id)));
    const aiSkipped = selIds.length - aiPool.length;

    const doGenerate = async () => {
        setBusy(true);
        const r = await ai.onGenerate(aiPool.map((it) => it.id), { useReference: false });
        if (!alive.current) return;
        setBusy(false); setConfirm(null);
        if (r?.success) sel.clear();
    };

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

    const chips = [["all", "All", counts.all], ["ready", "Ready to submit", counts.ready], ["fix", "Needs fixing", counts.fix], ["nophoto", "No photos", counts.nophoto], ["ai", "Generating", counts.gen]];
    const running = stage === "run";

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4" onClick={() => !running && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage unfinished products"
                className="flex h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[90vh] sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>Manage unfinished products</h3>
                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>
                            {stage === "pick" ? "Tick products to add photos, generate images with AI, remove them, or submit the ready ones. Hold Shift to select a range." : stage === "run" ? "Submitting. Please keep this window open." : "Submit finished."}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={running} aria-label="Close" className="shrink-0 rounded-full p-1.5 disabled:opacity-40" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                {stage === "pick" && (
                    <>
                        <div className="shrink-0 space-y-2 border-b px-5 py-3" style={{ borderColor: C.hairSoft }}>
                            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: C.hair }}>
                                <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product, brand or model, e.g. SKF 6205" aria-label="Search products" className="w-full text-[13px] font-medium outline-none" />
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
                                    {counts.nophoto > 0 && (
                                        <button type="button" onClick={() => sel.setMany(list.filter((i) => !hasPhoto(i)).map((i) => i.id))} className="text-[12px] font-bold underline underline-offset-2" style={{ color: C.primary }}>
                                            Select all without photos
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
                                const d = i.data || {};
                                const n = d.im?.length || 0;
                                const job = jobs.get(i.id);
                                return (
                                    <div key={i.id} role="presentation" onClick={(e) => sel.toggle(i.id, e)}
                                        className="flex cursor-pointer select-none items-center gap-3 border-b px-5 py-2.5" style={{ borderColor: C.hairSoft, background: on ? `${C.primary}0d` : "#fff" }}>
                                        <Checkbox checked={on} onChange={(e) => sel.toggle(i.id, e)} accent={C.primary} label={`Select ${d.n || "product"}`} />
                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-slate-50" style={{ borderColor: C.hair }}>
                                            {d.im?.[0] && <img src={d.im[0]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-extrabold" style={{ color: C.ink }}>{d.n?.trim() || `Product ${i.row_no ?? ""}`}</p>
                                            <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>
                                                {d.b?.trim() || "No brand yet"}{d.gst !== undefined && d.gst !== "" ? ` · GST ${d.gst}%` : ""}{i.row_no ? ` · Row ${i.row_no}` : ""} · {n ? `${n} photo${n === 1 ? "" : "s"}` : "No photos"}
                                            </p>
                                            {isActiveJob(job) && (
                                                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] font-bold" style={{ color: C.primary }}>
                                                    <Loader2 className="h-3 w-3 animate-spin" />{job.status === "running" ? "Creating image…" : job.attempts > 0 ? "Trying again…" : "Waiting to create image"}
                                                </p>
                                            )}
                                            {job?.status === "failed" && (
                                                <p className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold text-red-700">Image failed: {job.error || "please try again"}</p>
                                            )}
                                            {!isActiveJob(job) && probs.length > 0 && (
                                                <p className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold" style={{ color: "#a16207" }}>{probs[0]}{probs.length > 1 ? ` (+${probs.length - 1} more)` : ""}</p>
                                            )}
                                        </div>
                                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: probs.length ? "#fef3c7" : "#dcfce7", color: probs.length ? "#a16207" : "#15803d" }}>
                                            {probs.length ? plural(probs.length, "issue", "issues") : "Ready"}
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
                                <button type="button" disabled={!aiPool.length} onClick={() => setConfirm("ai")}
                                    title={sel.count && !aiPool.length ? "AI images are only made for selected products that have no photo yet, have a name and brand, and are not already generating." : undefined}
                                    className="flex min-h-10 items-center gap-1.5 rounded-xl border px-4 text-[13px] font-bold disabled:opacity-50" style={{ borderColor: C.primary, color: C.primary }}>
                                    <Sparkles className="h-4 w-4" />Generate images{aiPool.length ? ` ${aiPool.length}` : ""}
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
                            <p className="mt-1 text-[12px] font-medium" style={{ color: C.muted }}>Products are added to the catalog as soon as they are saved.</p>
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
                                        <h4 className="text-[16px] font-extrabold" style={{ color: C.ink }}>{plural(result.submitted, "product", "products")} added to the catalog</h4>
                                    </div>
                                    {result.expired && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">Your login expired, so submitting stopped. Sign in again and continue.</p>}
                                    {result.stopped && !result.expired && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">Stopped early. The remaining products were not touched and are still in your list.</p>}
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        {[["Added", result.submitted, "#15803d", "#dcfce7"], ["Already in catalog", result.already, "#475569", "#f1f5f9"],
                                        ["Needs fixing", result.invalid, "#a16207", "#fef3c7"], ["Failed", result.failed?.length || 0, "#b91c1c", "#fee2e2"]].map(([l, n, fg, bg]) => (
                                            <div key={l} className="rounded-xl px-3 py-2.5" style={{ background: bg }}>
                                                <p className="text-[20px] font-extrabold tabular-nums" style={{ color: fg }}>{n}</p>
                                                <p className="text-[11.5px] font-bold" style={{ color: fg }}>{l}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {result.submitted > 0 && (
                                        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold" style={{ color: C.muted }}>
                                            Added products are live. They appear under “Needs mapping” until you map them to a generic product.
                                        </p>
                                    )}
                                    {result.warnings?.length > 0 && (
                                        <ul className="mt-3 space-y-1">{result.warnings.map((w) => <li key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">{w}</li>)}</ul>
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
                <BulkPhotoModal count={sel.count} noun="product" uploadFn={uploadFn} max={MAX_PHOTOS}
                    onApply={(images, mode, p) => onApplyPhotos(selIds, images, mode, p)} onClose={() => setPhotoOpen(false)} say={say} />
            )}

            {confirm === "ai" && ai && (
                <BulkConfirmModal title={`Generate images for ${plural(aiPool.length, "product", "products")}?`} confirmLabel={`Generate ${aiPool.length}`} busy={busy} onConfirm={doGenerate} onClose={() => setConfirm(null)}>
                    <p>AI draws each product on a white background in the standard 3:4 shape. Several are made at the same time. They keep running on our server, so you can close this window or even leave the page.</p>
                    {aiSkipped > 0 && <p>{plural(aiSkipped, "selected product is", "selected products are")} skipped because {aiSkipped === 1 ? "it already has" : "they already have"} a photo, {aiSkipped === 1 ? "is" : "are"} missing a name or brand, or {aiSkipped === 1 ? "is" : "are"} already being made.</p>}
                    <p><b>Please check each result.</b> A drawing made from the name alone can get label details wrong.</p>
                </BulkConfirmModal>
            )}
            {confirm === "remove" && (
                <BulkConfirmModal danger title={`Remove ${plural(sel.count, "product", "products")} from this upload?`} confirmLabel={`Remove ${sel.count}`} busy={busy} onConfirm={doRemove} onClose={() => setConfirm(null)}>
                    <p>They are deleted from your unfinished products. This cannot be undone.</p>
                    <p>Nothing is added to the catalog.</p>
                </BulkConfirmModal>
            )}
            {confirm === "submit" && (
                <BulkConfirmModal title={`Submit ${plural(readyIds.length, "product", "products")}?`} confirmLabel={`Submit ${readyIds.length}`} onConfirm={doSubmit} onClose={() => setConfirm(null)}>
                    <p>Each product is added to the catalog right away and stays under “Needs mapping” until you map it to a generic product.</p>
                    {fixCount > 0 && <p><b>{plural(fixCount, "selected product still needs", "selected products still need")} fixing</b> and will be skipped.</p>}
                    {genSelected > 0 && <p><b>{plural(genSelected, "selected product is", "selected products are")} still creating an image.</b> Those without a photo yet are skipped. Wait for the image first.</p>}
                </BulkConfirmModal>
            )}
        </div>,
        document.body
    );
}