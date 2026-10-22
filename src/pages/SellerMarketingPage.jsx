import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Megaphone, Check, ChevronDown, Loader2, Package, AlertTriangle, SlidersHorizontal } from "lucide-react";
import Toast from "../components/Toast.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { resizedImageUrl } from "../utils/imageUrl.js";
import { fetchAllMySubmissions, bulkUpdateMarketing } from "../utils/sellerListingApi.js";
import MarketingServicePicker from "../components/seller/listingForm/MarketingServicePicker.jsx";
import { C, EASE } from "../components/seller/listingForm/FormPrimitives.jsx";
import { getService, normalizeServiceKeys, sumServicePercent, computeNextServices } from "../shared/marketingServices.js";

const planKeys = (it) => (Array.isArray(it.marketing_services) && it.marketing_services.length ? it.marketing_services : null);
const nameOf = (it) => it.brand?.name || it.product_name || "Product";
const brandOf = (it) => it.brand?.brand_name || it.brand_name || "";

function Check3({ on, onClick, label }) {
    return (
        <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150"
            style={{ borderColor: on ? C.primary : "rgba(11,17,22,0.25)", background: on ? C.primary : "#fff" }}>
            {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
    );
}

function PlanChips({ it }) {
    const keys = planKeys(it);
    if (!keys) {
        return (
            <span className="w-fit rounded-full px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-wider" style={{ background: "#fef3c7", color: "#b45309" }}>
                Legacy · {it.marketing_legacy_percent ?? it.marketing_commission_percent ?? "—"}%
            </span>
        );
    }
    const extra = keys.filter((k) => !getService(k)?.required);
    const shown = extra.slice(0, 2);
    return (
        <div className="flex flex-wrap items-center gap-1">
            <span className="rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide" style={{ background: C.hairSoft, color: C.muted }}>Listing</span>
            {shown.map((k) => (
                <span key={k} className="rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide" style={{ background: C.hairSoft, color: C.ink }}>
                    {getService(k)?.label}
                </span>
            ))}
            {extra.length > shown.length && (
                <span className="rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide" style={{ background: C.hairSoft, color: C.muted }}>+{extra.length - shown.length}</span>
            )}
        </div>
    );
}

// Editor body only — Save / Cancel live in the floating bar so they're always reachable.
function RowEditor({ it, draft, onChange }) {
    return (
        <div className="border-t px-3 pb-4 pt-3 sm:px-4" style={{ borderColor: C.hairSoft, background: "rgba(11,17,22,0.02)" }}>
            <MarketingServicePicker value={draft} onChange={onChange} legacyPercent={it.marketing_legacy_percent ?? it.marketing_commission_percent} />
        </div>
    );
}

function Row({ it, selected, selectionMode, onSelect, open, onOpen, saving, draft, onDraftChange }) {
    const total = it.marketing_commission_percent;
    // While any listing is ticked, the whole row behaves as a selector (no individual editing).
    const handleMainClick = () => (selectionMode ? onSelect(it.id) : onOpen(it.id));
    return (
        <div>
            <div className="flex items-center gap-3 px-3 py-3 sm:px-4" style={{ background: selected ? "rgba(11,17,22,0.03)" : open ? "rgba(11,17,22,0.02)" : "transparent" }}>
                <Check3 on={selected} onClick={() => onSelect(it.id)} label={`Select ${nameOf(it)}`} />
                <button type="button" onClick={handleMainClick} aria-expanded={selectionMode ? undefined : open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: C.imgBg || "#F4F5F6" }}>
                        {it.image || it.brand?.image
                            ? <img src={resizedImageUrl(it.image || it.brand?.image, { width: 128 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            : <Package className="h-4 w-4" style={{ color: C.muted }} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>{nameOf(it)}</span>
                        {brandOf(it) && <span className="block truncate text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "#006F83" }}>{brandOf(it)}</span>}
                        <span className="mt-1 block"><PlanChips it={it} /></span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} /> : (
                            <span className="text-[16px] font-black tabular-nums" style={{ color: C.ink }}>{total != null ? `${total}%` : "—"}</span>
                        )}
                        {!selectionMode && (
                            <ChevronDown className="mt-1 h-3.5 w-3.5 transition-transform duration-200" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }} />
                        )}
                    </span>
                </button>
            </div>
            <AnimatePresence initial={false}>
                {open && !selectionMode && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }} style={{ overflow: "hidden" }}>
                        <RowEditor it={it} draft={draft} onChange={onDraftChange} />
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="h-px w-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

export default function SellerMarketingPage() {
    const navigate = useNavigate();
    const { token, profile } = useAuth();
    const { socket } = useSocket() || {};
    const isApproved = profile?.seller_status === "approved";

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all"); // all | legacy
    const [selected, setSelected] = useState(() => new Set());
    const [modalOpen, setModalOpen] = useState(false);
    const [picked, setPicked] = useState(() => normalizeServiceKeys([]));
    const [openId, setOpenId] = useState(null);
    const [draft, setDraft] = useState(null); // unsaved plan for the open individual row
    const [savingIds, setSavingIds] = useState(() => new Set());
    const [applying, setApplying] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    const itemsRef = useRef([]);
    itemsRef.current = items;

    const reload = useCallback(({ silent } = {}) => {
        if (!token || !isApproved) { setLoading(false); return; }
        if (!silent) setLoading(true);
        fetchAllMySubmissions(token).then((res) => {
            if (res?.success) setItems(res.items);
            else if (!silent) setToastMsg(res?.message || "Couldn't load listings.");
            setLoading(false);
        });
    }, [token, isApproved]);
    useEffect(() => { reload(); }, [reload]);
    useEffect(() => {
        if (!socket) return;
        const h = () => reload({ silent: true });
        socket.on("submissions_changed", h);
        return () => socket.off("submissions_changed", h);
    }, [socket, reload]);

    const legacyCount = useMemo(() => items.filter((it) => !planKeys(it)).length, [items]);
    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        return items.filter((it) => {
            if (filter === "legacy" && planKeys(it)) return false;
            if (!term) return true;
            return nameOf(it).toLowerCase().includes(term) || brandOf(it).toLowerCase().includes(term);
        });
    }, [items, query, filter]);

    const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selected.has(it.id));
    const selectedCount = selected.size;
    const selectionMode = selectedCount > 0;
    const selectedLegacy = useMemo(() => items.filter((it) => selected.has(it.id) && !planKeys(it)).length, [items, selected]);

    // Individual editing state
    const openItem = useMemo(() => (openId ? items.find((it) => it.id === openId) || null : null), [items, openId]);
    const openSaving = openId ? savingIds.has(openId) : false;
    const draftUnchanged = !!openItem && Array.isArray(draft) && JSON.stringify(normalizeServiceKeys(draft)) === JSON.stringify(planKeys(openItem));
    const canSaveRow = !!openItem && Array.isArray(draft) && !draftUnchanged && !openSaving;

    const closeEditor = () => { setOpenId(null); setDraft(null); };
    const handleOpenRow = (id) => {
        if (openId === id) { closeEditor(); return; }
        const it = itemsRef.current.find((x) => x.id === id);
        setOpenId(id);
        setDraft(it ? planKeys(it) : null);
    };

    const toggleSelect = (id) => {
        closeEditor();
        setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };
    const toggleAll = () => {
        closeEditor();
        setSelected((s) => {
            const n = new Set(s);
            if (allFilteredSelected) filtered.forEach((it) => n.delete(it.id)); else filtered.forEach((it) => n.add(it.id));
            return n;
        });
    };
    const clearSelection = () => setSelected(new Set());

    // Optimistic apply -> one bulk request -> roll back on failure.
    const applyTo = useCallback(async (ids, applyMode, services) => {
        const before = new Map(itemsRef.current.filter((it) => ids.includes(it.id)).map((it) => [it.id, it]));
        setItems((prev) => prev.map((it) => {
            if (!before.has(it.id)) return it;
            const next = computeNextServices(planKeys(it), applyMode, services);
            return { ...it, marketing_services: next, marketing_commission_percent: sumServicePercent(next), marketing_legacy_percent: null };
        }));
        setSavingIds((s) => new Set([...s, ...ids]));
        let res = null;
        try { res = await bulkUpdateMarketing(token, { submissionIds: ids, mode: applyMode, services }); } catch { res = null; }
        setSavingIds((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; });

        if (res?.success) {
            const byId = new Map((res.items || []).map((r) => [r.id, r]));
            setItems((prev) => prev.map((it) => (byId.has(it.id) ? { ...it, ...byId.get(it.id) } : it)));
            setToastMsg(res.message || "Updated.");
            return true;
        }
        setItems((prev) => prev.map((it) => before.get(it.id) || it));
        setToastMsg(res?.message || "Couldn't update. Please try again.");
        reload({ silent: true });
        return false;
    }, [token, reload]);

    const handleSaveRow = async () => {
        if (!canSaveRow) return;
        const id = openId;
        const ok = await applyTo([id], "set", normalizeServiceKeys(draft));
        if (ok) closeEditor();
    };

    // Open the "Choose services" module. If every selected listing already shares one plan, start from it.
    const openModal = () => {
        if (!selectedCount) return;
        const chosen = itemsRef.current.filter((it) => selected.has(it.id));
        const plans = chosen.map((it) => planKeys(it));
        const shared = plans.length > 0 && plans.every((p) => p && JSON.stringify(normalizeServiceKeys(p)) === JSON.stringify(normalizeServiceKeys(plans[0])));
        setPicked(shared ? normalizeServiceKeys(plans[0]) : normalizeServiceKeys([]));
        setModalOpen(true);
    };
    const closeModal = useCallback(() => { if (!applying) setModalOpen(false); }, [applying]);

    const handleApplyModal = async () => {
        const ids = [...selected];
        if (!ids.length || applying) return;
        setApplying(true);
        const ok = await applyTo(ids, "set", picked);
        setApplying(false);
        if (ok) { setModalOpen(false); setSelected(new Set()); }
    };

    // Modal: Escape to close + lock background scroll.
    useEffect(() => {
        if (!modalOpen) return;
        const onKey = (e) => { if (e.key === "Escape") closeModal(); };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [modalOpen, closeModal]);

    if (!isApproved) {
        return (
            <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
                <Megaphone className="h-6 w-6" style={{ color: C.muted }} />
                <h2 className="mt-3 text-[18px] font-extrabold tracking-wide" style={{ color: C.ink }}>Available to verified sellers</h2>
                <p className="mt-2 text-[13px] font-medium tracking-wide" style={{ color: C.muted }}>Marketing & Promotion opens once your shop is approved.</p>
                <button onClick={() => navigate("/seller/products")} className="mt-5 rounded-xl px-4 py-2 text-[13px] font-bold tracking-wide text-white" style={{ background: C.primary }}>Go to My Products</button>
            </div>
        );
    }

    const showEditBar = !!openItem && !selectionMode && !modalOpen;
    const draftPercent = Array.isArray(draft) ? sumServicePercent(normalizeServiceKeys(draft)) : (openItem?.marketing_legacy_percent ?? openItem?.marketing_commission_percent ?? null);

    return (
        <div className="min-h-screen bg-white antialiased" style={{ color: C.ink }}>
            <main className="mx-auto max-w-5xl px-2.5 pb-40 pt-4 sm:px-4">
                <div className="flex items-center gap-3 ps-1">

                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 text-[22px] font-black leading-tight tracking-wide sm:text-[26px]">
                            <Megaphone className="h-5 w-5" /> Marketing & Promotion
                        </h1>
                        <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            Set a promotion plan for each listing. You pay only when an order is generated.
                        </p>
                    </div>
                </div>

                <section className="mt-4">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.muted }} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your listings by product or brand…"
                            className="w-full rounded-full border bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                            style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 px-1">
                        <div className="flex gap-1.5">
                            {[{ v: "all", t: "All", n: items.length }, { v: "legacy", t: "Legacy plan", n: legacyCount }].map((f) => (
                                <button key={f.v} type="button" onClick={() => setFilter(f.v)}
                                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold tracking-wide"
                                    style={{ background: filter === f.v ? C.primary : "#fff", color: filter === f.v ? "#fff" : C.ink, border: `1.5px solid ${filter === f.v ? C.primary : C.hair}` }}>
                                    {f.t}
                                    <span className="rounded-full px-1.5 text-[10px] font-extrabold tabular-nums" style={{ background: filter === f.v ? "rgba(255,255,255,0.25)" : C.hairSoft }}>{f.n}</span>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={toggleAll} disabled={!filtered.length} className="text-[12px] font-bold tracking-wide underline disabled:opacity-40" style={{ color: C.ink }}>
                            {allFilteredSelected ? "Clear all" : `Select all (${filtered.length})`}
                        </button>
                    </div>

                    <p className="mt-3 px-1 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                        {selectionMode
                            ? "Tap listings to add or remove them, then choose services for all of them at once."
                            : "Tap a listing to set its plan, or tick the boxes to update several listings together."}
                    </p>

                    <div className="-mx-3 mt-3 overflow-hidden bg-white sm:mx-0 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: C.hairSoft }}>
                                    <div className="h-5 w-5 animate-pulse rounded-md" style={{ background: C.hairSoft }} />
                                    <div className="h-12 w-12 animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-3/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                        <div className="h-2.5 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                                    </div>
                                </div>
                            ))
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                                <Package className="h-6 w-6" style={{ color: C.hair }} />
                                <p className="text-[13.5px] font-bold tracking-wide">{items.length ? "Nothing matches these filters" : "You haven't listed anything yet"}</p>
                            </div>
                        ) : filtered.map((it) => (
                            <Row key={it.id} it={it} selected={selected.has(it.id)} selectionMode={selectionMode} onSelect={toggleSelect}
                                open={openId === it.id} onOpen={handleOpenRow}
                                saving={savingIds.has(it.id)} draft={draft} onDraftChange={setDraft} />
                        ))}
                    </div>
                </section>
            </main>

            {/* Floating save bar — individual listing editing */}
            <AnimatePresence>
                {showEditBar && (
                    <motion.div key="edit-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                        className="fixed inset-x-0 z-[70] flex justify-center px-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6">
                        <div className="w-full max-w-3xl rounded-2xl border bg-white p-3 shadow-xl" style={{ borderColor: C.hair }}>
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-extrabold tracking-wide">{nameOf(openItem)}</p>
                                    <p className="truncate text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                        {draftUnchanged || !Array.isArray(draft)
                                            ? "Choose services to update this plan"
                                            : `Plan becomes ${draftPercent}%`}
                                    </p>
                                </div>
                                <button type="button" onClick={closeEditor} disabled={openSaving}
                                    className="rounded-xl border px-3 py-2.5 text-[12.5px] font-bold tracking-wide disabled:opacity-40" style={{ borderColor: C.hair }}>
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSaveRow} disabled={!canSaveRow}
                                    className="flex min-w-[96px] items-center justify-center rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-40" style={{ background: C.primary }}>
                                    {openSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save plan"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sticky selection bar — appears with the first tick */}
            <AnimatePresence>
                {selectionMode && !modalOpen && (
                    <motion.div key="select-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                        className="fixed inset-x-0 z-[70] flex justify-center px-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-6">
                        <div className="w-full max-w-3xl rounded-2xl border bg-white p-3 shadow-xl" style={{ borderColor: C.hair }}>
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-extrabold tracking-wide">{selectedCount} listing{selectedCount === 1 ? "" : "s"} selected</p>
                                    <p className="truncate text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>Next, choose the services to apply</p>
                                </div>
                                <button type="button" onClick={clearSelection} className="rounded-xl border px-3 py-2.5 text-[12.5px] font-bold tracking-wide" style={{ borderColor: C.hair }}>Cancel</button>
                                <button type="button" onClick={openModal}
                                    className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white" style={{ background: C.primary }}>
                                    <SlidersHorizontal className="h-4 w-4" /> Select services
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Choose services module */}
            <AnimatePresence>
                {modalOpen && (
                    <motion.div key="svc-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
                        <div className="absolute inset-0" style={{ background: "rgba(11,17,22,0.45)" }} onClick={closeModal} aria-hidden="true" />
                        <motion.div role="dialog" aria-modal="true" aria-labelledby="svc-modal-title"
                            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }}
                            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
                            {/* Header */}
                            <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: C.hairSoft }}>

                                <div className="min-w-0">
                                    <h2 id="svc-modal-title" className="text-[16px] font-extrabold leading-tight tracking-wide">Choose services</h2>
                                    <p className="truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                        Applies to {selectedCount} selected listing{selectedCount === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-4 py-4">
                                {selectedLegacy > 0 && (
                                    <p className="mb-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ background: "#fef3c7", color: "#b45309" }}>
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        {selectedLegacy} selected listing{selectedLegacy === 1 ? " is" : "s are"} on a legacy plan and will move to the new plan.
                                    </p>
                                )}
                                <MarketingServicePicker value={picked} onChange={setPicked} mode="set" />
                            </div>

                            {/* Footer */}
                            <div className="border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ borderColor: C.hairSoft }}>
                                <p className="mb-2.5 text-center text-[12px] font-bold tracking-wide" style={{ color: C.muted }}>
                                    Plan becomes <span style={{ color: C.ink }}>{sumServicePercent(picked)}%</span> for each selected listing
                                </p>
                                <div className="flex items-center gap-2.5">
                                    <button type="button" onClick={closeModal} disabled={applying}
                                        className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-bold tracking-wide disabled:opacity-40" style={{ borderColor: C.hair }}>
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleApplyModal} disabled={applying || !selectedCount}
                                        className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-wide text-white disabled:opacity-40" style={{ background: C.primary }}>
                                        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : `Apply to ${selectedCount} listing${selectedCount === 1 ? "" : "s"}`}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
        </div>
    );
}