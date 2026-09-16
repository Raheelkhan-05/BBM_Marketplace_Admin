// components/home/CategoryStrip.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Box, LayoutGrid } from "lucide-react";
import { searchCategories } from "../../utils/api";
import { supabase } from "../../utils/supabaseClient";

const C = {
    ink: "#141B22",
    muted: "#5B6672",
    accent: "#ffffff",
    accentTint: "#D2462B",
    accentTintIcon: "#ffffff",
    hair: "rgba(20,27,34,0.10)",
    hairSoft: "rgba(20,27,34,0.07)",
};
const EASE = [0.16, 1, 0.3, 1];

const CACHE_KEY = "bbm_category_strip_cache_v1";

// The "Pending" category is a placeholder/default bucket, not something a
// shopper should ever be able to select from the strip — filter it out by
// name wherever the category list is built or updated below.
function isHiddenCategory(name) {
    return typeof name === "string" && name.trim().toLowerCase() === "pending";
}

function readCache() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
function writeCache(items) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(items));
    } catch {
        // storage full/unavailable — just skip caching, not fatal
    }
}

// Inserts/updates one category into an already name-sorted list, keeping
// it sorted — same order the backend query uses (.order("name")) — so a
// live-added category lands in its correct alphabetical slot instead of
// just being appended at the end.
function upsertSorted(list, category) {
    const withoutExisting = list.filter((c) => c.id !== category.id);
    const idx = withoutExisting.findIndex(
        (c) => c.name.localeCompare(category.name, undefined, { sensitivity: "base" }) > 0
    );
    if (idx === -1) return [...withoutExisting, category];
    return [...withoutExisting.slice(0, idx), category, ...withoutExisting.slice(idx)];
}

export default function CategoryStrip({ activeCategoryId, onSelect }) {
    const cached = readCache();
    const [categories, setCategories] = useState(cached || []);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {
        // Always revalidate against the network, even when a cached list
        // exists — the cache is only there to avoid an empty/loading flash
        // on first paint, not to skip fetching forever. Without this, a
        // category added after the cache was written never appears until
        // the tab is closed, since sessionStorage survives normal reloads.
        let cancelled = false;
        searchCategories("", 16)
            .then((res) => {
                if (cancelled || !res?.success) return;
                const items = (res.items || []).filter((c) => !isHiddenCategory(c.name));
                setCategories(items);
                writeCache(items);
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ...realtime useEffect stays exactly as-is below this

    // Live updates — a category being inserted, or an existing one
    // flipping to/from review_status = 'approved', is reflected in the
    // strip immediately without a refetch or page reload. Runs once per
    // mount; cleaned up on unmount so switching pages doesn't leak
    // subscriptions.
    // components/home/CategoryStrip.jsx — only the second useEffect changes

    useEffect(() => {
        // CHANGED: was subscribing immediately on mount, opening a websocket
        // connection that competes with the category fetch and the product
        // feed fetch for the network during the page's most latency-sensitive
        // window. A category being approved live is not something that needs
        // to reach this component within the first second of page load — a
        // short defer (mirrors the DeferredMount pattern already used in
        // App.jsx for InstallAppPrompt etc.) lets the above-the-fold content
        // finish its own fetches first.
        let cancelled = false;
        let channel = null;
        const timer = setTimeout(() => {
            if (cancelled) return;
            channel = supabase
                .channel("category-strip-live")
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "hs_categories" },
                    (payload) => {
                        const row = payload.new;
                        if (row.review_status !== "approved") return;
                        if (isHiddenCategory(row.name)) return;
                        setCategories((prev) => {
                            const next = upsertSorted(prev, { id: row.id, name: row.name, slug: row.slug, image: row.image });
                            writeCache(next);
                            return next;
                        });
                    }
                )
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "hs_categories" },
                    (payload) => {
                        const row = payload.new;
                        setCategories((prev) => {
                            let next;
                            if (row.review_status === "approved" && !isHiddenCategory(row.name)) {
                                next = upsertSorted(prev, { id: row.id, name: row.name, slug: row.slug, image: row.image });
                            } else {
                                next = prev.filter((c) => c.id !== row.id);
                            }
                            writeCache(next);
                            return next;
                        });
                    }
                )
                .subscribe();
        }, 2000);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    const allActive = !activeCategoryId;

    return (
        <div className="flex gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <motion.button
                onClick={() => onSelect(null)}
                whileTap={{ scale: 0.96 }}
                className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 transition-colors duration-150"
                style={{
                    background: allActive ? C.accentTint : "#fff",
                    border: `1.5px solid ${allActive ? C.accent : C.hair}`,
                }}
            >
                <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: allActive ? C.accentTintIcon : "#F1F3F4" }}
                >
                    <LayoutGrid className="h-3 w-3" style={{ color: C.muted }} />
                </span>
                <span className="whitespace-nowrap text-[12.5px] font-bold tracking-wide" style={{ color: allActive ? C.accent : C.ink }}>
                    All
                </span>
            </motion.button>

            {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-8 w-24 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                ))
                : categories.map((cat, i) => {
                    const active = activeCategoryId === cat.id;
                    return (
                        <motion.button
                            key={cat.id}
                            onClick={() => onSelect(active ? null : cat)}
                            layout
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2), ease: EASE }}
                            whileTap={{ scale: 0.96 }}
                            className="flex shrink-0 items-center rounded-full py-1.5 px-3.5 transition-colors duration-150"
                            style={{
                                background: active ? C.accentTint : "#fff",
                                border: `1.5px solid ${active ? C.accent : C.hair}`,
                            }}
                        >
                            <span className="whitespace-nowrap text-[12.5px] font-bold tracking-wide" style={{ color: active ? C.accent : C.ink }}>
                                {cat.name}
                            </span>
                        </motion.button>
                    );
                })}
        </div>
    );
}