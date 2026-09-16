import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, Tag, Sparkles, Plus, Folder, Pencil, Trash2, FileSpreadsheet, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminListCatalog, adminDeleteCatalogEntry } from "../../utils/api.js";
import CreateSimpleCatalogModal from "../../components/CreateSimpleCatalogModal.jsx";
import ExcelUploadModal from "../../components/ExcelUploadModal.jsx";
import ImageLightbox from "../../components/ImageLightbox.jsx";

// Drill-down: Category -> Subcategory -> Generic Product -> Brand Item.
// `path` holds the crumbs picked so far; the level currently being
// browsed is derived from its length. brand_item is the new leaf level.
const LEVEL_BY_DEPTH = ["category", "subcategory", "generic_product", "brand_item"];
const LEVEL_LABEL = { category: "Categories", subcategory: "Subcategories", generic_product: "Generic Products", brand_item: "Brand Items" };
const CHILD_NOUN = { category: "subcategory", subcategory: "generic product", generic_product: "brand item" };
const ADD_LABEL = { category: "category", subcategory: "subcategory", generic_product: "generic product", brand_item: "brand item" };
const BULK_SUPPORTED = new Set(["category", "subcategory", "generic_product", "brand_item"]);

function SkeletonRow() {
    return (
        <div className="flex animate-pulse items-center gap-3.5 px-4 py-3.5">
            <div className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" />
            <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-2.5 w-1/4 rounded bg-slate-100" />
            </div>
        </div>
    );
}

export default function AdminCatalogReviewPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [path, setPath] = useState([]); // [{level, id, name}]
    const [q, setQ] = useState("");
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showExcel, setShowExcel] = useState(false);
    const [editEntry, setEditEntry] = useState(null);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const depth = path.length;
    const level = LEVEL_BY_DEPTH[depth];
    const parent = path[depth - 1] || null;

    useEffect(() => {
        if (!token || !level) return;
        let active = true;
        setLoading(true);
        adminListCatalog(token, { level, status: "all", q, parentId: parent?.id }).then((res) => {
            if (active && res?.success) setEntries(res.entries ?? []);   // ← guard here
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [level, parent?.id, q, token, refreshKey]);

    function drillInto(entry) {
        setPath((p) => [...p, { level, id: entry.id, name: entry.name }]);
        setQ("");
    }
    function goToCrumb(i) {
        setPath((p) => p.slice(0, i + 1));
        setQ("");
    }
    function refresh() { setRefreshKey((k) => k + 1); }

    async function handleDelete(entry) {
        if (!window.confirm(`Delete "${entry.name}"? This can't be undone.`)) return;
        const res = await adminDeleteCatalogEntry(token, level, entry.id);
        if (!res?.success) return alert(res?.message || "Couldn't delete that.");
        refresh();
    }

    if (!level) return null;

    return (
        <div className="mx-auto min-h-screen max-w-5xl px-4 pb-24 pt-6 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-[20px] font-extrabold text-slate-900 sm:text-[22px]">Catalog</h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[12.5px] font-semibold text-slate-400">
                        <button onClick={() => setPath([])} className={depth === 0 ? "text-[#047084]" : "hover:text-slate-600"}>All categories</button>
                        {path.map((c, i) => (
                            <span key={c.id} className="flex items-center gap-1">
                                <ChevronRight className="h-3 w-3" />
                                <button onClick={() => goToCrumb(i)} className={i === depth - 1 ? "text-[#047084]" : "hover:text-slate-600"}>{c.name}</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100 sm:flex-none">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${LEVEL_LABEL[level].toLowerCase()}…`} className="w-full bg-transparent text-[13px] font-medium focus:outline-none sm:w-48" />
                    </div>
                    {BULK_SUPPORTED.has(level) && (
                        <button onClick={() => setShowExcel(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50">
                            <FileSpreadsheet className="h-4 w-4" /> Bulk upload
                        </button>
                    )}
                    <button onClick={() => setShowCreate(true)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#047084]/20 transition-transform hover:scale-[1.02]">
                        <Plus className="h-4 w-4" /> Add {ADD_LABEL[level]}
                    </button>
                </div>
            </div>

            <p className="mt-6 text-[11px] font-bold uppercase tracking-wide text-slate-400">{LEVEL_LABEL[level]}</p>

            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white shadow-sm shadow-slate-100/60">
                {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
                {!loading && (entries?.length ?? 0) === 0 && (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50">
                            {level === "category" ? <Folder className="h-5 w-5 text-slate-300" /> : <Tag className="h-5 w-5 text-slate-300" />}
                        </div>
                        <p className="text-[13px] font-bold text-slate-500">Nothing here yet</p>
                        <p className="text-[12px] font-medium text-slate-400">Add one, or try a different search.</p>
                    </div>
                )}
                <AnimatePresence initial={false}>
                    {!loading && entries?.map((e) => {
                        const isLeaf = level === "brand_item";
                        return (
                            <motion.div key={e.id}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="group flex w-full items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
                                <button
                                    onClick={(ev) => { ev.stopPropagation(); if (e.image) setLightboxSrc(e.image); }}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-100"
                                >
                                    {e.image ? <img src={e.image} alt="" className="h-full w-full object-cover" /> : <Tag className="h-5 w-5 text-slate-300" />}
                                </button>

                                <button
                                    onClick={(ev) => {
                                        if (level === "generic_product") {
                                            ev.stopPropagation();
                                            setPath((p) => [
                                                ...p,
                                                { level, id: e.id, name: e.name },
                                            ]);
                                        } else if (!isLeaf) {
                                            drillInto(e);
                                        } else {
                                            setEditEntry(e);
                                        }
                                    }}
                                    className="min-w-0 flex-1 text-left"
                                >

                                    <div className="flex items-center gap-1.5">
                                        <p className="truncate text-[14px] font-bold text-slate-900">{e.name}</p>
                                        {e.is_ai_generated && <Sparkles className="h-3 w-3 shrink-0 text-[#047084]" />}
                                    </div>
                                    {level === "generic_product" && <p className="text-[12px] font-medium text-slate-400">Tap to open details</p>}
                                    {level !== "generic_product" && !isLeaf && <p className="text-[12px] font-medium text-slate-400">Tap to open {CHILD_NOUN[level]} list</p>}
                                    {isLeaf && <p className="text-[12px] font-medium text-slate-400">{e.brand_name}</p>}
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={(ev) => { ev.stopPropagation(); setEditEntry(e); }}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Edit">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-[#c71f11]" aria-label="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                {!isLeaf && level !== "generic_product" && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <motion.button onClick={() => setShowCreate(true)} whileTap={{ scale: 0.92 }}
                className="fixed bottom-5 right-5 flex items-center justify-center rounded-full bg-[#047084] text-white shadow-lg shadow-[#047084]/30 sm:hidden"
                style={{ height: 52, width: 52 }}>
                <Plus className="h-6 w-6" />
            </motion.button>

            {
                <CreateSimpleCatalogModal
                    token={token}
                    isOpen={showCreate || !!editEntry}
                    onClose={() => { setShowCreate(false); setEditEntry(null); }}
                    level={level}
                    parentId={parent?.id}
                    editEntry={editEntry}
                    onCreated={refresh}
                    onUpdated={refresh}
                />

            }

            <ExcelUploadModal
                token={token}
                isOpen={showExcel}
                onClose={() => setShowExcel(false)}
                level={level}
                label={LEVEL_LABEL[level]}
                parentId={parent?.id}
                onDone={refresh}
            />

            {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}
        </div >
    );
}