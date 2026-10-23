// Manage every listing of one seller (via the admin "act as seller" token). Same data and actions as GROW "My products".
// Admin extras: select many listings and give them the same photos in one step.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCw, Pencil, Trash2, Repeat, X, ImagePlus } from "lucide-react";
import { C } from "../catalog/tokens";
import { Chip } from "../orders/disputeUi.jsx";
import GrowEditListing from "../grow/GrowEditListing.jsx";
import BulkPhotoModal from "./BulkPhotoModal.jsx";
import { Checkbox, SelectAllRow, SelectionBar, BarButton, useSelection } from "./bulkSelect.jsx";
import { setSellerSubmissionActive, refreshSellerSubmission } from "../../utils/api.js";
import { fetchAllMySubmissions } from "../../utils/sellerListingApi.js";
import { deleteListing, bulkImages } from "../../utils/api.adminListings.js";
import { getListingExpiry, formatTimeLeft, formatExpiryDate, validityLabel } from "../../shared/listingValidity.js";
import { saleUnitLabel } from "../../shared/packUnits.js";
import { resizedImageUrl } from "../../utils/imageUrl.js";
import { fmtQty, inr, toTitleCase, stockState, packagingLabel, compactSaleUnit, priceRowsFor, renewalHoursFor } from "../growSeller/sellerHelpers.js";

const FILTERS = [["all", "All"], ["live", "Live"], ["paused", "Paused"], ["exp", "Expired"], ["low", "Low stock"], ["nophoto", "No photos"], ["rej", "Rejected"]];
const GRID = "xl:grid-cols-[minmax(0,2.3fr)_1fr_.8fr_1fr_1.1fr_auto]";
const hasPhoto = (it) => !!(it.image || it.images?.length);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

function classify(it, nowMs) {
    const rejected = it.review_status === "rejected";
    const pending = it.review_status === "pending_review";
    const exp = rejected ? { expired: false, tracked: false, expiringSoon: false } : getListingExpiry(it, nowMs);
    const expired = !rejected && exp.expired;
    const active = !rejected && !pending && it.is_active !== false && !expired;
    return { rejected, pending, exp, expired, active, sState: stockState(it.stock_quantity, it.moq) };
}

