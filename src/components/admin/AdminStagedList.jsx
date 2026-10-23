// Products waiting for a business to finish seller setup (or failed to publish).
// Admin extras: select many waiting products to give them the same photos, or remove them, in one step.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, RefreshCw, ImagePlus, Search, X } from "lucide-react";
import { C } from "../catalog/tokens";
import { Chip } from "../orders/disputeUi.jsx";
import BulkPhotoModal from "./BulkPhotoModal.jsx";
import BulkConfirmModal from "./BulkConfirmModal.jsx";
import { Checkbox, SelectAllRow, SelectionBar, BarButton, useSelection } from "./bulkSelect.jsx";
import { fetchStaged, deleteStaged, publishStagedNow, bulkImages, bulkDelete } from "../../utils/api.adminListings.js";

const TONE = { staged: ["info", "Waiting"], publishing: ["info", "Publishing…"], published: ["success", "Live"], failed: ["warn", "Failed"], skipped: ["neutral", "Already listed"] };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "—");
const editable = (it) => it.status === "staged" || it.status === "failed";
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default function AdminStagedList({ token, gstin, live, say, onChanged }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState("");
    const [photoOpen, setPhotoOpen] = useState(false);
    const [delOpen, setDelOpen] = useState(false);
    const [delBusy, setDelBusy] = useState(false);

    const load = useCallback(async () => {
        const r = await fetchStaged(token, gstin);
        if (r?.success) { setItems(r.items); setError(null); } else setError(r?.message || "Could not load the list.");
    }, [token, gstin]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { // follow a publish that is still running
        if (!items?.some((i) => i.status === "publishing")) return undefined;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [items, load]);

    // only products that can still change are selectable
    const shown = useMemo(() => {
        const t = query.trim().toLowerCase();
        return (items || []).filter((i) => !t || `${i.product_name || ""} ${i.brand_name || ""}`.toLowerCase().includes(t));
    }, [items, query]);
    const selectableIds = useMemo(() => shown.filter(editable).map((i) => i.id), [shown]);
    const sel = useSelection(selectableIds);

    const retry = async () => {
        setBusy(true);
        const r = await publishStagedNow(token, gstin);
        setBusy(false);
        if (!r?.success) return say(r?.message || "Could not publish.");
        say(`${r.published} published${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} already listed` : ""}.`);
        await load(); onChanged?.();
    };
    const remove = async (it) => {
        if (!window.confirm(`Remove "${it.product_name}" from the waiting list?`)) return;
        const r = await deleteStaged(token, it.id);
        if (!r?.success) return say(r?.message || "Could not remove it.");
        setItems((l) => l.filter((x) => x.id !== it.id)); onChanged?.();
    };

    const applyPhotos = async (images, mode, onProgress) => {
        const r = await bulkImages("staged", token, gstin, [...sel.selected], images, mode, onProgress);
        if (r.items.length) {
            const m = new Map(r.items.map((x) => [x.id, x.images]));
            setItems((l) => l.map((it) => (m.has(it.id) ? { ...it, image: m.get(it.id)[0] || null } : it)));
        }
        if (r.success) {
            say(`Photos ${mode === "replace" ? "replaced" : "added"} on ${plural(r.updated, "product", "products")}${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
            sel.clear();
        }
        return r;
    };

    const deleteSelected = async () => {
        setDelBusy(true);
        const r = await bulkDelete("staged", token, gstin, [...sel.selected]);
        setDelBusy(false);
        if (r.ids.length) {
            const gone = new Set(r.ids);
            setItems((l) => l.filter((it) => !gone.has(it.id)));
            onChanged?.();
        }
        if (r.success) {
            say(`Removed ${plural(r.deleted, "product", "products")} from the waiting list${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
            sel.clear();
        } else say(r.message);
        setDelOpen(false);
    };

    if (error) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>;
    if (!items) return <div className="mt-3 h-40 animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />;
    const retryable = live && items.some((i) => ["staged", "failed"].includes(i.status));

    return (
        <section className="mt-3">
            <div className="flex flex-col gap-2 rounded-2xl border bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: C.hair }}>
                <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    {live ? "This seller is live. Anything still waiting or failed can be published now." : "These products go live automatically the moment this business finishes seller setup."}
                </p>
                {retryable && (
                    <button onClick={retry} disabled={busy} className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Publish now
                    </button>
                )}
            </div>

            {items.length > 1 && (
                <label className="mt-3 flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: C.hair }}>
                    <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or brand" aria-label="Search waiting products" className="w-full text-[13px] font-medium outline-none" />
                    {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X className="h-4 w-4" style={{ color: C.muted }} /></button>}
                </label>
            )}

            {selectableIds.length > 0 && (
                <div className="mt-2 rounded-xl border bg-white px-2.5 py-1.5" style={{ borderColor: C.hair }}>
                    <SelectAllRow accent={C.primary} checked={sel.isAll} indeterminate={sel.count > 0 && !sel.isAll} count={sel.count} total={selectableIds.length}
                        noun="products" onChange={() => (sel.isAll ? sel.clear() : sel.selectAll())}>
                        <span className="text-[11.5px] font-medium" style={{ color: C.muted }}>Hold Shift to select a range.</span>
                    </SelectAllRow>
                </div>
            )}

            <div className="mt-3 grid gap-2">
                {!items.length && <div className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>Nothing is waiting for this GSTIN.</div>}
                {items.length > 0 && !shown.length && <div className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>No products match.</div>}
                {shown.map((it) => {
                    const [tone, label] = TONE[it.status] || ["neutral", it.status];
                    const on = sel.selected.has(it.id);
                    return (
                        <article key={it.id} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3" style={{ borderColor: on ? C.primary : C.hair, background: on ? `${C.primary}0a` : "#fff" }}>
                            {editable(it)
                                ? <Checkbox checked={on} onChange={(e) => sel.toggle(it.id, e)} accent={C.primary} label={`Select ${it.product_name}`} />
                                : <span className="w-5 shrink-0" aria-hidden="true" />}
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-slate-50" style={{ borderColor: C.hair }}>{it.image && <img src={it.image} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-extrabold" style={{ color: C.ink }}>{it.product_name}</p>
                                <p className="truncate text-[11.5px]" style={{ color: C.muted }}>{it.brand_name || "No brand"} · added {fmt(it.created_at)}</p>
                                {it.error && <p className="mt-1 text-[11.5px] font-semibold text-red-700">{it.error}</p>}
                            </div>
                            <Chip tone={tone}>{label}</Chip>
                            {it.status !== "publishing" && it.status !== "published" && (
                                <button onClick={() => remove(it)} aria-label={`Remove ${it.product_name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-red-700" style={{ borderColor: C.hair }}><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                        </article>
                    );
                })}
            </div>

            <SelectionBar count={sel.count} total={selectableIds.length} noun="products" onSelectAll={sel.selectAll} onClear={sel.clear}>
                <BarButton icon={ImagePlus} onClick={() => setPhotoOpen(true)}>Add photos</BarButton>
                <BarButton icon={Trash2} danger onClick={() => setDelOpen(true)}>Remove</BarButton>
            </SelectionBar>

            {photoOpen && sel.count > 0 && (
                <BulkPhotoModal count={sel.count} noun="product" uploadToken={token} onApply={applyPhotos} onClose={() => setPhotoOpen(false)} say={say} />
            )}

            {delOpen && sel.count > 0 && (
                <BulkConfirmModal danger title={`Remove ${plural(sel.count, "product", "products")} from the waiting list?`} confirmLabel={`Remove ${sel.count}`}
                    busy={delBusy} onConfirm={deleteSelected} onClose={() => setDelOpen(false)}>
                    <p>{sel.count === 1 ? "It" : "They"} will not go live for this business. This cannot be undone.</p>
                </BulkConfirmModal>
            )}
        </section>
    );
}