import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X, ArrowUpDown, Check, SlidersHorizontal, Tag } from "lucide-react";
import { createPortal } from "react-dom";
import { C, EASE } from "./tokens";

const SORT_OPTIONS = [
    { value: "relevance", label: "Relevance" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
];

// Positions a popover with `fixed` coords derived from the trigger button's
// own rect, recomputed on open/resize/scroll. This is what lets it escape
// the chip row's `overflow-x-auto` — an `absolute` popover nested inside
// that container gets clipped on BOTH axes (browsers clip overflow on both
// axes together, not just the scrollable one), even though it still toggles
// open/closed correctly in state. `fixed` positioning is laid out relative
// to the viewport, not any scrolling ancestor, so it can't be clipped by it.
function usePopoverPosition(triggerRef, isOpen) {
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
        if (!isOpen) { setPos(null); return; }
        const update = () => {
            const el = triggerRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setPos({ top: r.bottom + 10, left: r.left });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true); // capture: catches the chip strip's own scroll too
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [isOpen, triggerRef]);
    return pos;
}

function useOutsideClose(setOpen, extraRef) {
    const ref = useRef(null);
    useEffect(() => {
        const onDown = (e) => {
            if (ref.current?.contains(e.target)) return;
            if (extraRef?.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [setOpen, extraRef]);
    return ref;
}

function Chip({ chipRef, active, icon: Icon, children, onClick }) {
    return (
        <button
            ref={chipRef}
            onClick={onClick}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-bold transition-all duration-150"
            style={{
                borderColor: active ? C.primary : C.hair,
                background: active ? `${C.primary}0F` : "#fff",
                color: active ? C.primary : C.ink,
            }}
        >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {children}
            <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
    );
}

function Pill({ children, onRemove }) {
    return (
        <span
            className="flex shrink-0 items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[11px] font-bold"
            style={{ background: `${C.primary}0F`, color: C.primary }}
        >
            {children}
            <button
                onClick={onRemove}
                className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-black/[0.06]"
                aria-label="Remove filter"
            >
                <X className="h-2.5 w-2.5" />
            </button>
        </span>
    );
}

// Popovers are portaled to document.body and positioned `fixed`, so they
// render on top of everything and are never clipped by any ancestor's
// overflow, scroll, or z-index/stacking context — same technique used for
// tooltips/menus in most component libraries.
function PopoverPortal({ pos, width, children }) {
    if (!pos) return null;
    return createPortal(
        <div
            className="fixed z-[999]"
            style={{ top: pos.top, left: pos.left, width }}
        >
            {children}
        </div>,
        document.body
    );
}

function RefinePopover({ facets, filters, setFilters, onClose, triggerRef }) {
    const pos = usePopoverPosition(triggerRef, true);
    const ref = useOutsideClose(onClose, triggerRef);
    const visibleProducts = useMemo(() => {
        if (filters.subcategoryIds.length === 0) return facets.products;
        return facets.products.filter((p) => filters.subcategoryIds.includes(p.subcategory_id));
    }, [facets.products, filters.subcategoryIds]);

    const toggleSub = (id) => setFilters((f) => ({
        subcategoryIds: f.subcategoryIds.includes(id)
            ? f.subcategoryIds.filter((x) => x !== id)
            : [...f.subcategoryIds, id],
    }));
    const toggleProduct = (id) => setFilters((f) => ({
        genericProductIds: f.genericProductIds.includes(id)
            ? f.genericProductIds.filter((x) => x !== id)
            : [...f.genericProductIds, id],
    }));

    const hasAnyOptions = facets.subcategories.length > 0 || facets.products.length > 0;

    return (
        <PopoverPortal pos={pos} width="min(92vw, 560px)">
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="overflow-hidden rounded-2xl border bg-white shadow-[0_20px_48px_-16px_rgba(11,17,22,0.28)]"
                style={{ borderColor: C.hair }}
            >
                {hasAnyOptions ? (
                    <div className="grid grid-cols-2 divide-x" style={{ borderColor: C.hair }}>
                        <div className="max-h-72 overflow-y-auto p-3">
                            <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: C.muted }}>Subcategory</p>
                            {facets.subcategories.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => toggleSub(s.id)}
                                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                                    style={{ color: filters.subcategoryIds.includes(s.id) ? C.primary : C.ink }}
                                >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        {filters.subcategoryIds.includes(s.id) && <Check className="h-3 w-3 shrink-0" />}
                                        <span className="truncate">{s.name}</span>
                                    </span>
                                    <span className="shrink-0 text-[10.5px] font-bold" style={{ color: C.muted }}>{s.count}</span>
                                </button>
                            ))}
                            {facets.subcategories.length === 0 && (
                                <p className="px-2.5 py-3 text-[12px] font-medium" style={{ color: C.muted }}>None available.</p>
                            )}
                        </div>
                        <div className="max-h-72 overflow-y-auto p-3">
                            <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: C.muted }}>Product</p>
                            {visibleProducts.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => toggleProduct(p.id)}
                                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                                    style={{ color: filters.genericProductIds.includes(p.id) ? C.primary : C.ink }}
                                >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        {filters.genericProductIds.includes(p.id) && <Check className="h-3 w-3 shrink-0" />}
                                        <span className="truncate">{p.name}</span>
                                    </span>
                                    <span className="shrink-0 text-[10.5px] font-bold" style={{ color: C.muted }}>{p.count}</span>
                                </button>
                            ))}
                            {visibleProducts.length === 0 && (
                                <p className="px-2.5 py-3 text-[12px] font-medium" style={{ color: C.muted }}>No products in this subcategory.</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="px-4 py-6 text-center text-[12.5px] font-medium" style={{ color: C.muted }}>No refinements available for these results.</p>
                )}
                <div className="flex items-center justify-between border-t px-4 py-2.5" style={{ borderColor: C.hair }}>
                    <button
                        onClick={() => setFilters({ subcategoryIds: [], genericProductIds: [] })}
                        disabled={filters.subcategoryIds.length === 0 && filters.genericProductIds.length === 0}
                        className="text-[11.5px] font-bold disabled:opacity-30"
                        style={{ color: C.secondary }}
                    >
                        Clear
                    </button>
                    <button onClick={onClose} className="rounded-full px-4 py-1.5 text-[11.5px] font-bold text-white" style={{ background: C.ink }}>
                        Done
                    </button>
                </div>
            </motion.div>
        </PopoverPortal>
    );
}

