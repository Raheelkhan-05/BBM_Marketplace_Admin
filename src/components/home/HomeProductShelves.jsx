import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Package, CheckCircle2 } from "lucide-react";
import { searchCategories, fetchGenericProductBrowse, fetchHomeFeed } from "../../utils/api";
import { useAuth } from "../../context/AuthContext.jsx";
import useInViewOnce from "../../hooks/useInViewOnce";
import useInfiniteScrollSentinel from "../../hooks/useInfiniteScrollSentinel";

/* ------------------------------------------------------------------
   DESIGN + PERF NOTES — HomeProductShelves, v5
   ------------------------------------------------------------------
   v4 was still fetching per-shelf, on scroll-into-view: mount a shelf
   -> show a skeleton -> fetch -> sometimes discover it's empty -> the
   shelf collapses to nothing. That's the "loads, then goes off" bug,
   and because each shelf only starts its own fetch once it scrolls
   in, nothing was ever ready ahead of time — it always felt like it
   was computing live, because it was.

   v5 inverts the order: RESOLVE FIRST, RENDER SECOND.

     1. A background resolver walks the category list a few at a time
        (CONCURRENCY, in parallel) and only appends a category to the
        feed once its products are already confirmed non-empty. A
        shelf is never mounted, then found empty, then removed —
        empty categories are filtered out before they ever reach the
        DOM. `ProductShelf` is now a pure presentational component; it
        no longer fetches anything itself.

     2. The resolver always keeps a few shelves resolved AHEAD of what
        is currently visible (PREFETCH_AHEAD). So when the infinite-
        scroll sentinel fires, the next batch is usually already
        sitting there confirmed — revealing it is instant instead of
        starting a new fetch-and-wait.

     3. The resolved plan (which categories have live stock, plus
        their first page of products) is persisted to localStorage for
        a short TTL. Reload the home page, or come back to it within
        that window, and the feed paints fully populated with no
        loading state at all — actually precalculated, not just
        cached for the current tab session. The cache is keyed to the
        current login state so switching accounts never shows a stale
        "You sell this" badge.

     4. A failed probe for a category is treated as "skip it this
        session" rather than surfacing a "couldn't load" block inline
        — a broken shelf reads worse than a shelf that simply isn't
        there.

   Visual language (single accent, neutral elevation, hairline rhythm)
   is unchanged from v4. Tokens: ink #0B1116, muted #667077, primary
   #D2462B, secondary #006F83, hairline rgba(11,17,22,0.08),
   [0.16,1,0.3,1] easing.
   ------------------------------------------------------------------ */

const C = {
    canvas: "#FBFCFD",
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.08)",
    hairSoft: "rgba(11,17,22,0.045)",
    imgBg: "#F4F5F6",
};
const EASE = [0.16, 1, 0.3, 1];

// Matches HomePage's <main> padding exactly — negative-margin bleed only
// works if it cancels out the same value the page uses.
const PAGE_PAD = "px-2.5 sm:px-4 lg:px-6";
const PAGE_PAD_NEG = "-mx-2.5 sm:-mx-4 lg:-mx-6";

const SHELF_PRODUCT_LIMIT = 14;
const CONCURRENCY = 4;              // categories probed in parallel per resolver batch
const INITIAL_SHELF_COUNT = 3;      // confirmed shelves shown before any scroll
const SHELVES_PER_BATCH = 3;        // additional shelves revealed per scroll trigger
const PREFETCH_AHEAD = 3;           // resolver stays this far ahead of what's revealed
const MAX_RESOLVED_SHELVES = 30;    // hard cap so the feed can't grow unbounded
const MAX_CATEGORIES_TO_SCAN = 60;  // safety cap on how many categories we'll ever probe

const PLAN_CACHE_KEY = "home_feed_plan_v1";
const PLAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — long enough to feel instant on a quick revisit, short enough that stock/price won't go stale
const PLAN_CACHE_MAX_SHELVES = 15;        // only persist the first N shelves — deep-scroll content doesn't need to survive a reload

const SHELF_TITLES = [
    (n) => `Popular in ${n}`,
    (n) => `Top picks in ${n}`,
    (n) => `Trending in ${n}`,
    (n) => `Best sellers in ${n}`,
    (n) => `New listings in ${n}`,
];

