// src/components/admin/SingleLevelDropdown.jsx
import { useEffect, useRef, useState } from "react";
import { adminGetPickerOptions, adminCreatePickerOption } from "../utils/api.js";

// One rung of the cascading hierarchy picker: search existing rows at this
// level (scoped to parentId if this level has a parent), or create a new one.
// disabled=true when the level above hasn't been picked yet.
// `open`/`onOpenChange` are controlled by the parent picker so only one
// rung's panel can ever be open across the whole component at once.
export default function SingleLevelDropdown({ token, pickerLevel, parentId, value, label, onChange, disabled, open, onOpenChange }) {
    const [q, setQ] = useState("");
    const [options, setOptions] = useState([]);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState("");
    const containerRef = useRef(null);

    useEffect(() => {
        if (!open || disabled) return;
        adminGetPickerOptions(token, pickerLevel, parentId, q).then((res) => {
            if (res?.success) setOptions(res.options);
        });
    }, [open, q, parentId, pickerLevel, disabled, token]);

    // Close on outside click — previously the panel just stayed open forever
    // unless you picked an option.
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) onOpenChange(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open, onOpenChange]);

    async function handleCreate() {
        const name = q.trim();
        if (name.length < 2) return;
        setCreating(true);
        setErr("");
        const res = await adminCreatePickerOption(token, pickerLevel, name, parentId);
        setCreating(false);
        if (res?.success) {
            onChange(res.option.id, res.option.name);
            onOpenChange(false);
            setQ("");
        } else {
            setErr(res?.message || "Couldn't create that.");
        }
    }

    const exactMatch = options.some((o) => o.name.trim().toLowerCase() === q.trim().toLowerCase());

    return (
        <div className="relative" ref={containerRef}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <button type="button" disabled={disabled} onClick={() => onOpenChange(!open)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[13px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300">
                {value?.name || (disabled ? `Select ${label.toLowerCase()} above first` : `— select ${label.toLowerCase()} —`)}
            </button>
            {open && !disabled && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setErr(""); }}
                        placeholder={`Search or type a new ${label.toLowerCase()} name…`}
                        className="w-full border-b border-slate-100 px-3 py-2 text-[12.5px] focus:outline-none" />
                    <div className="max-h-48 overflow-y-auto">
                        {options.map((o) => (
                            <button key={o.id} type="button" onClick={() => { onChange(o.id, o.name); onOpenChange(false); setQ(""); }}
                                className={`block w-full px-3 py-2 text-left text-[12.5px] font-medium hover:bg-slate-50 ${o.id === value?.id ? "text-[#047084]" : "text-slate-600"}`}>
                                {o.name}
                            </button>
                        ))}
                        {options.length === 0 && <p className="px-3 py-3 text-center text-[12px] text-slate-400">No matches.</p>}
                    </div>
                    {q.trim().length >= 2 && !exactMatch && (
                        <div className="border-t border-slate-100 p-2">
                            <button type="button" onClick={handleCreate} disabled={creating}
                                className="flex w-full items-center gap-1.5 rounded-lg bg-[#047084]/[0.06] px-2.5 py-2 text-left text-[12.5px] font-bold text-[#047084] disabled:opacity-50">
                                {creating ? "Creating…" : `+ Create new ${label.toLowerCase()} "${q.trim()}"`}
                            </button>
                            {err && <p className="mt-1 px-1 text-[11px] font-medium text-[#c71f11]">{err}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}