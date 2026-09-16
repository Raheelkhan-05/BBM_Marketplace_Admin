// components/seller/listingForm/BrandCombobox.jsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ImagePlus, Loader2, X, Plus } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { searchBrandNames } from "../../../utils/sellerListingApi.js";
import { uploadSellerFile } from "../../../utils/api.js";
import { C, Label } from "./FormPrimitives.jsx";

export default function BrandCombobox({ value, notApplicable, image, onChange }) {
    const { token } = useAuth();
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [justCreated, setJustCreated] = useState(false);
    const boxRef = useRef(null);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);

    const hasSelection = !notApplicable && !!value;

    // reset highlight whenever the option set changes
    useEffect(() => {
        setHighlightedIdx(items.length > 0 ? 0 : (query.trim() && !exactMatch ? 0 : -1));
    }, [items, query]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        function onOutside(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, []);

    useEffect(() => {
        if (!open || notApplicable || hasSelection) return;
        const t = setTimeout(() => {
            searchBrandNames(token, query).then((res) => setItems(res?.success ? res.items : []));
            // console.log(items);

        }, query ? 250 : 0);
        return () => clearTimeout(t);
    }, [query, open, notApplicable, hasSelection, token]);

    const exactMatch = items.some((it) => it.name.toLowerCase() === query.trim().toLowerCase());

    const showAddNew = query.trim() && !exactMatch;
    const totalOptions = items.length + (showAddNew ? 1 : 0);

    const pickExisting = (it) => {
        onChange({ brandName: it.name, brandImage: it.image || null, brandNotApplicable: false });
        setJustCreated(false); setQuery(""); setOpen(false);
    };
    const addNew = () => {
        const name = query.trim();
        if (!name) return;
        onChange({ brandName: name, brandImage: null, brandNotApplicable: false });
        setJustCreated(true); setQuery(""); setOpen(false);
    };
    const clearSelection = () => {
        onChange({ brandName: "", brandImage: null, brandNotApplicable: false });
        setJustCreated(false); setQuery("");
    };
    const markNotApplicable = () => onChange({ brandName: "", brandImage: null, brandNotApplicable: true });

    const handleImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const res = await uploadSellerFile(token, file, "brands");
            if (res?.success) onChange({ brandName: value, brandImage: res.url, brandNotApplicable: false });
        } finally { setUploading(false); e.target.value = ""; setJustCreated(false); }
    };

    if (notApplicable) {
        return (
            <div className="flex flex-col gap-1">
                <Label>Brand <span style={{ color: C.primary }}> *</span></Label>
                <div className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 tracking-wide" style={{ borderColor: C.hair, background: C.hairSoft }}>
                    <span className="text-[14px] font-bold" style={{ color: C.muted }}>No brand for this product</span>
                    <button type="button" onClick={clearSelection} className="text-[12.5px] font-bold" style={{ color: C.secondary }}>Change</button>
                </div>
            </div>
        );
    }

    if (hasSelection) {
        const initials = value.trim().slice(0, 2).toUpperCase();
        return (
            <div className="flex flex-col gap-1.5">
                <Label>Brand <span style={{ color: C.primary }}> *</span></Label>
                <div className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: C.hair }}>
                    {image ? (
                        <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg border object-cover" style={{ borderColor: C.hair }} />
                    ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[13.5px] font-extrabold" style={{ background: `${C.secondary}14`, color: C.secondary }}>{initials}</span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{value}</p>
                        {justCreated && !image && <p className="text-[12px] font-semibold" style={{ color: C.muted }}>New brand</p>}
                    </div>
                    <button type="button" onClick={clearSelection} className="shrink-0 rounded-full p-1.5 transition-colors duration-150 hover:bg-black/[0.05]">
                        <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    </button>
                </div>

                {justCreated && !image && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: `${C.secondary}0a` }}>
                        <span className="text-[12.5px] font-semibold" style={{ color: C.muted }}>Add a logo for {value}? <span className="font-medium">(optional)</span></span>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <label className="flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold" style={{ borderColor: C.hair, color: C.secondary }}>
                                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />} Upload
                                <input type="file" accept="image/*" onChange={handleImage} className="hidden" disabled={uploading} />
                            </label>
                            <button type="button" onClick={() => setJustCreated(false)} className="text-[12px] font-bold" style={{ color: C.muted }}>Skip</button>
                        </div>
                    </motion.div>
                )}
                {/* <button type="button" onClick={clearSelection} className="w-fit text-[13px] tracking-wide font-bold underline" style={{ color: C.primary }}>This product has no brand?</button> */}
            </div>
        );
    }

    return (
        <div ref={boxRef} className="relative flex min-w-0 flex-col gap-1.5">
            <Label>Brand <span style={{ color: C.primary }}> *</span></Label>
            <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                    <input value={query} onFocus={() => setOpen(true)}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onKeyDown={(e) => {
                            if (!open) return;
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlightedIdx((i) => Math.min(totalOptions - 1, i + 1));
                            } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlightedIdx((i) => Math.max(0, i - 1));
                            } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (highlightedIdx < items.length && items[highlightedIdx]) {
                                    pickExisting(items[highlightedIdx]);
                                } else if (showAddNew) {
                                    addNew();
                                }
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                setOpen(false);
                            }
                        }}
                        placeholder="Search or type a new brand…"
                        className="w-full rounded-xl tracking-wide border py-2.5 pl-9 pr-3 text-[14.5px] focus:outline-none focus:ring-2 placeholder:text-gray-300"
                        style={{ borderColor: C.hair }} />
                </div>
                <button type="button" onClick={markNotApplicable}
                    className="shrink-0 rounded-xl border px-3 py-2.5 text-[12px] transition-colors font-bold tracking-wider duration-150 hover:bg-black/[0.02] text-slate-700 uppercase"
                    style={{ borderColor: "#d4d4d4ff" }}>
                    No brand
                </button>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-[68px] z-30 max-h-64 overflow-y-auto rounded-xl border bg-white shadow-lg" style={{ borderColor: C.hair }}>
                        {items.map((it, idx) => (
                            <button key={it.name} type="button" onClick={() => pickExisting(it)}
                                className="flex w-full items-center gap-2.5 border-b px-3.5 py-2.5 text-left last:border-b-0 transition-colors duration-150 hover:bg-black/[0.03]"
                                style={{
                                    borderColor: C.hairSoft,
                                    background: idx === highlightedIdx ? "rgba(11,17,22,0.04)" : undefined,
                                }}
                            >
                                {it.image ? <img src={it.image} alt="" className="h-7 w-7 rounded object-cover" /> : (
                                    <span className="flex h-7 w-7 items-center justify-center rounded text-[11.5px] font-extrabold" style={{ background: C.hairSoft, color: C.muted }}>{it.name.slice(0, 2).toUpperCase()}</span>
                                )}
                                <span className="text-[14px] tracking-wide uppercase font-bold" style={{ color: C.ink }}>{it.name}</span>
                            </button>
                        ))}
                        {query.trim() && !exactMatch && (

                            <button type="button" onClick={addNew}
                                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-black/[0.03]"
                                style={{ background: items.length === highlightedIdx ? "rgba(0,111,131,0.14)" : `${C.secondary}08` }}
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${C.secondary}18`, color: C.secondary }}><Plus className="h-3.5 w-3.5" /></span>
                                <span className="text-[14px] font-bold" style={{ color: C.secondary }}>Add "{query.trim()}" as a new brand</span>
                            </button>

                        )}
                        {items.length === 0 && !query.trim() && (
                            <p className="px-3.5 py-3 text-center text-[13px] font-medium" style={{ color: C.muted }}>Start typing to search brands…</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}