function BrandPopover({ facets, filters, setFilters, onClose, triggerRef }) {
    const pos = usePopoverPosition(triggerRef, true);
    const ref = useOutsideClose(onClose, triggerRef);
    const toggle = (name) => setFilters((f) => ({
        brands: f.brands.includes(name) ? f.brands.filter((x) => x !== name) : [...f.brands, name],
    }));
    return (
        <PopoverPortal pos={pos} width={256}>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="max-h-80 overflow-y-auto rounded-2xl border bg-white p-3 shadow-[0_20px_48px_-16px_rgba(11,17,22,0.28)]"
                style={{ borderColor: C.hair }}
            >
                {facets.brands.map((b) => (
                    <button
                        key={b.name}
                        onClick={() => toggle(b.name)}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                        style={{ color: filters.brands.includes(b.name) ? C.primary : C.ink }}
                    >
                        <span className="flex min-w-0 items-center gap-1.5">
                            {filters.brands.includes(b.name) && <Check className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{b.name}</span>
                        </span>
                        <span className="shrink-0 text-[10.5px] font-bold" style={{ color: C.muted }}>{b.count}</span>
                    </button>
                ))}
                {facets.brands.length === 0 && (
                    <p className="px-2.5 py-3 text-[12px] font-medium" style={{ color: C.muted }}>No brands to show yet.</p>
                )}
            </motion.div>
        </PopoverPortal>
    );
}

function SortPopover({ filters, setFilters, onClose, triggerRef }) {
    const pos = usePopoverPosition(triggerRef, true);
    const ref = useOutsideClose(onClose, triggerRef);
    return (
        <PopoverPortal pos={pos} width={224}>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="overflow-hidden rounded-2xl border bg-white p-1.5 shadow-[0_20px_48px_-16px_rgba(11,17,22,0.28)]"
                style={{ borderColor: C.hair }}
            >
                {SORT_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        onClick={() => { setFilters({ sort: o.value }); onClose(); }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                        style={{ color: filters.sort === o.value ? C.primary : C.ink }}
                    >
                        {o.label}
                        {filters.sort === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                ))}
            </motion.div>
        </PopoverPortal>
    );
}

export default function BrowseFilterBar({ filters, setFilters, facets, total, loading }) {
    const [open, setOpen] = useState(null); // "refine" | "brand" | "sort" | null
    const refineChipRef = useRef(null);
    const brandChipRef = useRef(null);
    const sortChipRef = useRef(null);

    const refineCount = filters.subcategoryIds.length + filters.genericProductIds.length;
    const anyActive = refineCount > 0 || filters.brands.length > 0;
    const currentSortLabel = SORT_OPTIONS.find((o) => o.value === filters.sort)?.label || "Sort";

    const activeSubs = useMemo(
        () => facets.subcategories.filter((s) => filters.subcategoryIds.includes(s.id)),
        [facets.subcategories, filters.subcategoryIds]
    );
    const activeProducts = useMemo(
        () => facets.products.filter((p) => filters.genericProductIds.includes(p.id)),
        [facets.products, filters.genericProductIds]
    );

    const removeSub = (id) => setFilters((f) => ({ subcategoryIds: f.subcategoryIds.filter((x) => x !== id) }));
    const removeProduct = (id) => setFilters((f) => ({ genericProductIds: f.genericProductIds.filter((x) => x !== id) }));
    const removeBrand = (name) => setFilters((f) => ({ brands: f.brands.filter((x) => x !== name) }));

    return (
        <div className="sticky top-0 z-20 -mx-2.5 border-b bg-white/95 px-2.5 pb-3 pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:shadow-[0_1px_0_rgba(11,17,22,0.03)]" style={{ borderColor: C.hair }}>
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
                </p>
                <span
                    className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums"
                    style={{ background: C.hairSoft, color: C.ink }}
                >
                    {loading ? "…" : `${total} result${total === 1 ? "" : "s"}`}
                </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Chip chipRef={refineChipRef} active={refineCount > 0} icon={Tag} onClick={() => setOpen(open === "refine" ? null : "refine")}>
                    Subcategory & Product{refineCount > 0 ? ` (${refineCount})` : ""}
                </Chip>

                <Chip chipRef={brandChipRef} active={filters.brands.length > 0} onClick={() => setOpen(open === "brand" ? null : "brand")}>
                    Brand{filters.brands.length > 0 ? ` (${filters.brands.length})` : ""}
                </Chip>

                <Chip chipRef={sortChipRef} active={filters.sort !== "relevance"} icon={ArrowUpDown} onClick={() => setOpen(open === "sort" ? null : "sort")}>
                    {currentSortLabel}
                </Chip>

                {anyActive && (
                    <button
                        onClick={() => setFilters({ subcategoryIds: [], genericProductIds: [], brands: [] })}
                        className="ml-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-[11.5px] font-bold transition-colors hover:bg-black/[0.04]"
                        style={{ color: C.muted }}
                    >
                        <X className="h-3.5 w-3.5" /> Clear all
                    </button>
                )}
            </div>

            {(activeSubs.length > 0 || activeProducts.length > 0 || filters.brands.length > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {activeSubs.map((s) => (
                        <Pill key={`sub-${s.id}`} onRemove={() => removeSub(s.id)}>{s.name}</Pill>
                    ))}
                    {activeProducts.map((p) => (
                        <Pill key={`prod-${p.id}`} onRemove={() => removeProduct(p.id)}>{p.name}</Pill>
                    ))}
                    {filters.brands.map((b) => (
                        <Pill key={`brand-${b}`} onRemove={() => removeBrand(b)}>{b}</Pill>
                    ))}
                </div>
            )}

            <AnimatePresence>
                {open === "refine" && (
                    <RefinePopover facets={facets} filters={filters} setFilters={setFilters} onClose={() => setOpen(null)} triggerRef={refineChipRef} />
                )}
                {open === "brand" && (
                    <BrandPopover facets={facets} filters={filters} setFilters={setFilters} onClose={() => setOpen(null)} triggerRef={brandChipRef} />
                )}
                {open === "sort" && (
                    <SortPopover filters={filters} setFilters={setFilters} onClose={() => setOpen(null)} triggerRef={sortChipRef} />
                )}
            </AnimatePresence>
        </div>
    );
}