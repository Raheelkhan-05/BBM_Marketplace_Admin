// pages/CategoryProductsPage.jsx
//
// Step 1 of the drill-down: a category's hs_generic_products, as a dense
// scannable list (the "Tally/Zoho item master" look you asked for) rather
// than big shopping cards — the point here is speed of scanning, not
// browsing eye-candy. One network call per query (debounced, cancellable),
// backed by catalog_browse_generic_products which already returns items +
// facets + total in a single round trip.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, ChevronRight, Package, SlidersHorizontal, X } from "lucide-react";
import { fetchCategoryGenericProducts } from "../utils/api";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)", imgBg: "#F4F5F6",
};
const EASE = [0.16, 1, 0.3, 1];
const PAGE_SIZE = 30;
const DEBOUNCE_MS = 200;

const SORTS = [
    { id: "relevance", label: "Relevance" },
    { id: "price_asc", label: "Price: Low to High" },
    { id: "price_desc", label: "Price: High to Low" },
];

function ProductRow({ item, idx, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(idx * 0.015, 0.2), ease: EASE }}
            className="flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors duration-150 hover:bg-black/[0.02] sm:px-4"
            style={{ borderColor: C.hairSoft }}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border" style={{ borderColor: C.hair, background: C.imgBg }}>
                {item.image ? (
                    <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                    <Package className="h-4.5 w-4.5" style={{ color: C.muted }} />
                )}
            </span>

            <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold leading-tight" style={{ color: C.ink }}>{item.name}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: C.muted }}>{item.subcategory_name}</p>
            </div>

            <div className="flex shrink-0 flex-col items-end text-right">
                <p className="text-[13.5px] font-extrabold tabular-nums" style={{ color: item.lowest_price != null ? C.ink : C.muted }}>
                    {item.lowest_price != null ? <>from <span style={{ color: C.primary }}>₹</span>{item.lowest_price}</> : "View price"}
                </p>
                {item.seller_count > 0 && (
                    <p className="mt-0.5 text-[10.5px] font-bold" style={{ color: C.secondary }}>{item.seller_count} sellers</p>
                )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.hair }} />
        </motion.button>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
            <div className="h-3.5 w-14 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

export default function CategoryProductsPage() {
    const { idOrSlug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const categoryHint = location.state?.category; // { id, name, slug } — passed by CategoryStrip/CategoryIconExplorer so this page can paint its header instantly

    const [q, setQ] = useState("");
    const [sort, setSort] = useState("relevance");
    const [activeSubcategory, setActiveSubcategory] = useState(null);
    const [items, setItems] = useState([]);
    const [facets, setFacets] = useState({ subcategories: [] });
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showFilters, setShowFilters] = useState(false);

    const abortRef = useRef(null);
    const debounceRef = useRef(null);

    const runQuery = useCallback((offset, { append }) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        (append ? setLoadingMore : setLoading)(true);

        fetchCategoryGenericProducts(categoryHint?.id || idOrSlug, {
            q, sort, limit: PAGE_SIZE, offset,
            subcategoryIds: activeSubcategory ? [activeSubcategory] : undefined,
            signal: controller.signal,
        })
            .then((res) => {

                if (!res?.success) return;
                setItems((prev) => (append ? [...prev, ...(res.items || [])] : res.items || []));
                setFacets(res.facets || { subcategories: [] });
                setTotal(res.total ?? null);
                setHasMore(!!res.hasMore);

            })
            .catch((err) => { if (err?.name !== "AbortError") setHasMore(false); })
            .finally(() => { setLoading(false); setLoadingMore(false); });
    }, [categoryHint?.id, idOrSlug, q, sort, activeSubcategory]);

    // fresh query whenever the scoping changes — debounced only for free-text search
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runQuery(0, { append: false }), q ? DEBOUNCE_MS : 0);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, sort, activeSubcategory]);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && hasMore && runQuery(items.length, { append: true }),
        { lookahead: 600, disabled: loading || loadingMore || !hasMore }
    );

    const openProduct = (item) => navigate(`/product/${item.slug || item.id}/brands`, { state: { genericProduct: item, category: categoryHint } });

    return (
        <div className="min-h-screen bg-[#FCFBF9]">
            <div className="sticky top-0 z-20 border-b bg-white" style={{ borderColor: C.hair }}>
                <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-4">
                    <div className="flex items-center gap-2.5 pb-3">
                        <button onClick={() => navigate(-1)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
                            <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="truncate text-[16.5px] font-extrabold leading-tight" style={{ color: C.ink }}>
                                {categoryHint?.name || "Category"}
                            </h1>
                            <p className="text-[11px] font-medium" style={{ color: C.muted }}>
                                {total != null ? `${total} products` : "Loading…"}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 pb-3">
                        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border bg-white px-3.5" style={{ borderColor: C.hair }}>
                            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={`Search in ${categoryHint?.name || "this category"}...`}
                                className="w-full min-w-0 bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400"
                            />
                            {q && (
                                <button onClick={() => setQ("")}><X className="h-3.5 w-3.5" style={{ color: C.muted }} /></button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters((v) => !v)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors"
                            style={{ borderColor: C.hair, background: showFilters ? C.secondary : "white", color: showFilters ? "white" : C.ink }}
                        >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden pb-3"
                            >
                                <div className="flex flex-wrap gap-1.5">
                                    {SORTS.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSort(s.id)}
                                            className="rounded-full border px-3 py-1 text-[11px] font-bold"
                                            style={{ borderColor: sort === s.id ? C.secondary : C.hair, color: sort === s.id ? C.secondary : C.muted, background: sort === s.id ? `${C.secondary}0d` : "white" }}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                                {facets.subcategories?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <button
                                            onClick={() => setActiveSubcategory(null)}
                                            className="rounded-full border px-3 py-1 text-[11px] font-bold"
                                            style={{ borderColor: !activeSubcategory ? C.primary : C.hair, color: !activeSubcategory ? C.primary : C.muted, background: !activeSubcategory ? `${C.primary}0d` : "white" }}
                                        >
                                            All ({total ?? "…"})
                                        </button>
                                        {facets.subcategories.map((sc) => (
                                            <button
                                                key={sc.id}
                                                onClick={() => setActiveSubcategory(sc.id === activeSubcategory ? null : sc.id)}
                                                className="rounded-full border px-3 py-1 text-[11px] font-bold"
                                                style={{ borderColor: activeSubcategory === sc.id ? C.primary : C.hair, color: activeSubcategory === sc.id ? C.primary : C.muted, background: activeSubcategory === sc.id ? `${C.primary}0d` : "white" }}
                                            >
                                                {sc.name} ({sc.count})
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="mx-auto max-w-3xl bg-white sm:my-3 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                {loading
                    ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
                    : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                            <Package className="h-6 w-6" style={{ color: C.hair }} />
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>No products match that search</p>
                            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Try a different term or clear filters.</p>
                        </div>
                    ) : (
                        <>
                            {items.map((item, i) => (
                                <ProductRow key={item.id} item={item} idx={i} onClick={() => openProduct(item)} />
                            ))}
                            {loadingMore && <RowSkeleton />}
                        </>
                    )}
                {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}
            </div>
        </div>
    );
}