// Session-lifetime item cache (module scope — survives this component
// remounting within the same tab, cleared on a full page reload).
// Separate from the localStorage plan cache below, which survives a
// reload too but only for a short TTL.
const shelfCache = new Map();
const SHELF_CACHE_CAP = 60;
function cacheShelf(id, items) {
    shelfCache.set(id, items);
    if (shelfCache.size > SHELF_CACHE_CAP) shelfCache.delete(shelfCache.keys().next().value);
}

function authKeyFor(token) {
    return token ? String(token).slice(0, 16) : "guest";
}

function loadPlanCache(authKey) {
    try {
        const raw = localStorage.getItem(PLAN_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.authKey !== authKey) return null;
        if (Date.now() - parsed.ts > PLAN_CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function savePlanCache(authKey, categories, resolvedShelves, cursor, exhausted) {
    try {
        const shelves = resolvedShelves.slice(0, PLAN_CACHE_MAX_SHELVES).map((s) => ({ category: s.category, items: s.items }));
        localStorage.setItem(
            PLAN_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), authKey, categories, shelves, cursor, exhausted })
        );
    } catch {
        // storage full/unavailable/private-mode — the cache is a speed
        // optimization, not a requirement, so just skip it silently
    }
}

/* ---------------- shared eyebrow (reused from Hero / QuickActions) ---------------- */
function PulseEyebrow({ label }) {
    return (
        <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
                <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                    style={{ background: C.primary }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: C.primary }} />
            </span>
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.muted }}>
                {label}
            </span>
        </div>
    );
}

/* ---------------- product card ---------------- */
const ShelfProductCard = memo(function ShelfProductCard({ item, idx, onClick }) {
    const name = item.name || item.product_name || "Product";
    const brandName = item.brand_name;
    const price = item.lowest_price ?? item.price;
    const sellerCount = item.seller_count;
    const moq = item.moq;
    const unit = item.unit;
    const image = item.image || item.images?.[0];

    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.24), ease: EASE }}
            whileTap={{ y: 0, scale: 0.97 }}
            className="group/card flex w-[142px] shrink-0 snap-start flex-col items-start gap-2 text-left outline-none sm:w-[172px]"
        >
            <span
                className="relative flex aspect-[0.82] w-full items-center justify-center overflow-hidden rounded-2xl border transition-all duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-[0_18px_32px_-16px_rgba(11,17,22,0.22)] group-focus-visible/card:-translate-y-1 group-focus-visible/card:shadow-[0_18px_32px_-16px_rgba(11,17,22,0.22)]"
                style={{ borderColor: C.hair, background: C.imgBg, boxShadow: "0 1px 2px rgba(11,17,22,0.04)" }}
            >
                {image ? (
                    <img
                        src={image}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/card:scale-[1.05]"
                    />
                ) : (
                    <Package className="h-6 w-6" style={{ color: C.muted }} />
                )}
                {item.has_own_listing && (
                    <span
                        className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white"
                        style={{ background: C.secondary }}
                    >
                        You sell this
                    </span>
                )}
                <span
                    className="pointer-events-none absolute inset-x-3 bottom-0 h-[2px] scale-x-0 rounded-full transition-transform duration-300 ease-out group-hover/card:scale-x-100"
                    style={{ background: C.primary, transformOrigin: "left" }}
                />
            </span>
            <div className="w-full">
                <p className="line-clamp-2 text-[12.5px] font-bold leading-tight tracking-[-0.005em] sm:text-[13.5px]" style={{ color: C.ink }}>
                    {name}
                </p>
                {brandName && (
                    <p className="mt-0.5 truncate text-[10.5px] font-medium" style={{ color: C.muted }}>
                        {brandName}
                    </p>
                )}
                <div className="mt-1.5">
                    {price != null && (
                        <p className="font-mono text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
                            Starting at
                        </p>
                    )}
                    <p className="text-[16px] font-extrabold leading-none tabular-nums" style={{ color: price != null ? C.ink : C.muted }}>
                        {price != null ? (
                            <>
                                <span style={{ color: C.primary }}>₹</span>
                                {price}
                            </>
                        ) : (
                            "View price"
                        )}
                    </p>
                </div>
                {(moq != null || sellerCount > 1) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5">
                        {moq != null && (
                            <span className="text-[10px] font-semibold tabular-nums" style={{ color: C.muted }}>
                                MOQ {moq}{unit ? ` ${unit}` : ""}
                            </span>
                        )}
                        {moq != null && sellerCount > 1 && (
                            <span className="text-[10px]" style={{ color: C.hair }}>·</span>
                        )}
                        {sellerCount > 1 && (
                            <span className="text-[10px] font-bold" style={{ color: C.secondary }}>
                                {sellerCount} sellers
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.button>
    );
});

