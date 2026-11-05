// pages/admin/AdminImageStudioPage.jsx — bulk white-background product images.
// 1) pick products  2) AI cut-out runs in a worker, finishing runs on the server  3) review  4) apply atomically (undo available)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, Search, Check, RotateCcw, Undo2, X, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import { Chip } from "../../components/orders/disputeUi.jsx";
import { resizedImageUrl } from "../../utils/imageUrl";
import {
    fetchStudioProducts, planStudioBatch, uploadCutout, failStudioAsset, retryStudioItem,
    applyStudioItems, revertStudioItem, discardStudioBatch, proxyUrlFor,
} from "../../utils/api.imageStudio.js";

const GREEN = "#22A06B";
const MAX_SELECT = 100;
const FILTERS = [{ k: "todo", t: "Not white yet" }, { k: "done", t: "Already white" }, { k: "all", t: "All" }];
const SIZES = [800, 1000, 1200, 1600];
const thumb = (u, w = 240) => (u ? resizedImageUrl(u, { width: w }) : "");

function Switch({ on, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: on ? GREEN : "#D9DEE2" }}>
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(16px)" : "none" }} />
        </button>
    );
}

function Thumb({ src, label, tone }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: C.hair, background: tone === "after" ? "#fff" : C.hairSoft }}>
                {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} />}
            </div>
            <span className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{label}</span>
        </div>
    );
}

const STEP_LABEL = { pending: "Waiting", cutting: "Removing background…", uploading: "Finishing…", done: "Done", failed: "Failed" };

function ProductCard({ p, selected, onToggle, disabled }) {
    return (
        <button type="button" onClick={onToggle} disabled={disabled && !selected} aria-pressed={selected}
            className="relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-50"
            style={{ borderColor: selected ? C.primary : C.hair, boxShadow: selected ? `0 0 0 2px ${C.primary}33` : "none" }}>
            <div className="relative aspect-square w-full" style={{ background: C.hairSoft }}>
                <img src={thumb(p.image, 360)} alt="" loading="lazy" className="h-full w-full object-contain" />
                <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border bg-white"
                    style={{ borderColor: selected ? C.primary : C.hair, background: selected ? C.primary : "#fff" }}>
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                {p.done && <span className="absolute right-2 top-2"><Chip tone="success">White ✓</Chip></span>}
            </div>
            <div className="min-w-0 px-2.5 py-2">
                <p className="line-clamp-2 break-words text-[12.5px] font-extrabold leading-snug" style={{ color: C.ink }}>{p.name}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: C.muted }}>{p.brand || "No brand"} · {Math.max(1, p.imageCount)} image{p.imageCount > 1 ? "s" : ""}</p>
            </div>
        </button>
    );
}

