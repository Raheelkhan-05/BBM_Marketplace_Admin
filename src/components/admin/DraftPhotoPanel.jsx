// components/admin/DraftPhotoPanel.jsx
// Pick many unfinished bulk-upload products, then add the same photos to all of them.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ImagePlus } from "lucide-react";
import { C } from "../catalog/tokens";
import { Checkbox, SelectAllRow, useSelection, useModalLock } from "./bulkSelect.jsx";
import BulkPhotoModal from "./BulkPhotoModal.jsx";

export default function DraftPhotoPanel({ items, uploadToken, onApply, onClose, say }) {
    useModalLock();
    const noneCount = useMemo(() => items.filter((i) => !i.data?.im?.length).length, [items]);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState(noneCount ? "none" : "all");
    const [next, setNext] = useState(false);

    const list = useMemo(() => {
        const t = q.trim().toLowerCase();
        return items.filter((i) => {
            const has = !!i.data?.im?.length;
            if (filter === "none" && has) return false;
            if (filter === "has" && !has) return false;
            if (!t) return true;
            return `${i.data?.n || ""} ${i.data?.b || ""}`.toLowerCase().includes(t);
        });
    }, [items, q, filter]);
    const ids = useMemo(() => list.map((i) => i.id), [list]);
    const sel = useSelection(ids);

    const apply = async (images, mode, prog) => {
        const r = await onApply([...sel.selected], images, mode, prog);
        if (r?.success) onClose();
        return r;
    };

    const chips = [["all", "All", items.length], ["none", "No photos", noneCount], ["has", "Has photos", items.length - noneCount]];

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add photos to many products"
                className="flex h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[88vh] sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[16px] font-extrabold" style={{ color: C.ink }}>Add photos to many products</h3>
                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>Tick the products that share the same photos. Tip: hold Shift to select a range.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1.5" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

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
                            noun="shown" onChange={() => (sel.isAll ? sel.clear() : sel.selectAll())} />
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                    {!list.length && <p className="px-5 py-14 text-center text-[13px] font-semibold" style={{ color: C.muted }}>{items.length ? "No products match." : "No unfinished products."}</p>}
                    {list.map((i) => {
                        const on = sel.selected.has(i.id);
                        const n = i.data?.im?.length || 0;
                        return (
                            <div key={i.id} role="presentation" onClick={(e) => sel.toggle(i.id, e)}
                                className="flex cursor-pointer items-center gap-3 border-b px-5 py-2.5 select-none" style={{ borderColor: C.hairSoft, background: on ? `${C.primary}0d` : "#fff" }}>
                                <Checkbox checked={on} onChange={(e) => sel.toggle(i.id, e)} accent={C.primary} label={`Select ${i.data?.n || "product"}`} />
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-slate-50" style={{ borderColor: C.hair }}>
                                    {i.data?.im?.[0] && <img src={i.data.im[0]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-extrabold" style={{ color: C.ink }}>{i.data?.n?.trim() || `Product ${i.row_no ?? ""}`}</p>
                                    <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>{i.data?.nb ? "No brand" : i.data?.b || "No brand yet"}{i.row_no ? ` · Row ${i.row_no}` : ""}</p>
                                </div>
                                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: n ? "#dcfce7" : "#fef3c7", color: n ? "#15803d" : "#a16207" }}>
                                    {n ? `${n} photo${n === 1 ? "" : "s"}` : "No photos"}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-4 text-[13px] font-bold" style={{ color: C.muted }}>Cancel</button>
                    <button type="button" disabled={!sel.count} onClick={() => setNext(true)}
                        className="flex min-h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.primary }}>
                        <ImagePlus className="h-4 w-4" />Choose photos{sel.count ? ` for ${sel.count}` : ""}
                    </button>
                </div>
            </div>

            {next && <BulkPhotoModal count={sel.count} noun="product" uploadToken={uploadToken} onApply={apply} onClose={() => setNext(false)} say={say} />}
        </div>,
        document.body
    );
}