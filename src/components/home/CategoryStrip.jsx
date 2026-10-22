// components/home/CategoryStrip.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { searchCategories } from "../../utils/api";
import { supabase } from "../../utils/supabaseClient";

const C = {
    ink: "#6c6c6cff",
    muted: "#5B6672",
    accent: "#0765CD",
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

// Borderless tab-style button: text only, with a blue underline when active.
function StripButton({ active, onClick, children, motionProps = {} }) {
    return (
        <motion.button
            onClick={onClick}
            whileTap={{ scale: 0.96 }}
            className="relative flex shrink-0 items-center px-3 py-1"
            {...motionProps}
        >
            <span
                className="whitespace-nowrap text-[12.5px] font-bold tracking-wide transition-colors duration-150"
                style={{ color: active ? C.accent : C.ink }}
            >
                {children}
            </span>
            <span
                aria-hidden
                className="absolute inset-x-3 bottom-0 h-[2.5px] origin-center rounded-full transition-transform duration-200"
                style={{
                    background: C.accent,
                    transform: active ? "scaleX(1)" : "scaleX(0)",
                }}
            />
        </motion.button>
    );
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

    // Live updates — a category being inserted, or an existing one
    // flipping to/from review_status = 'approved', is reflected in the
    // strip immediately without a refetch or page reload. Runs once per
    // mount; cleaned up on unmount so switching pages doesn't leak
    // subscriptions.
    useEffect(() => {
        // Deferred subscribe: opening a websocket on mount competes with the
        // category fetch and the product feed fetch during the page's most
        // latency-sensitive window. A short defer (mirrors the DeferredMount
        // pattern in App.jsx) lets the above-the-fold content finish first.
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
        <div className="pt-2.5 flex gap-1 overflow-x-auto px-0.5 py-1 md:mt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <StripButton active={allActive} onClick={() => onSelect(null)}>
                All
            </StripButton>

            {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-8 w-24 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                ))
                : categories.map((cat, i) => {
                    const active = activeCategoryId === cat.id;
                    return (
                        <StripButton
                            key={cat.id}
                            active={active}
                            onClick={() => onSelect(active ? null : cat)}
                            motionProps={{
                                layout: true,
                                initial: { opacity: 0, x: 8 },
                                animate: { opacity: 1, x: 0 },
                                transition: { duration: 0.25, delay: Math.min(i * 0.02, 0.2), ease: EASE },
                            }}
                        >
                            {cat.name}
                        </StripButton>
                    );
                })}
        </div>
    );
}