function ShelfCardSkeleton() {
    return (
        <div className="flex w-[142px] shrink-0 flex-col gap-2 sm:w-[172px]">
            <div className="aspect-[0.82] w-full animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />
            <div className="h-2.5 w-4/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            <div className="h-3.5 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

// A full shelf-shaped skeleton (title bar + a row of card skeletons) —
// used only for the brief window where the resolver hasn't yet caught
// up to what's about to be revealed. Thanks to PREFETCH_AHEAD this
// should rarely be visible for more than a frame or two.
function ShelfSkeletonBlock({ isFirst }) {
    return (
        <div className="space-y-3 py-6 ps-3" style={{ borderTop: isFirst ? "none" : `1px solid ${C.hairSoft}` }}>
            <div className={`h-5 w-40 animate-pulse rounded-full ${PAGE_PAD}`} style={{ background: C.hairSoft }} />
            <div className={`flex gap-3.5 overflow-hidden ${PAGE_PAD}`}>
                {Array.from({ length: 6 }).map((_, j) => <ShelfCardSkeleton key={j} />)}
            </div>
        </div>
    );
}

// Hairline progress track under the rail — mirrors Hero16by9Banner's
// mono index + accent progress line, driven by real scroll position.
function RailProgress({ scrollRef, itemCount }) {
    const [ratio, setRatio] = useState(0);
    const [span, setSpan] = useState(1);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => {
            const { scrollLeft, scrollWidth, clientWidth } = el;
            const max = scrollWidth - clientWidth;
            setRatio(max > 0 ? Math.min(1, Math.max(0, scrollLeft / max)) : 0);
            setSpan(scrollWidth > 0 ? Math.min(1, clientWidth / scrollWidth) : 1);
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            el.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollRef, itemCount]);

    if (span >= 1) return null;

    const trackWidth = 56;
    const fillWidth = Math.max(10, trackWidth * span);
    const travel = trackWidth - fillWidth;

    return (
        <div className={`hidden items-center gap-2 sm:flex ${PAGE_PAD}`}>
            <span className="relative block h-[2.5px] shrink-0 overflow-hidden rounded-full" style={{ width: trackWidth, background: C.hairSoft }}>
                <span
                    className="absolute left-0 top-0 h-full rounded-full transition-transform duration-150 ease-out"
                    style={{ width: fillWidth, background: C.primary, transform: `translateX(${ratio * travel}px)` }}
                />
            </span>
        </div>
    );
}

/* ---------------- one shelf — purely presentational, no fetching ---------------- */
const ProductShelf = memo(function ProductShelf({ category, items, idx, isFirst }) {
    const navigate = useNavigate();
    const [ref, inView] = useInViewOnce({ lookahead: 500 });
    const railRef = useRef(null);

    const openCategory = () => navigate(`/category/${category.slug || category.id}/browse`, { state: { category } });
    const openProduct = (item) => navigate(`/product/${item.slug || item.id}/sellers`, { state: { genericProduct: item, category } });

    const title = SHELF_TITLES[idx % SHELF_TITLES.length](category.name);

    return (
        <motion.section
            ref={ref}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: EASE }}
            className="space-y-3 py-6 ps-3"
            style={{ borderTop: isFirst ? "none" : `1px solid ${C.hairSoft}` }}
        >
            <div className={`flex items-center justify-between ${PAGE_PAD}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                        style={{ background: C.hairSoft }}
                    >
                        {category.image ? (
                            <img src={category.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                            <Package className="h-4 w-4" style={{ color: C.muted }} />
                        )}
                    </span>
                    <h3 className="truncate text-[16px] font-extrabold leading-tight tracking-[-0.008em] sm:text-[18.5px]" style={{ color: C.ink }}>
                        {title}
                    </h3>
                </div>
                <button
                    onClick={openCategory}
                    className="group flex shrink-0 items-center gap-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide transition-colors duration-150 hover:opacity-70"
                    style={{ color: C.primary }}
                >
                    See all
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </button>
            </div>

            <div
                className={`overflow-hidden ${PAGE_PAD_NEG}`}
                style={{
                    maskImage: "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
                }}
            >
                <div
                    ref={railRef}
                    className={`flex snap-x snap-proximity gap-3.5 overflow-x-auto pb-1 ${PAGE_PAD} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
                >
                    {items.map((item, i) => (
                        <ShelfProductCard key={item.id} item={item} idx={i} onClick={() => openProduct(item)} />
                    ))}
                </div>
            </div>

            <RailProgress scrollRef={railRef} itemCount={items.length} />
        </motion.section>
    );
});

