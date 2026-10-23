// components/admin/BulkMapModal.jsx
// Map many seller listings to one Category > Subcategory > Generic product in a single step.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Layers, AlertTriangle } from "lucide-react";
import { adminListCatalog, adminCreateCatalogEntry, adminApproveSellerSubmission } from "../../utils/api.js";
import { adminBulkMapBrandItems } from "../../utils/api.adminCatalogBulk.js";
import HierarchyCombobox from "../seller/listingForm/HierarchyCombobox.jsx";
import { C } from "../seller/listingForm/FormPrimitives.jsx";
import { useModalLock } from "./bulkSelect.jsx";

const brandIdOf = (it) => it.brand?.id || it.generic_product_brand_id || null;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default function BulkMapModal({ token, items, onClose, onDone }) {
    useModalLock();
    const [cat, setCat] = useState(null);
    const [sub, setSub] = useState(null);
    const [gp, setGp] = useState(null);
    const [approveAfter, setApproveAfter] = useState(false);
    const [busy, setBusy] = useState(false);
    const [prog, setProg] = useState("");
    const [error, setError] = useState("");

    const info = useMemo(() => {
        const ids = new Set();
        let missing = 0, already = 0;
        items.forEach((it) => { const b = brandIdOf(it); if (b) ids.add(b); else missing += 1; if (it.generic_product) already += 1; });
        return {
            brandIds: [...ids], missing, already,
            pending: items.filter((it) => it.review_status === "pending_review" && brandIdOf(it)),
        };
    }, [items]);

    async function apply() {
        if (!gp || busy) return;
        if (!info.brandIds.length) { setError("None of the selected listings has a catalog item to map."); return; }
        setBusy(true); setError(""); setProg("Saving mapping…");
        const res = await adminBulkMapBrandItems(token, info.brandIds, gp.id);
        if (!res?.success) { setBusy(false); setProg(""); setError(res?.message || "Couldn't save the mapping."); return; }

        let approved = 0, failed = 0;
        const reasons = new Set();
        if (approveAfter && info.pending.length) {
            let next = 0, done = 0;
            const worker = async () => {
                while (next < info.pending.length) {
                    const it = info.pending[next++];
                    try {
                        const r = await adminApproveSellerSubmission(token, it.id);
                        if (r?.success) approved += 1; else { failed += 1; reasons.add(r?.message || "Approval failed."); }
                    } catch { failed += 1; reasons.add("Network error."); }
                    done += 1;
                    setProg(`Approving ${done} of ${info.pending.length}…`);
                }
            };
            await Promise.all(Array.from({ length: Math.min(4, info.pending.length) }, worker));
        }
        setBusy(false); setProg("");

        const crumb = [cat?.name, sub?.name, gp?.name].filter(Boolean).join(" › ");
        let message = `Mapped ${plural(res.updated ?? info.brandIds.length, "catalog item", "catalog items")} (${plural(items.length - info.missing, "listing", "listings")}) to ${crumb}.`;
        if (approveAfter) message += ` Approved ${approved}${failed ? `, ${failed} could not be approved (${[...reasons].slice(0, 2).join(" ")})` : ""}.`;
        if (info.missing) message += ` ${plural(info.missing, "listing was", "listings were")} skipped because there is no catalog item.`;
        onDone({ message, failed: failed > 0 });
    }

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Map listings in bulk"
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-extrabold" style={{ color: C.ink }}>Map {plural(items.length, "listing", "listings")} at once</h3>
                        <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: C.muted }}>{plural(info.brandIds.length, "catalog item", "catalog items")} will be placed under the category you pick.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="shrink-0 rounded-full p-1.5 disabled:opacity-40" style={{ color: C.muted }}><X className="h-4 w-4" /></button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    <div className="flex flex-col gap-3">
                        {info.already > 0 && (
                            <p className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fef3c7", color: "#a16207" }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{plural(info.already, "selected listing is", "selected listings are")} already mapped. Their mapping will be replaced.
                            </p>
                        )}
                        {info.missing > 0 && (
                            <p className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#fee2e2", color: C.danger }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{plural(info.missing, "listing has", "listings have")} no catalog item and will be skipped.
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

                        {info.pending.length > 0 && (
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair }}>
                                <input type="checkbox" checked={approveAfter} disabled={busy} onChange={(e) => setApproveAfter(e.target.checked)} className="mt-0.5 h-4 w-4" />
                                <span>
                                    <span className="block text-[12.5px] font-extrabold" style={{ color: C.ink }}>Also approve {plural(info.pending.length, "pending listing", "pending listings")}</span>
                                    <span className="block text-[11px] font-medium" style={{ color: C.muted }}>Approves them right after mapping. Any that can’t be approved are reported.</span>
                                </span>
                            </label>
                        )}
                        {error && <p role="alert" className="text-[11.5px] font-semibold" style={{ color: C.danger }}>{error}</p>}
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                    {busy && prog && <span className="mr-auto text-[12px] font-semibold" style={{ color: C.muted }}>{prog}</span>}
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3.5 py-2 text-[13px] font-bold disabled:opacity-50" style={{ color: C.muted }}>Cancel</button>
                    <button type="button" onClick={apply} disabled={!gp || busy}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                        {approveAfter && info.pending.length ? "Map & approve" : "Apply mapping"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}