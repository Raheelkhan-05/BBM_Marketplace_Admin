// components/admin/bulkSelect.jsx
// Shared selection helpers for bulk actions: hook, checkbox, select-all row, sticky action bar, modal scroll lock.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";

/* ---------- selection state (selection is always a subset of the visible ids) ---------- */
export function useSelection(ids) {
    const [selected, setSelected] = useState(() => new Set());
    const idsRef = useRef(ids);
    idsRef.current = ids;
    const lastRef = useRef(null);
    const sig = `${ids.length}:${ids.join("|")}`;

    // drop anything that is no longer visible (filter changed, list reloaded, item removed)
    useEffect(() => {
        const valid = new Set(idsRef.current);
        setSelected((p) => {
            for (const x of p) if (!valid.has(x)) return new Set([...p].filter((y) => valid.has(y)));
            return p;
        });
    }, [sig]);

    // click toggles one item; Shift+click applies the new state to the whole range since the last click
    const toggle = useCallback((id, e) => {
        const list = idsRef.current;
        const anchor = lastRef.current;
        lastRef.current = id;
        setSelected((p) => {
            const n = new Set(p);
            const want = !p.has(id);
            const from = e?.shiftKey && anchor ? list.indexOf(anchor) : -1;
            const to = list.indexOf(id);
            if (from >= 0 && to >= 0) {
                const [a, b] = from < to ? [from, to] : [to, from];
                for (let i = a; i <= b; i++) { if (want) n.add(list[i]); else n.delete(list[i]); }
            } else if (want) n.add(id); else n.delete(id);
            return n;
        });
    }, []);

    const selectAll = useCallback(() => setSelected(new Set(idsRef.current)), []);
    const setMany = useCallback((arr) => setSelected(new Set(arr)), []);
    const clear = useCallback(() => { lastRef.current = null; setSelected(new Set()); }, []);

    return {
        selected, count: selected.size, toggle, selectAll, setMany, clear,
        isAll: ids.length > 0 && selected.size === ids.length,
    };
}

/* ---------- modal scroll lock (ref-counted so nested modals are safe) ---------- */
let locks = 0;
let prevOverflow = "";
export function useModalLock() {
    useEffect(() => {
        if (locks === 0) {
            prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            window.lenis?.stop?.();
        }
        locks += 1;
        return () => {
            locks -= 1;
            if (locks === 0) {
                document.body.style.overflow = prevOverflow;
                window.lenis?.start?.();
            }
        };
    }, []);
}

/* ---------- UI ---------- */
export function Checkbox({ checked, indeterminate = false, onChange, label, accent = "#047084", disabled = false }) {
    const on = checked || indeterminate;
    return (
        <button type="button" role="checkbox" aria-checked={indeterminate ? "mixed" : !!checked} aria-label={label} disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onChange?.(e); }}
            onKeyDown={(e) => e.stopPropagation()}
            className="-m-1.5 flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-40">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors"
                style={{ borderColor: on ? accent : "#cbd5e1", background: on ? accent : "#fff" }}>
                {indeterminate ? <Minus className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : checked ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
            </span>
        </button>
    );
}

export function SelectAllRow({ checked, indeterminate, onChange, count, total, noun = "products", accent, children }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 py-1">
            <div role="presentation" onClick={onChange} className="flex cursor-pointer select-none items-center gap-2.5 text-[12.5px] font-bold" style={{ color: "#334155" }}>
                <Checkbox checked={checked} indeterminate={indeterminate} onChange={onChange} accent={accent} label="Select all" />
                {count ? `${count} of ${total} selected` : `Select all ${total} ${noun}`}
            </div>
            {children}
        </div>
    );
}

export function SelectionBar({ count, total, noun = "products", onSelectAll, onClear, children }) {
    if (!count) return null;
    return (
        <div role="region" aria-label="Bulk actions" className="sticky bottom-1 z-30 mt-3 md:bottom-4">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-slate-900 px-3.5 py-2.5 text-white shadow-xl">
                <span className="text-[13px] font-bold">{count} selected</span>
                {count < total && <button type="button" onClick={onSelectAll} className="text-[12px] font-bold underline underline-offset-2">Select all {total}</button>}
                <button type="button" onClick={onClear} className="text-[12px] font-semibold text-slate-300">Clear</button>
                <div className="ml-auto flex flex-wrap gap-2">{children}</div>
            </div>
        </div>
    );
}

export function BarButton({ onClick, disabled, icon: Icon, children }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[12.5px] font-bold text-slate-900 disabled:opacity-50">
            {Icon && <Icon className="h-4 w-4" />}{children}
        </button>
    );
}