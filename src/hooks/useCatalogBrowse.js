import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCatalogBrowse } from "../utils/api";

const PAGE_SIZE = 24;
const QUERY_DEBOUNCE_MS = 200;

// Small session-lifetime cache keyed by the exact filter signature, so
// hitting "back" after opening a brand item — or re-toggling a filter you
// already had on — renders instantly instead of re-fetching. Capped so it
// can't grow unbounded over a long browsing session.
const responseCache = new Map();
const CACHE_CAP = 40;
function cacheSet(key, value) {
    responseCache.set(key, value);
    if (responseCache.size > CACHE_CAP) {
        const oldest = responseCache.keys().next().value;
        responseCache.delete(oldest);
    }
}

function signatureFor(filters, hasToken) {
    return JSON.stringify({
        categoryId: filters.categoryId || null,
        subcategoryIds: [...filters.subcategoryIds].sort(),
        genericProductIds: [...filters.genericProductIds].sort(),
        brands: [...filters.brands].sort(),
        q: filters.q.trim().toLowerCase(),
        sort: filters.sort,
        hasToken, // added — separates "as seller" results from anonymous ones
    });
}

export const DEFAULT_FILTERS = {
    categoryId: null,
    subcategoryIds: [],
    genericProductIds: [],
    brands: [],
    q: "",
    sort: "relevance",
};

// `initialFilters` typically just seeds categoryId (from the category tile
// the user clicked) and/or q (from a global search). Everything else the
// user drives live via setFilters — every change here refetches, but the
// debounce + cache + abort-on-supersede below is what keeps that feeling
// instant rather than janky.
export default function useCatalogBrowse(initialFilters = {}, token = null) {
    const [filters, setFiltersState] = useState({ ...DEFAULT_FILTERS, ...initialFilters });
    const [debouncedQ, setDebouncedQ] = useState(filters.q);

    const [items, setItems] = useState([]);
    const [facets, setFacets] = useState({ subcategories: [], products: [], brands: [] });
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const abortRef = useRef(null);
    const offsetRef = useRef(0);
    const runIdRef = useRef(0);

    // Debounce only the free-text query — chip toggles (subcategory,
    // product, brand, sort) should feel immediate, since those are
    // deliberate taps, not keystrokes.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(filters.q), QUERY_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [filters.q]);

    const effectiveFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
    const sig = useMemo(() => signatureFor(effectiveFilters, !!token), [effectiveFilters, token]);


    const runFetch = useCallback(async (isInitial) => {
        const runId = ++runIdRef.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (isInitial) setLoading(true); else setLoadingMore(true);
        setError(null);

        const cacheKey = isInitial ? sig : null;
        if (isInitial && responseCache.has(cacheKey)) {
            // Instant paint from cache, then silently revalidate below.
            const cached = responseCache.get(cacheKey);
            setItems(cached.items);
            setFacets(cached.facets);
            setTotal(cached.total);
            setHasMore(cached.hasMore);
            offsetRef.current = cached.nextOffset;
            setLoading(false);
        }

        try {
            const res = await fetchCatalogBrowse(
                {
                    categoryId: effectiveFilters.categoryId,
                    subcategoryIds: effectiveFilters.subcategoryIds,
                    genericProductIds: effectiveFilters.genericProductIds,
                    brands: effectiveFilters.brands,
                    q: effectiveFilters.q,
                    sort: effectiveFilters.sort,
                    limit: PAGE_SIZE,
                    offset: isInitial ? 0 : offsetRef.current,
                },
                controller.signal,
                token
            );
            if (runId !== runIdRef.current) return; // superseded by a newer filter change
            if (!res?.success) throw new Error(res?.message || "Request failed");

            setItems((prev) => (isInitial ? res.items : [...prev, ...res.items]));
            setFacets(res.facets);
            setTotal(res.total);
            setHasMore(res.hasMore);
            offsetRef.current = res.nextOffset;

            if (isInitial) cacheSet(sig, res);
        } catch (err) {
            if (err?.name === "AbortError") return;
            if (runId !== runIdRef.current) return;
            setError(err?.message || "Something went wrong loading these results.");
        } finally {
            if (runId === runIdRef.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [sig, effectiveFilters, token]);

    // Refetch from the top whenever the filter signature changes.
    useEffect(() => {
        offsetRef.current = 0;
        runFetch(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig]);

    const loadMore = useCallback(() => {
        if (!hasMore || loading || loadingMore) return;
        runFetch(false);
    }, [hasMore, loading, loadingMore, runFetch]);

    const retry = useCallback(() => runFetch(true), [runFetch]);

    // Partial updates so callers can do e.g. toggleBrand without re-stating
    // the whole filter object.
    const setFilters = useCallback((patch) => {
        setFiltersState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
    }, []);

    return { filters, setFilters, items, facets, total, loading, loadingMore, error, hasMore, loadMore, retry };
}