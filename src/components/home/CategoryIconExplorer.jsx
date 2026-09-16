import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Box } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { searchCategories } from "../../utils/api";

/* ------------------------------------------------------------------
   DESIGN NOTES — CategoryIconExplorer, v2
   ------------------------------------------------------------------
   Same tokens as Hero16by9Banner / QuickActionsJustBelowBanner /
   TopCategoriesAccordion: ink #0B1116, muted #667077, primary
   #D2462B, secondary #006F83, hairline rgba(11,17,22,0.09),
   font-sans headings/body, font-mono uppercase-tracked captions,
   [0.16,1,0.3,1] easing.

   Changed from v1:
     - No more inline drill-down. Tapping a category now routes to
       /category/:idOrSlug/subcategories (CategorySubcategoriesPage) —
       a real page, not an in-place accordion swap — carrying the
       already-fetched category object via router state so that page
       can render its header instantly instead of waiting on a
       redundant fetch.
     - Grid is now a fixed 2-row, horizontally-scrolling strip rather
       than a wrapping grid. grid-auto-flow: column + explicit
       grid-auto-columns computed as a % width keeps EXACTLY 4 tiles
       visible per row on mobile (5 on sm) no matter how many
       categories exist — everything past that scrolls right→left,
       same "horizontal rail" idea as the trust-logo marquee, just
       user-driven instead of autoplaying.
   ------------------------------------------------------------------ */

const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)",
    hairSoft: "rgba(11,17,22,0.05)",
};

const EASE = [0.16, 1, 0.3, 1];

function tintFor(idx) {
    return idx % 2 === 0 ? `${C.primary}12` : `${C.secondary}12`;
}
function fgFor(idx) {
    return idx % 2 === 0 ? C.primary : C.secondary;
}

function IconTile({ image, name, idx, count, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: Math.min(idx * 0.02, 0.3), ease: EASE }}
            whileTap={{ scale: 0.95 }}
            className="flex snap-start flex-col items-center gap-2 outline-none"
        >
            <span
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl transition-transform duration-150 active:scale-95"
                style={{ background: '#f3f4f6ff' }}
            >
                {image ? (
                    <img src={image} alt={name} className="h-full w-full object-cover" draggable={false} />
                ) : (
                    <Box className="h-7 w-7" style={{ color: fgFor(idx) }} />
                )}
                {count != null && (
                    <span
                        className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white ring-2 ring-white"
                        style={{ background: fgFor(idx) }}
                    >
                        {count}
                    </span>
                )}
            </span>
            <p
                className="line-clamp-2 w-full text-center text-[11px] sm:text-[13.5px] font-bold leading-tight tracking-[0.01em]"
                style={{ color: C.ink }}
            >
                {name}
            </p>
        </motion.button>
    );
}

// Fixed 2-row, N-visible-columns horizontal rail. grid-auto-flow:column
// fills a column (both rows) before starting the next, so items still
// read left-to-right/top-to-bottom in pairs — just clipped to 2 rows
// with everything past the 4th (mobile) / 5th (sm+) column scrollable
// instead of wrapping to a 3rd row.
//
// Edge fades are scroll-aware, not decorative: showLeftFade only turns
// true once the user has scrolled right at all, showRightFade only
// stays true while there's still more content past the visible edge —
// reach either end and that side's fade disappears, signaling "nothing
// more this way." Implemented as two overlay divs whose opacity
// transitions over 500ms ease-out (opacity animates smoothly in every
// browser, unlike animating a mask-image gradient directly) — layered
// on top of the card's own static mask-image dissolve (see the
// wrapper below), not replacing it.
function TileRail({ children }) {
    const scrollRef = useRef(null);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);

    const updateFades = () => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setShowLeftFade(scrollLeft > 4);
        setShowRightFade(scrollLeft + clientWidth < scrollWidth - 4);
    };

    useEffect(() => {
        const raf = requestAnimationFrame(updateFades);
        const el = scrollRef.current;
        if (!el) return () => cancelAnimationFrame(raf);
        el.addEventListener("scroll", updateFades, { passive: true });
        window.addEventListener("resize", updateFades);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener("scroll", updateFades);
            window.removeEventListener("resize", updateFades);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [children]);

    return (
        <div className="relative">
            <div
                ref={scrollRef}
                className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <div className="grid snap-x snap-proximity grid-flow-col grid-rows-2 gap-x-3 gap-y-5 [grid-auto-columns:calc((100%-3*0.75rem)/4)] sm:[grid-auto-columns:calc((100%-4*0.75rem)/7)]">
                    {children}
                </div>
            </div>
            <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-500 ease-out sm:w-12"
                style={{
                    opacity: showLeftFade ? 1 : 0,
                    background: "linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0) 100%)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-500 ease-out sm:w-12"
                style={{
                    opacity: showRightFade ? 1 : 0,
                    background: "linear-gradient(to left, #ffffff 0%, rgba(255,255,255,0) 100%)",
                }}
            />
        </div>
    );
}

function TileRailSkeleton() {
    return (
        <div className="overflow-hidden pb-1">
            <div
                className="grid grid-flow-col grid-rows-2 gap-x-3 gap-y-5 [grid-auto-columns:calc((100%-3*0.75rem)/4)] sm:[grid-auto-columns:calc((100%-4*0.75rem)/7)]"
            >
                {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                        <div className="aspect-square w-full animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />
                        <div className="h-2.5 w-3/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

function SectionHeader({ title, subtitle }) {
    const navigate = useNavigate();
    return (
        <div className="flex items-center justify-between pt-1">
            <div>
                <h2
                    className="text-left font-extrabold leading-tight tracking-[-0.01em]"
                    style={{ color: C.ink, fontSize: "clamp(19px, 1.8vw, 27px)" }}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p className="mt-0.5 max-w-xs text-[12.5px] font-medium leading-relaxed" style={{ color: C.muted }}>
                        {subtitle}
                    </p>
                )}
            </div>
            <button
                onClick={() => navigate("/categories")}
                className="group flex items-center gap-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150"
                style={{ color: C.primary }}
            >
                See all
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
        </div>
    );
}

function CategoryIconExplorer() {
    const navigate = useNavigate();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await searchCategories("", 20);
                if (!cancelled && res?.success) setCategories(res.items || []);
            } catch {
                if (!cancelled) setCategories([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Category is passed via router state so the destination page can
    // render its header (name, count) immediately instead of waiting on
    // a redundant fetch for data we already have in memory.
    const openCategory = (cat) => {
        navigate(`/category/${cat.slug || cat.id}/browse`, { state: { category: cat } });
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Shop by Category" subtitle="Tap a department to browse subcategories" />

            <div
                className="overflow-hidden rounded-[20px] border bg-white p-4 px-3 sm:p-6"
                style={{
                    borderColor: C.hair,
                    maskImage: "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
                }}
            >
                {loading ? (
                    <TileRailSkeleton />
                ) : categories.length === 0 ? (
                    <p className="py-6 text-center text-sm font-medium" style={{ color: C.muted }}>
                        No categories available yet.
                    </p>
                ) : (
                    <TileRail>
                        {categories.map((cat, i) => (
                            <IconTile
                                key={cat.id}
                                image={cat.image}
                                name={cat.name}
                                idx={i}
                                count={cat.subcategoryCount}
                                onClick={() => openCategory(cat)}
                            />
                        ))}
                    </TileRail>
                )}
            </div>
        </div>
    );
}

export default CategoryIconExplorer;