export default function AdminImageStudioPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const tokenRef = useRef(token);
    useEffect(() => { tokenRef.current = token; }, [token]);

    // ---- product picker
    const [q, setQ] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const [filter, setFilter] = useState("todo");
    const [page, setPage] = useState(1);
    const [list, setList] = useState(null);
    const [listLoading, setListLoading] = useState(false);
    const [selected, setSelected] = useState(() => new Map());      // id -> product

    // ---- output style
    const [padding, setPadding] = useState(8);                       // percent
    const [size, setSize] = useState(1200);
    const [enhance, setEnhance] = useState(true);

    // ---- batch / review
    const [batchId, setBatchId] = useState(null);
    const [items, setItems] = useState([]);
    const [excluded, setExcluded] = useState(() => new Set());
    const [planning, setPlanning] = useState(false);
    const [running, setRunning] = useState(false);
    const [applying, setApplying] = useState(false);
    const [allOrNothing, setAllOrNothing] = useState(false);
    const [model, setModel] = useState({ status: "idle", pct: 0, device: "" });
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [lightbox, setLightbox] = useState(null);

    // ---- worker plumbing
    const workerRef = useRef(null);
    const waiters = useRef(new Map());
    const seq = useRef(0);
    const cancelRef = useRef(false);
    const activeRuns = useRef(0);

    const getWorker = useCallback(() => {
        if (workerRef.current) return workerRef.current;
        const w = new Worker(new URL("../../workers/bgRemoval.worker.js", import.meta.url), { type: "module" });
        w.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === "model") setModel((s) => ({ ...s, status: m.status, pct: m.pct ?? s.pct, device: m.device || s.device }));
            else if (m.type === "done") { waiters.current.get(m.id)?.resolve(m.blob); waiters.current.delete(m.id); }
            else if (m.type === "error") { waiters.current.get(m.id)?.reject(new Error(m.message)); waiters.current.delete(m.id); }
        };
        w.onerror = () => {
            setModel((s) => ({ ...s, status: "error" }));
            waiters.current.forEach((x) => x.reject(new Error("The AI worker crashed.")));
            waiters.current.clear();
            workerRef.current = null;
        };
        workerRef.current = w;
        return w;
    }, []);
    useEffect(() => () => workerRef.current?.terminate(), []);

    const removeBackground = useCallback((url) => new Promise((resolve, reject) => {
        const id = ++seq.current;
        waiters.current.set(id, { resolve, reject });
        getWorker().postMessage({ type: "run", id, url, proxyUrl: proxyUrlFor(url), token: tokenRef.current });
    }), [getWorker]);

    // ---- list loading
    useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
    useEffect(() => {
        if (batchId) return undefined;
        let live = true;
        setListLoading(true);
        fetchStudioProducts(token, { q: debouncedQ, filter, page, pageSize: 24 }).then((res) => {
            if (!live) return;
            setListLoading(false);
            if (res.success) { setList(res); setError(null); } else setError(res.message || "Couldn't load products.");
        });
        return () => { live = false; };
    }, [token, debouncedQ, filter, page, batchId]);

    const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
    const atLimit = selected.size >= MAX_SELECT;

    const toggle = (p) => setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(p.id)) next.delete(p.id); else if (next.size < MAX_SELECT) next.set(p.id, p);
        return next;
    });
    const selectPage = () => setSelected((prev) => {
        const next = new Map(prev);
        for (const p of list?.items || []) if (next.size < MAX_SELECT) next.set(p.id, p);
        return next;
    });
    const selectAllMatching = async () => {
        const res = await fetchStudioProducts(token, { q: debouncedQ, filter, page: 1, pageSize: MAX_SELECT });
        if (!res.success) return setError(res.message || "Couldn't select.");
        setSelected((prev) => { const next = new Map(prev); for (const p of res.items) if (next.size < MAX_SELECT) next.set(p.id, p); return next; });
        if (res.total > MAX_SELECT) setInfo(`Selected the first ${MAX_SELECT} of ${res.total} matching products.`);
    };

    // ---- state helpers
    const patchItem = useCallback((itemId, fn) => setItems((prev) => prev.map((i) => (i.itemId === itemId ? fn(i) : i))), []);
    const patchAsset = useCallback((itemId, assetId, patch) => patchItem(itemId, (i) => ({ ...i, assets: i.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)) })), [patchItem]);

    // ---- the processing queue: AI cut-out (worker) overlaps with uploads (max 2 at once)
    const runQueue = useCallback(async (queue) => {
        if (!queue.length) return;
        activeRuns.current++; setRunning(true); cancelRef.current = false;
        getWorker().postMessage({ type: "init" });
        const inflight = new Set();
        try {
            for (const job of queue) {
                if (cancelRef.current) break;
                patchAsset(job.itemId, job.assetId, { status: "cutting", error: null });
                let blob;
                try {
                    blob = await removeBackground(job.sourceUrl);
                } catch (e) {
                    if (cancelRef.current) break;
                    const r = await failStudioAsset(tokenRef.current, job.assetId, e.message);
                    patchAsset(job.itemId, job.assetId, { status: "failed", error: e.message });
                    patchItem(job.itemId, (i) => ({ ...i, status: r?.itemStatus || "failed" }));
                    continue;
                }
                if (cancelRef.current) break;
                patchAsset(job.itemId, job.assetId, { status: "uploading" });
                const p = uploadCutout(tokenRef.current, job.assetId, blob).then((res) => {
                    if (res.success) {
                        patchAsset(job.itemId, job.assetId, { status: "done", newUrl: res.newUrl });
                        patchItem(job.itemId, (i) => ({ ...i, status: res.itemStatus }));
                    } else {
                        patchAsset(job.itemId, job.assetId, { status: "failed", error: res.message });
                        patchItem(job.itemId, (i) => ({ ...i, status: "failed" }));
                    }
                }).finally(() => inflight.delete(p));
                inflight.add(p);
                if (inflight.size >= 2) await Promise.race(inflight);
            }
            await Promise.all(inflight);
        } finally {
            if (--activeRuns.current === 0) setRunning(false);
        }
    }, [getWorker, patchAsset, patchItem, removeBackground]);

    // ---- actions
    const start = async () => {
        if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") {
            return setError("This browser can't run the image tool. Please use a recent Chrome, Edge or Firefox on a computer.");
        }
        setPlanning(true); setError(null); setInfo(null);
        const res = await planStudioBatch(token, [...selected.keys()], { padding: padding / 100, size, enhance });
        setPlanning(false);
        if (!res.success) return setError(res.message || "Couldn't start.");
        setBatchId(res.batchId);
        setExcluded(new Set());
        const next = res.items.map((it) => ({ ...it, assets: it.assets.map((a) => ({ ...a, status: a.status === "done" ? "done" : "pending" })) }));
        setItems(next);
        runQueue(next.flatMap((it) => it.assets.filter((a) => a.status !== "done").map((a) => ({ assetId: a.id, itemId: it.itemId, sourceUrl: a.sourceUrl }))));
    };

    const retry = async (item) => {
        const r = await retryStudioItem(token, item.itemId);
        if (!r.success) return setError(r.message || "Couldn't retry.");
        const ids = new Set(r.assets.map((a) => a.id));
        patchItem(item.itemId, (i) => ({ ...i, status: "processing", error: null, assets: i.assets.map((a) => (ids.has(a.id) ? { ...a, status: "pending", error: null } : a)) }));
        runQueue(r.assets.map((a) => ({ assetId: a.id, itemId: item.itemId, sourceUrl: a.sourceUrl })));
    };

    const applicable = useMemo(() => items.filter((i) => i.status === "ready" && !excluded.has(i.itemId)), [items, excluded]);
    const apply = async () => {
        if (!applicable.length) return;
        if (!window.confirm(`Replace the images of ${applicable.length} product${applicable.length === 1 ? "" : "s"} on the marketplace? Each product's hero image, gallery and all seller listings change together. You can undo afterwards.`)) return;
        setApplying(true); setError(null); setInfo(null);
        const res = await applyStudioItems(token, applicable.map((i) => i.itemId), allOrNothing);
        setApplying(false);
        if (!res.success) return setError(res.message || "Couldn't apply.");
        const byId = new Map(res.results.map((r) => [r.item_id, r]));
        setItems((prev) => prev.map((i) => { const r = byId.get(i.itemId); return !r ? i : r.ok ? { ...i, status: "applied", error: null } : { ...i, error: r.error }; }));
        setInfo(`${res.applied} product${res.applied === 1 ? "" : "s"} updated${res.failed ? `, ${res.failed} left unchanged (see the red notes)` : ""}.`);
    };

    const revert = async (item) => {
        if (!window.confirm(`Undo the new images for “${item.name}”? The previous images are restored everywhere.`)) return;
        const res = await revertStudioItem(token, item.itemId);
        if (!res.success) return setError(res.message || "Couldn't undo.");
        patchItem(item.itemId, (i) => ({ ...i, status: "reverted" }));
        setInfo(`Restored the previous images for “${item.name}”.`);
    };

    const reset = () => {
        cancelRef.current = true;
        setBatchId(null); setItems([]); setExcluded(new Set()); setSelected(new Map()); setInfo(null);
    };
    const hasUnapplied = items.some((i) => ["processing", "ready", "failed"].includes(i.status));
    const discard = async () => {
        if (hasUnapplied && !window.confirm("Discard everything that hasn't been applied yet? Nothing on the marketplace changes.")) return;
        cancelRef.current = true;
        await discardStudioBatch(token, batchId);
        reset();
    };

    useEffect(() => {
        if (!(running || items.some((i) => i.status === "ready"))) return undefined;
        const h = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", h);
        return () => window.removeEventListener("beforeunload", h);
    }, [running, items]);

    // ---- progress numbers
    const totalAssets = items.reduce((n, i) => n + i.assets.length, 0);
    const doneAssets = items.reduce((n, i) => n + i.assets.filter((a) => a.status === "done").length, 0);
    const pct = totalAssets ? Math.round((doneAssets / totalAssets) * 100) : 0;
    const readyCount = items.filter((i) => i.status === "ready").length;
    const failedCount = items.filter((i) => i.status === "failed").length;

    const statusChip = (i) => {
        const done = i.assets.filter((a) => a.status === "done").length;
        if (i.status === "applied") return <Chip tone="success">Applied</Chip>;
        if (i.status === "reverted") return <Chip tone="neutral">Undone</Chip>;
        if (i.status === "ready") return <Chip tone="success">Ready</Chip>;
        if (i.status === "failed") return <Chip tone="danger">Needs retry</Chip>;
        return <Chip tone="warn">Processing {done}/{i.assets.length}</Chip>;
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-xl min-w-0 px-3 pb-28 pt-3 sm:px-5 lg:px-8">
            <div className="mt-2 flex items-start gap-3 sm:items-center">
                <button onClick={() => navigate(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: C.hair, color: C.ink }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Image studio</h1>
                    <p className="mt-1 max-w-2xl text-[12px] font-medium leading-relaxed sm:text-[13px]" style={{ color: C.muted }}>
                        Removes the background, places each product on pure white with a clean white margin, and tunes sharpness, colour and brightness. A product’s images change all together, or not at all.
                    </p>
                </div>
            </div>

            {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            {info && <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: C.hairSoft, color: C.ink }}>{info}</p>}

            {!batchId ? (
                <>
                    {/* output style */}
                    <section className="mt-4 rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: C.hair }}>
                        <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>Output style</p>
                        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <label className="block">
                                <span className="flex items-center justify-between text-[12px] font-bold" style={{ color: C.ink }}>White margin <span style={{ color: C.muted }}>{padding}%</span></span>
                                <input type="range" min={3} max={16} value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="mt-2 w-full" />
                            </label>
                            <label className="block">
                                <span className="text-[12px] font-bold" style={{ color: C.ink }}>Image size (square PNG)</span>
                                <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.ink }}>
                                    {SIZES.map((s) => <option key={s} value={s}>{s} × {s}</option>)}
                                </select>
                            </label>
                            <div className="flex items-center gap-3 sm:pt-5">
                                <Switch on={enhance} onChange={setEnhance} label="Enhance" />
                                <div>
                                    <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>Enhance photo</p>
                                    <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Sharpness, colour and lighting</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* picker toolbar */}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-1">
                            {FILTERS.map((f) => (
                                <button key={f.k} onClick={() => { setFilter(f.k); setPage(1); }} className="rounded-full border px-3 py-1.5 text-[12px] font-bold"
                                    style={{ borderColor: filter === f.k ? C.primary : C.hair, background: filter === f.k ? `${C.primary}12` : "#fff", color: filter === f.k ? C.primary : C.muted }}>{f.t}</button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={selectPage} disabled={!list?.items?.length || atLimit} className="rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>Select this page</button>
                            <button onClick={selectAllMatching} disabled={!list?.total || atLimit} className="rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold disabled:opacity-50" style={{ borderColor: C.hair, color: C.secondary }}>Select all matching (max {MAX_SELECT})</button>
                        </div>
                    </div>
                    <div className="relative mt-2">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.muted }} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or brand…" className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-[13px] font-medium outline-none" style={{ borderColor: C.hair }} />
                    </div>

                    <div className={`mt-3 grid grid-cols-2 gap-2.5 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 ${listLoading ? "opacity-60" : ""}`}>
                        {!list ? Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />)
                            : list.items.length === 0
                                ? <p className="col-span-full rounded-2xl border bg-white px-4 py-10 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>{filter === "todo" && !debouncedQ ? "Every product already has a white background. 🎉" : "Nothing matches."}</p>
                                : list.items.map((p) => <ProductCard key={p.id} p={p} selected={selected.has(p.id)} disabled={atLimit} onToggle={() => toggle(p)} />)}
                    </div>

                    {list && list.total > list.pageSize && (
                        <div className="mt-4 flex items-center justify-center gap-3">
                            <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={page <= 1} className="flex h-9 w-9 items-center justify-center rounded-full border bg-white disabled:opacity-40" style={{ borderColor: C.hair }} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                            <span className="text-[12.5px] font-bold" style={{ color: C.muted }}>Page {page} of {totalPages} · {list.total} products</span>
                            <button onClick={() => setPage((n) => Math.min(totalPages, n + 1))} disabled={page >= totalPages} className="flex h-9 w-9 items-center justify-center rounded-full border bg-white disabled:opacity-40" style={{ borderColor: C.hair }} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                    )}

                    {/* sticky action bar */}
                    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 backdrop-blur" style={{ borderColor: C.hair }}>
                        <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5 lg:px-8">
                            <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: C.ink }}>
                                {selected.size} selected{atLimit ? ` (max ${MAX_SELECT})` : ""}
                                {selected.size > 0 && <button onClick={() => setSelected(new Map())} className="text-[12px] font-bold underline" style={{ color: C.muted }}>Clear</button>}
                            </div>
                            <button onClick={start} disabled={!selected.size || planning} className="flex min-h-10 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                                {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Process {selected.size || ""} product{selected.size === 1 ? "" : "s"}
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* progress */}
                    <section className="mt-4 rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: C.hair }}>
                        <div className="flex items-center justify-between text-[12.5px] font-bold" style={{ color: C.muted }}>
                            <span>{running ? "Working…" : "Processing finished"} · {doneAssets}/{totalAssets} images · {readyCount} ready{failedCount ? ` · ${failedCount} need retry` : ""}</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GREEN }} />
                        </div>
                        {model.status === "loading" && (
                            <p className="mt-2 text-[12px] font-semibold" style={{ color: C.muted }}>
                                Loading the AI model{model.pct ? ` (${model.pct}%)` : ""} — about 200 MB the first time, instant afterwards.
                            </p>
                        )}
                        {model.status === "error" && <p className="mt-2 text-[12px] font-semibold text-red-700">The AI model couldn’t load. Check your connection and try again.</p>}
                        {model.status === "ready" && running && <p className="mt-2 text-[12px] font-medium" style={{ color: C.muted }}>Running on your {model.device === "webgpu" ? "graphics card" : "processor"}. You can keep using other tabs.</p>}
                    </section>

                    {/* items */}
                    <div className="mt-3 flex flex-col gap-2">
                        {items.map((i) => {
                            const canPick = i.status === "ready";
                            return (
                                <article key={i.itemId} className="rounded-2xl border bg-white p-3" style={{ borderColor: C.hair }}>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <input type="checkbox" aria-label={`Include ${i.name}`} disabled={!canPick} checked={canPick && !excluded.has(i.itemId)}
                                            onChange={() => setExcluded((s) => { const n = new Set(s); n.has(i.itemId) ? n.delete(i.itemId) : n.add(i.itemId); return n; })} />
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-[13.5px] font-extrabold" style={{ color: C.ink }}>{i.name}</p>
                                            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>{i.brand || "No brand"} · {i.assets.length} image{i.assets.length === 1 ? "" : "s"} · {i.listings} seller listing{i.listings === 1 ? "" : "s"}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {statusChip(i)}
                                            {i.status === "failed" && <button onClick={() => retry(i)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}
                                            {i.status === "applied" && <button onClick={() => revert(i)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}><Undo2 className="h-3.5 w-3.5" /> Undo</button>}
                                        </div>
                                    </div>
                                    {i.error && <p className="mt-1.5 text-[11.5px] font-semibold text-red-700">{i.error}</p>}
                                    <div className="mt-2.5 flex gap-3 overflow-x-auto pb-1">
                                        {i.assets.map((a) => (
                                            <button key={a.id} type="button" disabled={!a.newUrl} onClick={() => a.newUrl && setLightbox({ before: a.sourceUrl, after: a.newUrl })}
                                                className="flex shrink-0 flex-col items-center gap-1 rounded-xl border p-1.5 text-left" style={{ borderColor: a.status === "failed" ? "#fca5a5" : C.hair }}>
                                                <div className="flex items-center gap-1.5">
                                                    <Thumb src={thumb(a.sourceUrl, 160)} label="Before" />
                                                    <Thumb src={a.newUrl} label="After" tone="after" />
                                                </div>
                                                <span className="text-[10.5px] font-bold" style={{ color: a.status === "failed" ? "#b91c1c" : a.status === "done" ? "#157a50" : C.muted }}>
                                                    {a.status === "failed" ? (a.error || "Failed") : STEP_LABEL[a.status]}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    {/* sticky action bar */}
                    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 backdrop-blur" style={{ borderColor: C.hair }}>
                        <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5 lg:px-8">
                            <div className="flex flex-wrap items-center gap-3">
                                <button onClick={discard} className="flex min-h-10 items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: "#b91c1c" }}>
                                    <Trash2 className="h-3.5 w-3.5" /> Discard
                                </button>
                                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold" style={{ color: C.ink }}>
                                    <Switch on={allOrNothing} onChange={setAllOrNothing} label="All or nothing" />
                                    <span>Apply only if every selected product succeeds</span>
                                </label>
                            </div>
                            <div className="flex gap-2">
                                {!hasUnapplied && !running && <button onClick={reset} className="flex min-h-10 items-center gap-1.5 rounded-xl border bg-white px-4 py-2 text-[13px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}>Done</button>}
                                <button onClick={apply} disabled={!applicable.length || applying}
                                    className="flex min-h-10 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply to {applicable.length} product{applicable.length === 1 ? "" : "s"}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {lightbox && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setLightbox(null)}>
                    <div className="relative max-h-full w-full max-w-4xl overflow-auto rounded-2xl bg-white p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border bg-white" style={{ borderColor: C.hair }}><X className="h-4 w-4" /></button>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {[["Before", lightbox.before, C.hairSoft], ["After", lightbox.after, "#fff"]].map(([label, src, bg]) => (
                                <figure key={label}>
                                    <figcaption className="mb-1 text-[12px] font-extrabold" style={{ color: C.ink }}>{label}</figcaption>
                                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border" style={{ borderColor: C.hair, background: bg }}>
                                        <img src={src} alt={label} className="h-full w-full object-contain" />
                                    </div>
                                </figure>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}