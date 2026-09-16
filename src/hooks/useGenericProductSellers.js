import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGenericProductSellers } from "../utils/api";

const PAGE_SIZE = 30;

export default function useGenericProductSellers(genericProductId) {
    const [brands, setBrandsFilter] = useState([]);
    const [sort, setSort] = useState("relevance");
    const [q, setQ] = useState("");

    const [items, setItems] = useState([]);
    const [facets, setFacets] = useState({ brands: [] });
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const offsetRef = useRef(0);
    const runIdRef = useRef(0);

    const sig = useMemo(() => JSON.stringify({ genericProductId, brands: [...brands].sort(), sort, q: q.trim().toLowerCase() }), [genericProductId, brands, sort, q]);

    const runFetch = useCallback(async (isInitial) => {
        if (!genericProductId) return;
        const runId = ++runIdRef.current;
        if (isInitial) setLoading(true); else setLoadingMore(true);
        setError(null);
        try {
            const res = await fetchGenericProductSellers({
                genericProductId, brands, sort, q,
                limit: PAGE_SIZE, offset: isInitial ? 0 : offsetRef.current,
            });
            if (runId !== runIdRef.current) return;
            if (!res?.success) throw new Error(res?.message || "Request failed");
            setItems((prev) => (isInitial ? res.items : [...prev, ...res.items]));
            setFacets(res.facets);
            setTotal(res.total);
            setHasMore(res.hasMore);
            offsetRef.current = res.nextOffset;
        } catch (err) {
            if (runId !== runIdRef.current) return;
            setError(err?.message || "Couldn't load sellers.");
        } finally {
            if (runId === runIdRef.current) { setLoading(false); setLoadingMore(false); }
        }
    }, [genericProductId, brands, sort, q]);

    useEffect(() => { offsetRef.current = 0; runFetch(true); /* eslint-disable-next-line */ }, [sig]);

    const loadMore = useCallback(() => { if (!hasMore || loading || loadingMore) return; runFetch(false); }, [hasMore, loading, loadingMore, runFetch]);
    const retry = useCallback(() => runFetch(true), [runFetch]);

    return { items, facets, total, loading, loadingMore, error, hasMore, loadMore, retry, brands, setBrandsFilter, sort, setSort, q, setQ };
}