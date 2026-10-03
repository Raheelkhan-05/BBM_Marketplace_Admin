// components/rfq/RfqHierarchyPicker.jsx — Category → Subcategory → Generic Product (searchable, can create)
import { useEffect, useRef, useState } from "react";
import { X, Plus, Loader2, ChevronDown } from "lucide-react";
import { C } from "../seller/listingForm/FormPrimitives.jsx";
import { adminCatalogOptions, adminCreateCatalogOption } from "../../utils/rfqApi.js";

function LevelSelect({ label, level, value, parentId, disabled, token, onChange, required }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [err, setErr] = useState(null);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await adminCatalogOptions(token, { pickerLevel: level, parentId, q, signal: controller.signal });
                setOptions(res.success ? res.options || [] : []);
            } catch { /* aborted */ }
            setLoading(false);
        }, 200);
        return () => { clearTimeout(t); controller.abort(); };
    }, [open, q, level, parentId, token]);

    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    const exact = options.some((o) => o.name.trim().toLowerCase() === q.trim().toLowerCase());

    const create = async () => {
        setCreating(true); setErr(null);
        const res = await adminCreateCatalogOption(token, { pickerLevel: level, name: q.trim(), parentId });
        setCreating(false);
        if (!res.success) { setErr(res.message || "Couldn't create."); return; }
        onChange(res.option); setOpen(false); setQ("");
    };

    return (
        <div className="relative flex min-w-0 flex-col gap-1" ref={wrapRef}>
            <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>{label}{required && <span style={{ color: C.primary }}> *</span>}</span>
            <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border bg-white px-2.5 py-1.5 text-left text-[14px] font-bold tracking-wide disabled:opacity-50"
                style={{ borderColor: C.hair, color: value ? C.ink : "#94a3b8" }}>
                <span className="truncate">{value?.name || (disabled ? "Select the level above first" : "Select…")}</span>
                <span className="flex items-center gap-1">
                    {value && !disabled && (
                        <span role="button" aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(null); }} className="rounded-full p-0.5 hover:bg-black/[0.06]">
                            <X className="h-3 w-3" style={{ color: C.muted }} />
                        </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5" style={{ color: C.muted }} />
                </span>
            </button>
            {open && (
                <div className="absolute left-0 top-full z-[100] mt-1 w-full min-w-[220px] rounded-xl border bg-white p-1.5 shadow-lg" style={{ borderColor: C.hair }}>
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new name"
                        className="w-full rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold focus:outline-none" style={{ borderColor: C.hair, color: C.ink }} />
                    <div data-lenis-prevent className="mt-1 max-h-48 overflow-y-auto">
                        {loading && <p className="flex items-center gap-1.5 px-2 py-2 text-[12px] font-semibold" style={{ color: C.muted }}><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>}
                        {!loading && options.map((o) => (
                            <button key={o.id} type="button" onClick={() => { onChange(o); setOpen(false); setQ(""); }}
                                className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] font-bold tracking-wide hover:bg-black/[0.03]" style={{ color: C.ink }}>
                                {o.name}
                            </button>
                        ))}
                        {!loading && !options.length && q.trim().length < 2 && <p className="px-2 py-2 text-[12px] font-semibold" style={{ color: C.muted }}>No entries yet.</p>}
                        {q.trim().length >= 2 && !exact && !loading && (
                            <button type="button" onClick={create} disabled={creating}
                                className="mt-0.5 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-extrabold tracking-wide hover:bg-black/[0.03] disabled:opacity-50" style={{ color: C.ink }}>
                                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Create “{q.trim()}”
                            </button>
                        )}
                        {err && <p className="px-2 py-1 text-[11.5px] font-semibold" style={{ color: C.danger }}>{err}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

// value: { category, subcategory, genericProduct } each { id, name } | null
export default function RfqHierarchyPicker({ value, onChange, token, required }) {
    const v = value || { category: null, subcategory: null, genericProduct: null };
    return (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <LevelSelect label="Category" level="category" required={required} token={token} value={v.category}
                onChange={(o) => onChange({ category: o, subcategory: null, genericProduct: null })} />
            <LevelSelect label="Subcategory" level="subcategory" required={required} token={token} value={v.subcategory}
                disabled={!v.category} parentId={v.category?.id}
                onChange={(o) => onChange({ ...v, subcategory: o, genericProduct: null })} />
            <LevelSelect label="Generic product" level="generic_product" required={required} token={token} value={v.genericProduct}
                disabled={!v.subcategory} parentId={v.subcategory?.id}
                onChange={(o) => onChange({ ...v, genericProduct: o })} />
        </div>
    );
}