const Row = memo(function Row({ it, nowMs, busy, selected, onSelect, onEdit, onToggle, onRenew, onDelete }) {
    const k = classify(it, nowMs);
    const name = toTitleCase(it.brand?.name || it.product_name || "Product");
    const brand = it.brand?.brand_name || it.brand_name;
    const img = it.image || it.brand?.image;
    const rows = priceRowsFor(it, true);
    const compact = compactSaleUnit(saleUnitLabel(it.units_per_master_pack));
    const isMTO = it.stock_type === "made_to_order";
    const stock = isMTO ? "Made to order" : it.stock_quantity == null ? "Not set" : k.sState === "out" ? "Out of stock" : `${fmtQty(it.stock_quantity)} ${compact}`;
    const stockColor = k.sState === "out" ? "#b91c1c" : k.sState === "low" && !isMTO ? "#b45309" : C.ink;
    const status = k.rejected ? ["warn", "Rejected"] : k.pending ? ["info", "In review"] : k.expired ? ["warn", "Expired"] : k.active ? ["success", "Live"] : ["neutral", "Paused"];
    const canRenew = it.review_status === "approved" && k.expired;
    const cell = "min-w-0 text-[12.5px]";
    const lab = "mb-0.5 block text-[10.5px] font-bold uppercase tracking-wide xl:hidden";

    return (
        <article className={`grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 rounded-2xl border bg-white p-3.5 xl:items-center xl:rounded-none xl:border-0 xl:border-b xl:px-3 xl:py-2.5 ${GRID}`}
            style={{ borderColor: selected ? C.primary : C.hairSoft, background: selected ? `${C.primary}0a` : "#fff", opacity: busy ? 0.55 : 1 }}>
            <div className="col-span-2 flex min-w-0 items-center gap-3 xl:col-span-1">
                <Checkbox checked={selected} onChange={(e) => onSelect(it.id, e)} accent={C.primary} label={`Select ${name}`} />
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-slate-50" style={{ borderColor: C.hair }}>
                    {img ? <img src={resizedImageUrl(img, { width: 128 })} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-extrabold" style={{ color: C.ink }}>{name}</p>
                    <p className="truncate text-[11.5px] font-medium" style={{ color: C.muted }}>{[brand, packagingLabel(it.pack_size, it.units_per_master_pack, it.unit)].filter(Boolean).join(" · ")}</p>
                </div>
            </div>
            <div className={cell}><span className={lab} style={{ color: C.muted }}>Price</span>
                {rows.length ? rows.slice(0, 2).map((r) => <p key={r.label} className="font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(r.value)} <span className="font-medium" style={{ color: C.muted }}>/{r.label}</span></p>) : "—"}
            </div>
            <div className={cell}><span className={lab} style={{ color: C.muted }}>MOQ</span><span className="font-semibold tabular-nums" style={{ color: C.ink }}>{it.moq != null ? `${fmtQty(it.moq)} ${compact}` : "—"}</span></div>
            <div className={cell}><span className={lab} style={{ color: C.muted }}>Stock</span><span className="font-semibold" style={{ color: stockColor }}>{stock}</span></div>
            <div className={cell}><span className={lab} style={{ color: C.muted }}>Status</span>
                <Chip tone={status[0]}>{status[1]}</Chip>
                {!k.rejected && k.exp.tracked && !k.expired && <p className="mt-1 text-[11px] font-medium" style={{ color: k.exp.expiringSoon ? "#b45309" : C.muted }}>{formatTimeLeft(k.exp.msLeft)} left</p>}
                {k.rejected && it.rejection_reason && <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: C.muted }}>{it.rejection_reason}</p>}
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 xl:col-span-1 xl:justify-end">
                {canRenew && <button disabled={busy} onClick={() => onRenew(it)} className="flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}><Repeat className="h-3.5 w-3.5" />Renew · {validityLabel(renewalHoursFor(it))}</button>}
                {!k.pending && !k.expired && !k.rejected && (
                    <button disabled={busy} role="switch" aria-checked={k.active} onClick={() => onToggle(it, !k.active)} className="min-h-9 rounded-lg border px-2.5 text-[12px] font-bold"
                        style={{ borderColor: k.active ? "#34d399" : C.hair, color: k.active ? "#047857" : C.muted }}>{k.active ? "Pause" : "Go live"}</button>
                )}
                <button disabled={busy} onClick={() => onEdit(it.id)} className="flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.ink }}><Pencil className="h-3.5 w-3.5" />Edit</button>
                <button disabled={busy} onClick={() => onDelete(it)} aria-label={`Delete ${name}`} className="flex h-9 w-9 items-center justify-center rounded-lg border text-red-700" style={{ borderColor: C.hair }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
        </article>
    );
});

// token = "act as seller" token. adminToken + gstin are used for the bulk photo action.
export default function AdminSellerProducts({ token, adminToken, gstin, say }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [busyId, setBusyId] = useState(null);
    const [editId, setEditId] = useState(null);
    const [photoOpen, setPhotoOpen] = useState(false);
    const seq = useRef(0);

    useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 60000); return () => clearInterval(t); }, []);

    const reload = useCallback(() => {
        const my = ++seq.current;
        fetchAllMySubmissions(token, { onFirstPage: (first) => { if (my === seq.current) { setItems(first); setLoading(false); } } }).then((res) => {
            if (my !== seq.current) return;
            if (res?.success) { setItems(res.items); setError(null); } else setError(res?.message || "Could not load products.");
            setLoading(false);
        });
    }, [token]);
    useEffect(() => { reload(); return () => { seq.current += 1; }; }, [reload]);

    const patch = useCallback((id, p) => setItems((l) => l.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

    const stats = useMemo(() => {
        const c = items.map((it) => classify(it, nowMs));
        return {
            all: items.length, live: c.filter((x) => x.active).length,
            paused: c.filter((x) => !x.active && !x.expired && !x.rejected && !x.pending).length,
            exp: c.filter((x) => x.expired).length, rej: c.filter((x) => x.rejected).length,
            low: c.filter((x) => !x.rejected && ["low", "out"].includes(x.sState)).length,
            nophoto: items.filter((it) => !hasPhoto(it)).length,
        };
    }, [items, nowMs]);

    const list = useMemo(() => {
        const term = query.trim().toLowerCase();
        return items.filter((it) => {
            const k = classify(it, nowMs);
            if (filter === "live" && !k.active) return false;
            if (filter === "paused" && (k.active || k.expired || k.rejected || k.pending)) return false;
            if (filter === "exp" && !k.expired) return false;
            if (filter === "rej" && !k.rejected) return false;
            if (filter === "low" && (k.rejected || !["low", "out"].includes(k.sState))) return false;
            if (filter === "nophoto" && hasPhoto(it)) return false;
            if (!term) return true;
            return `${it.brand?.name || it.product_name || ""} ${it.brand?.brand_name || it.brand_name || ""}`.toLowerCase().includes(term);
        });
    }, [items, query, filter, nowMs]);

    const listIds = useMemo(() => list.map((it) => it.id), [list]);
    const sel = useSelection(listIds);

    const toggle = useCallback(async (it, active) => {
        setBusyId(it.id); patch(it.id, { is_active: active });
        const res = await setSellerSubmissionActive(token, it.id, active);
        setBusyId(null);
        if (res?.success) { patch(it.id, res.submission); say(active ? "Listing is live." : "Listing paused."); }
        else { patch(it.id, { is_active: it.is_active }); say(res?.message || "Could not update the listing."); }
    }, [token, say, patch]);
    const renew = useCallback(async (it) => {
        setBusyId(it.id);
        let res = null;
        try { res = await refreshSellerSubmission(token, it.id, renewalHoursFor(it)); } catch { res = null; }
        setBusyId(null);
        if (res?.success && res.submission) { patch(it.id, res.submission); setNowMs(Date.now()); say(`Renewed. Live until ${formatExpiryDate(res.submission.expires_at)}.`); }
        else say(res?.message || "Could not renew the listing.");
    }, [token, say, patch]);
    const remove = useCallback(async (it) => {
        const name = it.brand?.name || it.product_name || "this product";
        if (!window.confirm(`Delete "${name}" permanently? Buyers will no longer see it. This cannot be undone.`)) return;
        setBusyId(it.id);
        const res = await deleteListing(token, it.id);
        setBusyId(null);
        if (res?.success) { setItems((l) => l.filter((x) => x.id !== it.id)); say("Listing deleted."); }
        else say(res?.message || "Could not delete the listing.");
    }, [token, say]);

    // same photos on every selected listing
    const applyPhotos = async (images, mode, onProgress) => {
        const ids = [...sel.selected];
        const r = await bulkImages("live", adminToken, gstin, ids, images, mode, onProgress);
        if (r.items.length) {
            const m = new Map(r.items.map((x) => [x.id, x.images]));
            setItems((l) => l.map((it) => (m.has(it.id) ? { ...it, images: m.get(it.id), image: m.get(it.id)[0] || null } : it)));
        }
        if (r.success) {
            say(`Photos ${mode === "replace" ? "replaced" : "added"} on ${plural(r.updated, "listing", "listings")}${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
            sel.clear();
        }
        return r;
    };

    return (
        <section className="mt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: C.hair }}>
                    <Search className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or brand" aria-label="Search listings" className="w-full text-[13px] font-medium outline-none" />
                    {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X className="h-4 w-4" style={{ color: C.muted }} /></button>}
                </label>
                <button onClick={reload} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border bg-white px-3 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
            </div>

            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {FILTERS.filter(([k]) => (k !== "rej" || stats.rej > 0 || filter === "rej") && (k !== "nophoto" || stats.nophoto > 0 || filter === "nophoto")).map(([k, l]) => (
                    <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className="shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold"
                        style={{ borderColor: filter === k ? C.primary : C.hair, background: filter === k ? C.primary : "#fff", color: filter === k ? "#fff" : C.muted }}>{l} · {stats[k]}</button>
                ))}
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{error}</p>}

            {list.length > 0 && (
                <div className="mt-2 rounded-xl border bg-white px-2.5 py-1.5" style={{ borderColor: C.hair }}>
                    <SelectAllRow accent={C.primary} checked={sel.isAll} indeterminate={sel.count > 0 && !sel.isAll} count={sel.count} total={list.length}
                        noun="listings shown" onChange={() => (sel.isAll ? sel.clear() : sel.selectAll())}>
                        <span className="text-[11.5px] font-medium" style={{ color: C.muted }}>Tip: search a product, select all, then add photos once. Hold Shift to pick a range.</span>
                    </SelectAllRow>
                </div>
            )}

            <div className="mt-3 overflow-hidden xl:rounded-2xl xl:border xl:bg-white" style={{ borderColor: C.hair }}>
                <div className={`hidden gap-3 border-b px-3 py-2.5 text-[11.5px] font-bold xl:grid ${GRID}`} style={{ borderColor: C.hair, color: C.muted, background: "#fafbfb" }}>
                    <span>Product</span><span>Price</span><span>MOQ</span><span>Stock</span><span>Status</span><span className="text-right">Actions</span>
                </div>
                <div className="grid gap-2 xl:gap-0">
                    {loading && !items.length && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl xl:rounded-none" style={{ background: C.hairSoft }} />)}
                    {!loading && !list.length && (
                        <div className="rounded-2xl border bg-white px-4 py-12 text-center text-[13px] font-semibold xl:border-0" style={{ borderColor: C.hair, color: C.muted }}>
                            {items.length ? "No listings match this filter." : "This seller has no listings yet. Use Add product or Bulk upload."}
                        </div>
                    )}
                    {list.map((it) => (
                        <Row key={it.id} it={it} nowMs={nowMs} busy={busyId === it.id} selected={sel.selected.has(it.id)} onSelect={sel.toggle}
                            onEdit={setEditId} onToggle={toggle} onRenew={renew} onDelete={remove} />
                    ))}
                </div>
            </div>

            <SelectionBar count={sel.count} total={list.length} noun="listings" onSelectAll={sel.selectAll} onClear={sel.clear}>
                <BarButton icon={ImagePlus} onClick={() => setPhotoOpen(true)}>Add photos</BarButton>
            </SelectionBar>

            {photoOpen && sel.count > 0 && (
                <BulkPhotoModal count={sel.count} noun="listing" uploadToken={token} onApply={applyPhotos} onClose={() => setPhotoOpen(false)} say={say} />
            )}

            {editId && (
                <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit listing">
                    <button className="absolute inset-0 bg-black/30" onClick={() => setEditId(null)} aria-label="Close" />
                    <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] shadow-xl">
                        <div className="gl"><div className="gs">
                            <GrowEditListing token={token} submissionId={editId} key={editId} focusSection={null} onClose={() => setEditId(null)}
                                onSaved={(id, submission, message) => { patch(id, submission); setEditId(null); say(message || "Changes saved."); reload(); }} />
                        </div></div>
                    </aside>
                </div>
            )}
        </section>
    );
}