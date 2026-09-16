// components/catalog/SimpleFacetFilterBar.jsx
//
// Config-driven filter bar: pass one or more facet "groups" (each its
// own chip + checklist popover) plus a sort control. Used by the new
// Generic Product grid (Subcategory group only) and the new
// generic-product Sellers list (Brand group only) — same interaction
// pattern as BrowseFilterBar, just generalized so we don't duplicate
// the popover-positioning logic for every new page.

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X, ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import { C, EASE } from "./tokens";

const SORT_OPTIONS = [
    { value: "relevance", label: "Relevance" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
];

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
        window.addEventListener("scroll", update, true);
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

function PopoverPortal({ pos, width, children }) {
    if (!pos) return null;
    return createPortal(
        <div className="fixed z-[999]" style={{ top: pos.top, left: pos.left, width }}>{children}</div>,
        document.body
    );
}

function Chip({ chipRef, active, icon: Icon, children, onClick }) {
    return (
        <button
            ref={chipRef}
            onClick={onClick}
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-bold transition-all duration-150"
            style={{ borderColor: active ? C.primary : C.hair, background: active ? `${C.primary}0F` : "#fff", color: active ? C.primary : C.ink }}
        >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {children}
            <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
    );
}

function Pill({ children, onRemove }) {
    return (
        <span className="flex shrink-0 items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[11px] font-bold" style={{ background: `${C.primary}0F`, color: C.primary }}>
            {children}
            <button onClick={onRemove} className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-black/[0.06]" aria-label="Remove filter">
                <X className="h-2.5 w-2.5" />
            </button>
        </span>
    );
}

function GroupPopover({ group, onClose, triggerRef }) {
    const pos = usePopoverPosition(triggerRef, true);
    const ref = useOutsideClose(onClose, triggerRef);
    return (
        <PopoverPortal pos={pos} width={280}>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="max-h-80 overflow-y-auto rounded-2xl border bg-white p-3 shadow-[0_20px_48px_-16px_rgba(11,17,22,0.28)]"
                style={{ borderColor: C.hair }}
            >
                {group.options.map((o) => (
                    <button
                        key={o.id}
                        onClick={() => group.onToggle(o.id)}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                        style={{ color: group.selected.includes(o.id) ? C.primary : C.ink }}
                    >
                        <span className="flex min-w-0 items-center gap-1.5">
                            {group.selected.includes(o.id) && <Check className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{o.name}</span>
                        </span>
                        <span className="shrink-0 text-[10.5px] font-bold" style={{ color: C.muted }}>{o.count}</span>
                    </button>
                ))}
                {group.options.length === 0 && <p className="px-2.5 py-3 text-[12px] font-medium" style={{ color: C.muted }}>Nothing to filter by yet.</p>}
            </motion.div>
        </PopoverPortal>
    );
}

function SortPopover({ sort, onChange, onClose, triggerRef }) {
    const pos = usePopoverPosition(triggerRef, true);
    const ref = useOutsideClose(onClose, triggerRef);
    return (
        <PopoverPortal pos={pos} width={224}>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="overflow-hidden rounded-2xl border bg-white p-1.5 shadow-[0_20px_48px_-16px_rgba(11,17,22,0.28)]"
                style={{ borderColor: C.hair }}
            >
                {SORT_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        onClick={() => { onChange(o.value); onClose(); }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/[0.03]"
                        style={{ color: sort === o.value ? C.primary : C.ink }}
                    >
                        {o.label}
                        {sort === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                ))}
            </motion.div>
        </PopoverPortal>
    );
}

// groups: [{ key, label, icon, options: [{id,name,count}], selected: [], onToggle(id), onClear() }]
export default function SimpleFacetFilterBar({ groups, sort, onSortChange, total, loading, title = "Filters" }) {
    const [open, setOpen] = useState(null); // group.key | "sort" | null
    const chipRefs = useRef({});
    const sortChipRef = useRef(null);

    const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label || "Sort";
    const anyActive = groups.some((g) => g.selected.length > 0);

    return (
        <div className="sticky top-0 z-20 -mx-2.5 border-b bg-white/95 px-2.5 pb-3 pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:shadow-[0_1px_0_rgba(11,17,22,0.03)]" style={{ borderColor: C.hair }}>
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> {title}
                </p>
                <span className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums" style={{ background: C.hairSoft, color: C.ink }}>
                    {loading ? "…" : `${total} result${total === 1 ? "" : "s"}`}
                </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {groups.map((g) => {
                    const ref = (chipRefs.current[g.key] ??= { current: null });
                    return (
                        <Chip key={g.key} chipRef={ref} active={g.selected.length > 0} icon={g.icon} onClick={() => setOpen(open === g.key ? null : g.key)}>
                            {g.label}{g.selected.length > 0 ? ` (${g.selected.length})` : ""}
                        </Chip>
                    );
                })}
                <Chip chipRef={sortChipRef} active={sort !== "relevance"} icon={ArrowUpDown} onClick={() => setOpen(open === "sort" ? null : "sort")}>
                    {currentSortLabel}
                </Chip>
                {anyActive && (
                    <button
                        onClick={() => groups.forEach((g) => g.onClear())}
                        className="ml-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-[11.5px] font-bold transition-colors hover:bg-black/[0.04]"
                        style={{ color: C.muted }}
                    >
                        <X className="h-3.5 w-3.5" /> Clear all
                    </button>
                )}
            </div>

            {groups.some((g) => g.selected.length > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {groups.flatMap((g) =>
                        g.options.filter((o) => g.selected.includes(o.id)).map((o) => (
                            <Pill key={`${g.key}-${o.id}`} onRemove={() => g.onToggle(o.id)}>{o.name}</Pill>
                        ))
                    )}
                </div>
            )}

            <AnimatePresence>
                {groups.map((g) => open === g.key && (
                    <GroupPopover key={g.key} group={g} onClose={() => setOpen(null)} triggerRef={chipRefs.current[g.key]} />
                ))}
                {open === "sort" && (
                    <SortPopover sort={sort} onChange={onSortChange} onClose={() => setOpen(null)} triggerRef={sortChipRef} />
                )}
            </AnimatePresence>
        </div>
    );
}