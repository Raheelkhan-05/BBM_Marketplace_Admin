import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGenericProductBrowse } from "../utils/api";

const PAGE_SIZE = 24;
const QUERY_DEBOUNCE_MS = 200;

export const DEFAULT_PRODUCT_FILTERS = { categoryId: null, subcategoryIds: [], q: "", sort: "relevance" };

// Mirrors useCatalogBrowse's shape exactly (same field names) so
// BrowsePage can treat both hooks interchangeably — this one just talks
// to /browse-products (Generic Products) instead of /browse (Brand Items),
// and has one fewer filter dimension (no product/brand chips at this level).
export default function useGenericProductBrowse(initialFilters = {}, token = null) {
    const [filters, setFiltersState] = useState({ ...DEFAULT_PRODUCT_FILTERS, ...initialFilters });
    const [debouncedQ, setDebouncedQ] = useState(filters.q);

    const [items, setItems] = useState([]);
    const [facets, setFacets] = useState({ subcategories: [] });
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const abortRef = useRef(null);
    const offsetRef = useRef(0);
    const runIdRef = useRef(0);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(filters.q), QUERY_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [filters.q]);

    const effectiveFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
    const sig = useMemo(() => JSON.stringify({
        categoryId: effectiveFilters.categoryId || null,
        subcategoryIds: [...effectiveFilters.subcategoryIds].sort(),
        q: effectiveFilters.q.trim().toLowerCase(),
        sort: effectiveFilters.sort,
        hasToken: !!token,
    }), [effectiveFilters, token]);

    const runFetch = useCallback(async (isInitial) => {
        const runId = ++runIdRef.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        if (isInitial) setLoading(true); else setLoadingMore(true);
        setError(null);
        try {
            const res = await fetchGenericProductBrowse({
                categoryId: effectiveFilters.categoryId,
                subcategoryIds: effectiveFilters.subcategoryIds,
                q: effectiveFilters.q,
                sort: effectiveFilters.sort,
                limit: PAGE_SIZE,
                offset: isInitial ? 0 : offsetRef.current,
            }, controller.signal, token);
            if (runId !== runIdRef.current) return;
            if (!res?.success) throw new Error(res?.message || "Request failed");
            setItems((prev) => (isInitial ? res.items : [...prev, ...res.items]));
            setFacets(res.facets);
            setTotal(res.total);
            setHasMore(res.hasMore);
            offsetRef.current = res.nextOffset;
        } catch (err) {
            if (err?.name === "AbortError") return;
            if (runId !== runIdRef.current) return;
            setError(err?.message || "Something went wrong loading these results.");
        } finally {
            if (runId === runIdRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [effectiveFilters, token]);

    useEffect(() => { offsetRef.current = 0; runFetch(true); /* eslint-disable-next-line */ }, [sig]);

    const loadMore = useCallback(() => { if (!hasMore || loading || loadingMore) return; runFetch(false); }, [hasMore, loading, loadingMore, runFetch]);
    const retry = useCallback(() => runFetch(true), [runFetch]);
    const setFilters = useCallback((patch) => setFiltersState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })), []);

    return { filters, setFilters, items, facets, total, loading, loadingMore, error, hasMore, loadMore, retry };
}