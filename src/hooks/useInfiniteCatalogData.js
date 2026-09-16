import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 20;

export default function useInfiniteCatalogData(fetchPage, deps) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);       // initial load
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const fetchPageRef = useRef(fetchPage);
    fetchPageRef.current = fetchPage;
    const offsetRef = useRef(0);
    const runIdRef = useRef(0);

    // Mirror the latest state in refs so loadMore can read fresh values
    // without needing them in its dependency array — that's what kept
    // recreating loadMore's identity and re-triggering the observer.
    const hasMoreRef = useRef(true);
    const loadingRef = useRef(true);
    const loadingMoreRef = useRef(false);
    hasMoreRef.current = hasMore;
    loadingRef.current = loading;
    loadingMoreRef.current = loadingMore;

    // IMPORTANT: staleness is decided purely by comparing `runId` to
    // `runIdRef.current` when the fetch resolves — NOT by a shared
    // "is anything in flight" flag. A shared in-flight flag caused a
    // deadlock under React 18 StrictMode's dev-only double effect
    // invocation: the first invocation starts a real request and marks
    // "in flight"; the second (current) invocation's loadPage call got
    // silently skipped because the flag was still set from the first;
    // the first request then resolved, saw its runId was stale, and
    // discarded itself — so nothing ever cleared `loading`, forever.
    // Letting every generation's request actually fire, and discarding
    // only by runId comparison on resolve, avoids that trap.
    const loadPage = useCallback(async (isInitial) => {
        const runId = runIdRef.current;
        if (isInitial) {
            setLoading(true);
            loadingRef.current = true;
        } else {
            setLoadingMore(true);
            loadingMoreRef.current = true;
        }
        setError(null);

        try {
            const res = await fetchPageRef.current(offsetRef.current, PAGE_SIZE);
            if (runId !== runIdRef.current) return; // a newer run started — drop this result
            const newItems = res?.items || [];

            setItems((prev) => {
                if (isInitial) return newItems;
                // Guard against duplicate ids if a page ever overlaps
                const seen = new Set(prev.map((p) => p.id));
                return [...prev, ...newItems.filter((n) => !seen.has(n.id))];
            });

            const nextHasMore = Boolean(res?.hasMore);
            setHasMore(nextHasMore);
            hasMoreRef.current = nextHasMore;

            // If the backend didn't tell us the next offset (e.g. a
            // non-paginated endpoint), fall back to advancing by however
            // many items came back so we don't loop on the same page.
            offsetRef.current = res?.nextOffset ?? offsetRef.current + newItems.length;

            // Safety valve: if a "page" came back with hasMore true but
            // zero new items, stop instead of looping forever.
            if (nextHasMore && newItems.length === 0) {
                setHasMore(false);
                hasMoreRef.current = false;
            }
        } catch (err) {
            if (runId !== runIdRef.current) return;
            setError(err?.message || "Something went wrong loading this page.");
        } finally {
            if (runId === runIdRef.current) {
                setLoading(false);
                setLoadingMore(false);
                loadingRef.current = false;
                loadingMoreRef.current = false;
            }
        }
    }, []);

    // Reset + reload whenever deps (e.g. parent id) change
    useEffect(() => {
        runIdRef.current += 1;
        offsetRef.current = 0;
        setItems([]);
        setHasMore(true);
        hasMoreRef.current = true;
        loadPage(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    // Stable identity — reads latest state from refs instead of deps,
    // so it never changes and the IntersectionObserver effect that uses
    // it never has to tear down and re-attach mid-scroll.
    const loadMore = useCallback(() => {
        if (!hasMoreRef.current || loadingRef.current || loadingMoreRef.current) return;
        loadPage(false);
    }, [loadPage]);

    const retry = useCallback(() => {
        runIdRef.current += 1;
        offsetRef.current = 0;
        setItems([]);
        setHasMore(true);
        hasMoreRef.current = true;
        loadPage(true);
    }, [loadPage]);

    return { items, loading, loadingMore, error, hasMore, loadMore, retry };
}