import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, Tag, Sparkles, Plus, Folder, Pencil, Trash2, FileSpreadsheet, Layers, X, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import {
    adminListCatalog, adminDeleteCatalogEntry, adminSearchCatalogEverywhere,
    adminListUnmappedCatalog, adminGetUnmappedCounts,
} from "../../utils/api.js";
import CreateSimpleCatalogModal from "../../components/CreateSimpleCatalogModal.jsx";
import ExcelUploadModal from "../../components/ExcelUploadModal.jsx";
import ImageLightbox from "../../components/ImageLightbox.jsx";

const LEVEL_BY_DEPTH = ["category", "subcategory", "generic_product", "brand_item"];
const LEVEL_LABEL = { category: "Categories", subcategory: "Subcategories", generic_product: "Generic Products", brand_item: "Brand Items" };
const CHILD_NOUN = { category: "subcategory", subcategory: "generic product", generic_product: "brand item" };
const ADD_LABEL = { category: "category", subcategory: "subcategory", generic_product: "generic product", brand_item: "brand item" };
const BULK_SUPPORTED = new Set(["category", "subcategory", "generic_product", "brand_item"]);
const LEVEL_BADGE = { category: "Category", subcategory: "Subcategory", generic_product: "Generic Product", brand_item: "Brand Item" };
const STATUS_DOT = { approved: "#22c55e", pending_review: "#f59e0b", rejected: "#ef4444" };