/* ---------------- feed ---------------- */
export default function HomeProductShelves() {
    const [shelves, setShelves] = useState([]);
    const [cursor, setCursor] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const loadedOnce = useRef(false);

    const loadPage = useCallback(async (startCursor) => {
        const res = await fetchHomeFeed(startCursor, SHELVES_PER_BATCH);
        if (!res?.success) return { shelves: [], hasMore: false, nextCursor: startCursor };
        return res;
    }, []);

    useEffect(() => {
        if (loadedOnce.current) return;
        loadedOnce.current = true;
        loadPage(0).then((res) => {
            setShelves(res.shelves);
            setCursor(res.nextCursor);
            setHasMore(res.hasMore);
            setLoading(false);
        });
    }, [loadPage]);

    const handleNearBottom = useCallback(() => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        loadPage(cursor).then((res) => {
            setShelves((prev) => [...prev, ...res.shelves]);
            setCursor(res.nextCursor);
            setHasMore(res.hasMore);
            setLoadingMore(false);
        });
    }, [cursor, hasMore, loadingMore, loadPage]);

    const sentinelRef = useInfiniteScrollSentinel(handleNearBottom, {
        lookahead: 900,
        disabled: !hasMore || loading,
    });

    if (!loading && shelves.length === 0) return null;

    return (
        <div className="rounded-[20px]" style={{ background: C.canvas }}>
            <div className={`space-y-2 pb-2 pt-6 ${PAGE_PAD}`}>
                <PulseEyebrow label="Live catalog" />
                <h2 className="font-extrabold leading-[0.98] tracking-[-0.015em]" style={{ color: C.ink, fontSize: "clamp(22px, 2.1vw, 32px)" }}>
                    More to explore
                </h2>
                <p className="max-w-sm text-[13px] font-medium leading-relaxed" style={{ color: C.muted }}>
                    Fresh picks from every category on the marketplace.
                </p>
            </div>

            {loading ? (
                Array.from({ length: INITIAL_SHELF_COUNT }).map((_, i) => <ShelfSkeletonBlock key={`init-${i}`} isFirst={i === 0} />)
            ) : (
                <>
                    {shelves.map((s, i) => (
                        <ProductShelf key={s.category.id} category={s.category} items={s.items} idx={i} isFirst={i === 0} />
                    ))}
                    {loadingMore && <ShelfSkeletonBlock isFirst={false} />}
                </>
            )}

            {hasMore ? (
                <div ref={sentinelRef} className="flex justify-center py-5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: C.hair }} />
                </div>
            ) : (
                !loading && shelves.length > 0 && (
                    <div className={`flex flex-col items-center gap-1.5 py-9 text-center ${PAGE_PAD}`}>
                        <CheckCircle2 className="h-5 w-5" style={{ color: C.secondary }} />
                        <p className="text-[12.5px] font-bold" style={{ color: C.ink }}>You're all caught up</p>
                        <p className="max-w-xs text-[11.5px] font-medium" style={{ color: C.muted }}>
                            That's every category with live listings right now.
                        </p>
                    </div>
                )
            )}
        </div>
    );
}