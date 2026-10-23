// components/admin/StagedMapModal.jsx
// Choose Category > Subcategory > Generic product for waiting products. Applied when they go live.
import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Layers, AlertTriangle } from "lucide-react";
import { adminListCatalog, adminCreateCatalogEntry } from "../../utils/api.js";
import { bulkMapStaged } from "../../utils/api.adminListings.js";
import HierarchyCombobox from "../seller/listingForm/HierarchyCombobox.jsx";
import { C } from "../seller/listingForm/FormPrimitives.jsx";
import { useModalLock } from "./bulkSelect.jsx";

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default function StagedMapModal({ token, gstin, items, onClose, onDone }) {
    useModalLock();
    const [cat, setCat] = useState(null);
    const [sub, setSub] = useState(null);
    const [gp, setGp] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const already = items.filter((i) => i.map_parent_id).length;

    async function apply() {
        if (!gp || busy) return;
        setBusy(true); setError("");
        const r = await bulkMapStaged(token, gstin, items.map((i) => i.id), gp.id);
        setBusy(false);
        if (!r.success) { setError(r.message); return; }
        onDone({ ids: r.ids, parent: { id: gp.id, name: gp.name }, crumb: [cat?.name, sub?.name, gp?.name].filter(Boolean).join(" › "), skipped: r.skipped });
    }

    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Map waiting products"
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Map {plural(items.length, "waiting product", "waiting products")}</h3>
                        <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>Saved now. Applied automatically when {items.length === 1 ? "it goes" : "they go"} live.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="shrink-0 rounded-full p-1.5 disabled:opacity-40" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    <div className="flex flex-col gap-3">
                        {already > 0 && (
                            <p className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{plural(already, "selected product is", "selected products are")} already mapped. The new choice replaces it.
                            </p>
                        )}
                        <HierarchyCombobox label="Category" required value={cat}
                            fetcher={(q) => adminListCatalog(token, { level: "category", q })}
                            onCreate={(name) => adminCreateCatalogEntry(token, "category", { name })}
                            onSelect={(e) => { setCat(e); setSub(null); setGp(null); }}
                            placeholder="Search or create a category…" />
                        {cat && (
                            <HierarchyCombobox label="Subcategory" required value={sub}
                                fetcher={(q) => adminListCatalog(token, { level: "subcategory", parentId: cat.id, q })}
                                onCreate={(name) => adminCreateCatalogEntry(token, "subcategory", { name, parentId: cat.id })}
                                onSelect={(e) => { setSub(e); setGp(null); }}
                                placeholder="Search or create a subcategory…" />
                        )}
                        {sub && (
                            <HierarchyCombobox label="Generic product" required value={gp}
                                fetcher={(q) => adminListCatalog(token, { level: "generic_product", parentId: sub.id, q })}
                                onCreate={(name) => adminCreateCatalogEntry(token, "generic_product", { name, parentId: sub.id })}
                                onSelect={setGp}
                                placeholder="Search or create a generic product…" />
                        )}
                        {error && <p role="alert" className="text-[11.5px] font-semibold" style={{ color: C.danger }}>{error}</p>}
                    </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3.5 py-2 text-[13px] font-bold disabled:opacity-50" style={{ color: C.muted }}>Cancel</button>
                    <button type="button" onClick={apply} disabled={!gp || busy}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}Save mapping
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}