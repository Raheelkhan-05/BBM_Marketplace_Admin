import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFollowedIds, followBrandItem, unfollowBrandItem } from "../utils/api";

/**
 * Optimistic follow state.
 * - UI flips instantly.
 * - Requests for the SAME product are chained, so they reach the server in
 *   tap order (last tap wins). Both endpoints are idempotent.
 * - If the LAST queued request for a product fails, we roll that product
 *   back to its last server-confirmed value and call onRevert.
 */
export default function useFollowedItems(token, { onRevert } = {}) {
    const [ids, setIds] = useState(() => new Set());
    const [ready, setReady] = useState(false);

    const idsRef = useRef(new Set());        // optimistic (what the UI shows)
    const confirmedRef = useRef(new Set());  // last known server state
    const pendingRef = useRef(new Map());    // key -> in-flight/queued op count
    const chainRef = useRef(new Map());      // key -> promise chain
    const tokenRef = useRef(token);
    const onRevertRef = useRef(onRevert);
    tokenRef.current = token;
    onRevertRef.current = onRevert;

    // Reads the live optimistic set (never stale, unlike isFollowed inside old closures).
    const isFollowedNow = useCallback((id) => idsRef.current.has(String(id)), []);

    // Resolves once every queued follow/unfollow request has reached the server.
    const settle = useCallback(() => Promise.all([...chainRef.current.values()]), []);


    const publish = useCallback((next) => { idsRef.current = next; setIds(next); }, []);

    // (Re)load whenever the signed-in user changes.
    useEffect(() => {
        pendingRef.current = new Map();
        chainRef.current = new Map();
        confirmedRef.current = new Set();
        publish(new Set());
        setReady(false);
        if (!token) return;

        const controller = new AbortController();
        fetchFollowedIds(token, controller.signal)
            .then((res) => {
                if (controller.signal.aborted || !res?.success) return;
                const server = new Set((res.ids || []).map(String));
                confirmedRef.current = new Set(server);
                // Keep any toggle the user made while this was loading.
                const merged = new Set(server);
                for (const [key, count] of pendingRef.current) {
                    if (count > 0) {
                        if (idsRef.current.has(key)) merged.add(key); else merged.delete(key);
                    }
                }
                publish(merged);
            })
            .catch(() => { /* leave empty; pin still works, next toggle re-syncs */ })
            .finally(() => { if (!controller.signal.aborted) setReady(true); });

        return () => controller.abort();
    }, [token, publish]);

    const isFollowed = useCallback((id) => ids.has(String(id)), [ids]);

    // Returns the NEW desired state (true = now following).
    const toggle = useCallback((id) => {
        const key = String(id);
        const t = tokenRef.current;
        if (!t) return null;

        const want = !idsRef.current.has(key);
        const next = new Set(idsRef.current);
        if (want) next.add(key); else next.delete(key);
        publish(next);

        pendingRef.current.set(key, (pendingRef.current.get(key) || 0) + 1);

        const run = async () => {
            let ok = false;
            try {
                const res = want ? await followBrandItem(t, key) : await unfollowBrandItem(t, key);
                ok = !!res?.success;
            } catch { ok = false; }

            if (tokenRef.current !== t) return; // user changed; ignore
            const remaining = (pendingRef.current.get(key) || 1) - 1;
            pendingRef.current.set(key, remaining);

            if (ok) {
                if (want) confirmedRef.current.add(key); else confirmedRef.current.delete(key);
            } else if (remaining === 0) {
                const revert = new Set(idsRef.current);
                if (confirmedRef.current.has(key)) revert.add(key); else revert.delete(key);
                publish(revert);
                onRevertRef.current?.(key, confirmedRef.current.has(key));
            }
        };

        chainRef.current.set(key, (chainRef.current.get(key) || Promise.resolve()).then(run));
        return want;
    }, [publish]);

    return { isFollowed, isFollowedNow, settle, toggle, ready, count: ids.size };
}