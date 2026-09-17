// pages/admin/AdminBrandsPage.jsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ImagePlus, Loader2, Pencil, X, Check, Tag } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminListBrands, adminUpdateBrand } from "../../utils/api.js";
import { uploadSellerFile } from "../../utils/api.js";

function SkeletonRow() {
    return (
        <div className="flex animate-pulse items-center gap-3.5 px-4 py-3.5">
            <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" />
            <div className="h-3 w-1/3 rounded bg-slate-100" />
        </div>
    );
}

function EditBrandRow({ brand, token, onDone, onCancel }) {
    const [name, setName] = useState(brand.brand_name);
    const [image, setImage] = useState(brand.brand_image);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const fileRef = useRef(null);

    async function handleFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError("");
        try {
            const res = await uploadSellerFile(token, file, "brands");
            if (res?.success) setImage(res.url);
            else setError(res?.message || "Upload failed.");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    }

    async function handleSave(confirmMerge = false) {
        setSaving(true);
        setError("");
        const res = await adminUpdateBrand(token, brand.brand_name, {
            newName: name.trim(),
            brandImage: image,
            confirmMerge,
        });
        setSaving(false);
        if (res?.mergeConflict) {
            if (window.confirm(res.message + "\n\nProceed and merge?")) {
                return handleSave(true);
            }
            return;
        }
        if (!res?.success) return setError(res?.message || "Couldn't save.");
        onDone();
    }

    return (
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-4 last:border-b-0">
            <div className="flex items-center gap-3.5">
                <button type="button" onClick={() => fileRef.current?.click()}
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> :
                        image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-slate-300" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-[#047084]/30"
                    placeholder="Brand name"
                />

                <button onClick={() => fileRef.current?.click()}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-50">
                    Change logo
                </button>
                {image && (
                    <button onClick={() => setImage(null)}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-400 hover:bg-red-50 hover:text-[#c71f11]">
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {error && <p className="text-[12px] font-semibold text-[#c71f11]">{error}</p>}

            <div className="flex items-center justify-end gap-2">
                <button onClick={onCancel} className="rounded-lg px-3 py-2 text-[12.5px] font-bold text-slate-500 hover:bg-slate-100">
                    Cancel
                </button>
                <button onClick={() => handleSave(false)} disabled={saving || uploading || name.trim().length < 2}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                </button>
            </div>
        </div>
    );
}

export default function AdminBrandsPage() {
    const { token } = useAuth();
    const [q, setQ] = useState("");
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // brand_name currently being edited
    const [refreshKey, setRefreshKey] = useState(0);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            adminListBrands(token, q).then((res) => {
                if (res?.success) setBrands(res.brands);
                setLoading(false);
            });
        }, q ? 300 : 0);
        return () => clearTimeout(debounceRef.current);
    }, [token, q, refreshKey]);

    function refresh() {
        setEditing(null);
        setRefreshKey((k) => k + 1);
    }

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-[20px] font-extrabold text-slate-900 sm:text-[22px]">Brands</h1>
                    <p className="mt-1.5 text-[12.5px] font-semibold text-slate-400">
                        Rename a brand or update its logo — applies to every brand item using it.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search brands…"
                        className="w-full bg-transparent text-[13px] font-medium focus:outline-none sm:w-56"
                    />
                </div>
            </div>

            <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white shadow-sm shadow-slate-100/60">
                {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

                {!loading && brands.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <Tag className="h-5 w-5 text-slate-300" />
                        <p className="text-[13px] font-bold text-slate-500">No brands found</p>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {!loading && brands.map((b) =>
                        editing === b.brand_name ? (
                            <EditBrandRow key={b.brand_name} brand={b} token={token} onDone={refresh} onCancel={() => setEditing(null)} />
                        ) : (
                            <motion.div key={b.brand_name}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="group flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-100">
                                    {b.brand_image ? <img src={b.brand_image} alt="" className="h-full w-full object-cover" /> : <Tag className="h-5 w-5 text-slate-300" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-bold text-slate-900">{b.brand_name}</p>
                                    <p className="text-[12px] font-medium text-slate-400">{b.item_count} item{b.item_count === 1 ? "" : "s"}</p>
                                </div>
                                <button onClick={() => setEditing(b.brand_name)}
                                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Edit brand">
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            </motion.div>
                        )
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}