// NEW — the three levels that CAN be unmapped (category has no parent
// to be missing, so it's excluded).
const UNMAPPED_LEVELS = ["subcategory", "generic_product", "brand_item"];
const UNMAPPED_TAB_LABEL = { subcategory: "Subcategories", generic_product: "Generic Products", brand_item: "Brand Items" };

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
    const [path, setPath] = useState([]);
    const [q, setQ] = useState("");
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showExcel, setShowExcel] = useState(false);
    const [editEntry, setEditEntry] = useState(null);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [globalSearch, setGlobalSearch] = useState(false);
    const [globalQuery, setGlobalQuery] = useState("");
    const [globalResults, setGlobalResults] = useState([]);
    const [globalLoading, setGlobalLoading] = useState(false);
    const debounceRef = useRef(null);

    // NEW — unmapped-view state. Separate mode from both the normal
    // drill-down and global search, since "unmapped" isn't a node in the
    // hierarchy — it's a cross-cutting view of orphaned rows.
    const [viewingUnmapped, setViewingUnmapped] = useState(false);
    const [unmappedTab, setUnmappedTab] = useState("brand_item");
    const [unmappedEntries, setUnmappedEntries] = useState([]);
    const [unmappedLoading, setUnmappedLoading] = useState(true);
    const [unmappedCounts, setUnmappedCounts] = useState({ subcategory: 0, generic_product: 0, brand_item: 0 });

    const depth = path.length;
    const level = LEVEL_BY_DEPTH[depth];
    const parent = path[depth - 1] || null;

    useEffect(() => {
        if (!token || !level || globalSearch || viewingUnmapped) return;
        let active = true;
        setLoading(true);
        adminListCatalog(token, { level, status: "all", q, parentId: parent?.id }).then((res) => {
            if (active && res?.success) setEntries(res.entries ?? []);
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [level, parent?.id, q, token, refreshKey, globalSearch, viewingUnmapped]);

    useEffect(() => {
        if (!globalSearch || !token) return;
        if (globalQuery.trim().length < 2) {
            setGlobalResults([]);
            setGlobalLoading(false);
            return;
        }
        setGlobalLoading(true);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const res = await adminSearchCatalogEverywhere(token, globalQuery.trim());
            setGlobalResults(res?.success ? res.results : []);
            setGlobalLoading(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [globalQuery, globalSearch, token]);

    // NEW — badge counts, fetched once on mount and refreshed whenever
    // anything changes (create/delete/map), so the root tile always
    // reflects reality without the admin needing to open it first.
    useEffect(() => {
        if (!token) return;
        adminGetUnmappedCounts(token).then((res) => {
            if (res?.success) setUnmappedCounts(res.counts);
        });
    }, [token, refreshKey]);

    // NEW — load the active tab's unmapped list whenever we're in that
    // view or the tab changes.
    useEffect(() => {
        if (!viewingUnmapped || !token) return;
        let active = true;
        setUnmappedLoading(true);
        adminListUnmappedCatalog(token, unmappedTab).then((res) => {
            if (active && res?.success) setUnmappedEntries(res.entries ?? []);
            if (active) setUnmappedLoading(false);
        });
        return () => { active = false; };
    }, [viewingUnmapped, unmappedTab, token, refreshKey]);

    function drillInto(entry) {
        setPath((p) => [...p, { level, id: entry.id, name: entry.name }]);
        setQ("");
    }
    function goToCrumb(i) {
        setPath((p) => p.slice(0, i + 1));
        setQ("");
    }
    function refresh() { setRefreshKey((k) => k + 1); }

    function openUnmapped() {
        setViewingUnmapped(true);
        setGlobalSearch(false);
        setPath([]);
    }
    function closeUnmapped() {
        setViewingUnmapped(false);
    }

    function jumpToResult(hit) {
        if (hit.level === "brand_item") {
            navigate(`/catalog/brand_item/${hit.id}`);
            return;
        }
        setPath(hit.path.map((p) => ({ level: p.level, id: p.id, name: p.name })));
        setGlobalSearch(false);
        setGlobalQuery("");
        setGlobalResults([]);
    }

    // NEW — an unmapped row of any level opens the detail page, which
    // already renders the "needs mapping" banner + CascadingHierarchyPicker
    // for fixing it, and (once added) the delete button for removing it
    // outright instead of mapping it.
    function openUnmappedEntry(entry) {
        navigate(`/catalog/${unmappedTab}/${entry.id}`);
    }

    async function handleDelete(entry, entryLevel = level) {
        if (!window.confirm(`Delete "${entry.name}"? This will also remove everything nested under it (subcategories, generic products, brand items) from view.`)) return;
        const res = await adminDeleteCatalogEntry(token, entryLevel, entry.id);
        if (!res?.success) return alert(res?.message || "Couldn't delete that.");
        refresh();
    }

    const totalUnmapped = unmappedCounts.subcategory + unmappedCounts.generic_product + unmappedCounts.brand_item;

    if (!level) return null;

    return (
        <div className="mx-auto min-h-screen max-w-5xl px-4 pb-24 pt-6 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-[20px] font-extrabold text-slate-900 sm:text-[22px]">Catalog</h1>
                    {!globalSearch && !viewingUnmapped && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[12.5px] font-semibold text-slate-400">
                            <button onClick={() => setPath([])} className={depth === 0 ? "text-[#047084]" : "hover:text-slate-600"}>All categories</button>
                            {path.map((c, i) => (
                                <span key={c.id} className="flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3" />
                                    <button onClick={() => goToCrumb(i)} className={i === depth - 1 ? "text-[#047084]" : "hover:text-slate-600"}>{c.name}</button>
                                </span>
                            ))}
                        </div>
                    )}
                    {globalSearch && (
                        <p className="mt-1.5 text-[12.5px] font-semibold text-slate-400">Searching across every category, subcategory, generic product &amp; brand item</p>
                    )}
                    {viewingUnmapped && (
                        <p className="mt-1.5 text-[12.5px] font-semibold text-slate-400">Items with no category / subcategory / generic-product parent set</p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {!viewingUnmapped && (
                        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100 sm:flex-none">
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                                value={globalSearch ? globalQuery : q}
                                onChange={(e) => (globalSearch ? setGlobalQuery(e.target.value) : setQ(e.target.value))}
                                placeholder={globalSearch ? "Search entire catalog…" : `Search ${LEVEL_LABEL[level].toLowerCase()}…`}
                                className="w-full bg-transparent text-[13px] font-medium focus:outline-none sm:w-48"
                            />
                            {globalSearch && globalQuery && (
                                <button onClick={() => setGlobalQuery("")} className="shrink-0 text-slate-300 hover:text-slate-500">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {!viewingUnmapped && (
                        <button
                            onClick={() => { setGlobalSearch((v) => !v); setGlobalQuery(""); setGlobalResults([]); }}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-[13px] font-bold transition-colors ${globalSearch ? "border-[#047084]/30 bg-[#047084]/10 text-[#047084]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                            <Layers className="h-4 w-4" /> {globalSearch ? "Searching all" : "Search all"}
                        </button>
                    )}

                    {/* NEW — Unmapped toggle, always visible regardless of mode */}
                    <button
                        onClick={() => (viewingUnmapped ? closeUnmapped() : openUnmapped())}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-[13px] font-bold transition-colors ${viewingUnmapped ? "border-amber-300 bg-amber-50 text-amber-700" : totalUnmapped > 0 ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                        <AlertTriangle className="h-4 w-4" />
                        {viewingUnmapped ? "Back to catalog" : `Unmapped${totalUnmapped > 0 ? ` (${totalUnmapped})` : ""}`}
                    </button>

                    {!globalSearch && !viewingUnmapped && BULK_SUPPORTED.has(level) && (
                        <button onClick={() => setShowExcel(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50">
                            <FileSpreadsheet className="h-4 w-4" /> Bulk upload
                        </button>
                    )}
                    {!globalSearch && !viewingUnmapped && (
                        <button onClick={() => setShowCreate(true)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#047084]/20 transition-transform hover:scale-[1.02]">
                            <Plus className="h-4 w-4" /> Add {ADD_LABEL[level]}
                        </button>
                    )}
                </div>
            </div>

            {/* NEW — Unmapped tabbed view */}
            {viewingUnmapped ? (
                <>
                    <div className="mt-6 flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
                        {UNMAPPED_LEVELS.map((lvl) => (
                            <button
                                key={lvl}
                                onClick={() => setUnmappedTab(lvl)}
                                className={`flex-1 rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors ${unmappedTab === lvl ? "bg-white text-[#047084] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                                {UNMAPPED_TAB_LABEL[lvl]}
                                {unmappedCounts[lvl] > 0 && (
                                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] ${unmappedTab === lvl ? "bg-[#047084]/10 text-[#047084]" : "bg-slate-200 text-slate-500"}`}>
                                        {unmappedCounts[lvl]}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white shadow-sm shadow-slate-100/60">
                        {unmappedLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
                        {!unmappedLoading && unmappedEntries.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-14 text-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                                    <Layers className="h-5 w-5 text-emerald-400" />
                                </div>
                                <p className="text-[13px] font-bold text-slate-500">Nothing unmapped here</p>
                                <p className="text-[12px] font-medium text-slate-400">Every {UNMAPPED_TAB_LABEL[unmappedTab].toLowerCase()} has a parent set.</p>
                            </div>
                        )}
                        <AnimatePresence initial={false}>
                            {!unmappedLoading && unmappedEntries.map((e) => (
                                <motion.div key={e.id}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="group flex w-full items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
                                    <button
                                        onClick={(ev) => { ev.stopPropagation(); if (e.image) setLightboxSrc(e.image); }}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-100"
                                    >
                                        {e.image ? <img src={e.image} alt="" className="h-full w-full object-cover" /> : <Tag className="h-5 w-5 text-slate-300" />}
                                    </button>
                                    <button onClick={() => openUnmappedEntry(e)} className="min-w-0 flex-1 text-left">
                                        <div className="flex items-center gap-1.5">
                                            <p className="truncate text-[14px] font-bold text-slate-900">{e.name}</p>
                                            {e.is_ai_generated && <Sparkles className="h-3 w-3 shrink-0 text-[#047084]" />}
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[e.review_status] || STATUS_DOT.pending_review }} />
                                        </div>
                                        <p className="text-[12px] font-medium text-slate-400">
                                            {unmappedTab === "brand_item" && e.brand_name ? e.brand_name : "Tap to map or edit"}
                                        </p>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button onClick={() => openUnmappedEntry(e)}
                                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Edit / Map">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(e, unmappedTab)}
                                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-[#c71f11]" aria-label="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            ) : globalSearch ? (
                <>
                    <p className="mt-6 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {globalQuery.trim().length < 2 ? "Type at least 2 characters" : `Results for "${globalQuery.trim()}"`}
                    </p>
                    <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white shadow-sm shadow-slate-100/60">
                        {globalLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
                        {!globalLoading && globalQuery.trim().length >= 2 && globalResults.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-14 text-center">
                                <Search className="h-5 w-5 text-slate-300" />
                                <p className="text-[13px] font-bold text-slate-500">No matches anywhere in the catalog</p>
                            </div>
                        )}
                        <AnimatePresence initial={false}>
                            {!globalLoading && globalResults.map((hit) => (
                                <motion.button
                                    key={`${hit.level}-${hit.id}`}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    onClick={() => jumpToResult(hit)}
                                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-slate-50"
                                >
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-100">
                                        {hit.image ? <img src={hit.image} alt="" className="h-full w-full object-cover" /> : <Tag className="h-5 w-5 text-slate-300" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <p className="truncate text-[14px] font-bold text-slate-900">{hit.name}</p>
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[hit.review_status] || STATUS_DOT.pending_review }} />
                                        </div>
                                        <p className="truncate text-[12px] font-medium text-slate-400">
                                            <span className="font-bold text-slate-500">{LEVEL_BADGE[hit.level]}</span>
                                            {hit.path.length > 0 ? " · " + hit.path.map((p) => p.name).join(" / ") : (
                                                <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700">Unmapped</span>
                                            )}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                                </motion.button>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            ) : (
                <>
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
                                                    setPath((p) => [...p, { level, id: e.id, name: e.name }]);
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
                </>
            )}

            {!globalSearch && !viewingUnmapped && (
                <motion.button onClick={() => setShowCreate(true)} whileTap={{ scale: 0.92 }}
                    className="fixed bottom-5 right-5 flex items-center justify-center rounded-full bg-[#047084] text-white shadow-lg shadow-[#047084]/30 sm:hidden"
                    style={{ height: 52, width: 52 }}>
                    <Plus className="h-6 w-6" />
                </motion.button>
            )}

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
        </div>
    );
}