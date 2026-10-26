// components/home/GroupBannerCarousel.jsx
//
// DESIGN
// - Every banner is 16:9 with the same rounded-2xl as the other cards.
// - Slides are sized to the feed's column count (perView): 1 on phones (86% wide, so the next
//   banner peeks), 2 on tablets, 3 on desktop. On desktop each slide sits exactly over a feed column.
// - Native scroll-snap (no carousel library): touch swipe, trackpad and keyboard all just work.
// - PERFORMANCE: only slides near the viewport mount an <img>; the rest are fixed-ratio
//   placeholders (no layout shift). The window only grows as the user scrolls, so 100s of
//   banners cost nothing until they are reached. Images use srcset via resizedImageUrl.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { resizedImageUrl } from "../../utils/imageUrl";

const C = {
    ink: "#0B1116", muted: "#667077",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)", imgBg: "#F4F5F6",
    brand: "#de3207", brandInk: "#8F3200", brandTint: "#FFF3EB", brandHair: "rgba(222,83,7,0.25)",
};
const EASE = [0.16, 1, 0.3, 1];
const SIZES = "(min-width:1280px) 420px, (min-width:1024px) 33vw, (min-width:640px) 50vw, 86vw";
const MAX_DOTS_PAGES = 8;

function BannerImage({ src, alt, name, priority = false }) {
    const [state, setState] = useState("loading"); // loading | loaded | error
    const imgRef = useRef(null);

    useEffect(() => {
        setState("loading");
        const el = imgRef.current;
        if (el?.complete && el.naturalWidth > 0) setState("loaded");
    }, [src]);

    if (state === "error") {
        return (
            <span
                className="relative flex aspect-video w-full items-center justify-center gap-2 px-4 text-center"
                style={{ background: `linear-gradient(135deg, ${C.brandTint} 0%, #fff 70%)` }}
            >
                <Layers className="h-5 w-5 shrink-0" style={{ color: C.brand }} />
                <span className="line-clamp-2 text-[13px] font-extrabold tracking-wide" style={{ color: C.brandInk }}>{name}</span>
            </span>
        );
    }

    return (
        <span className="relative block aspect-video w-full" style={{ background: C.imgBg }}>
            {state === "loading" && <span className="absolute inset-0 animate-pulse" style={{ background: C.hairSoft }} />}
            <img
                ref={imgRef}
                src={resizedImageUrl(src, { width: 1280 })}
                srcSet={`${resizedImageUrl(src, { width: 640 })} 640w, ${resizedImageUrl(src, { width: 1280 })} 1280w`}
                sizes={SIZES}
                width={1600}
                height={900}
                alt={alt}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                onLoad={() => setState("loaded")}
                onError={() => setState("error")}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
            />
        </span>
    );
}

const bannerLabel = (b) => `${b.name}${b.variant_count ? `, ${b.variant_count} variants` : ""}. View all variants`;

const BannerSlide = memo(function BannerSlide({ banner, index, total, mount, priority, pct, onOpen }) {
    return (
        <div
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${total}`}
            className="snap-start shrink-0 px-2.5 py-1 sm:px-3"
            style={{ flex: `0 0 ${pct}%` }}
        >
            <button
                type="button"
                onClick={() => onOpen(banner)}
                aria-label={bannerLabel(banner)}
                className="group relative block w-full overflow-hidden rounded-2xl border outline-none transition-shadow duration-150 hover:shadow-[0_8px_20px_-12px_rgba(196,71,5,0.55)] focus-visible:ring-2 focus-visible:ring-[#de3207] focus-visible:ring-offset-2 active:scale-[0.995]"
                style={{ borderColor: C.hair }}
            >
                {mount
                    ? <BannerImage src={banner.image_url} alt={banner.alt_text || banner.name} name={banner.name} priority={priority} />
                    : <span className="block aspect-video w-full" style={{ background: C.imgBg }} />}
            </button>
        </div>
    );
});

// A single banner inside a feed column (used when the carousel isn't shown, e.g. category views).
export function GroupBannerCard({ banner, idx = 0, animateEntrance = false, onOpen }) {
    return (
        <motion.div
            initial={animateEntrance ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: animateEntrance ? Math.min(idx * 0.012, 0.18) : 0, ease: EASE }}
            className="px-2.5 py-2 sm:px-3"
        >
            <button
                type="button"
                onClick={onOpen}
                aria-label={bannerLabel(banner)}
                className="group relative block w-full overflow-hidden rounded-2xl border outline-none transition-shadow duration-150 hover:shadow-[0_8px_20px_-12px_rgba(196,71,5,0.55)] focus-visible:ring-2 focus-visible:ring-[#de3207] focus-visible:ring-offset-2 active:scale-[0.995]"
                style={{ borderColor: C.hair }}
            >
                <BannerImage src={banner.image_url} alt={banner.alt_text || banner.name} name={banner.name} priority={idx < 2} />
            </button>
        </motion.div>
    );
}

export default function GroupBannerCarousel({ banners, perView = 1, onOpen }) {
    const reduce = useReducedMotion();
    const scrollerRef = useRef(null);
    const rafRef = useRef(0);
    const openRef = useRef(onOpen);
    openRef.current = onOpen;
    const handleOpen = useCallback((b) => openRef.current?.(b), []);

    const n = banners.length;
    const multi = n > perView;
    const pct = perView === 1 ? (n > 1 ? 86 : 100) : 100 / perView;

    const [index, setIndex] = useState(0);                      // leftmost visible slide
    const [windowEnd, setWindowEnd] = useState(perView + 3);    // slides below this index have mounted images

    useEffect(() => { setWindowEnd((w) => Math.max(w, perView + 3)); }, [perView]);

    const onScroll = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const el = scrollerRef.current;
            const first = el?.firstElementChild;
            if (!el || !first) return;
            const stride = first.getBoundingClientRect().width || 1;
            const i = Math.min(Math.max(n - 1, 0), Math.max(0, Math.round(el.scrollLeft / stride)));
            setIndex((p) => (p === i ? p : i));
            setWindowEnd((p) => Math.max(p, i + perView + 3));
        });
    }, [n, perView]);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const behavior = reduce ? "auto" : "smooth";
    const goPage = (dir) => {
        const el = scrollerRef.current;
        if (el) el.scrollBy({ left: dir * el.clientWidth, behavior });
    };
    const goToIndex = (i) => {
        const el = scrollerRef.current;
        const first = el?.firstElementChild;
        if (!el || !first) return;
        el.scrollTo({ left: i * first.getBoundingClientRect().width, behavior });
    };

    if (!n) return null;

    const pages = Math.ceil(n / perView);
    const lastStart = Math.max(0, n - perView);
    const activePage = index >= lastStart ? pages - 1 : Math.floor(index / perView);
    const canPrev = index > 0;
    const canNext = index < lastStart;
    const showArrows = multi && perView > 1;
    const showDots = multi && pages <= MAX_DOTS_PAGES;

    return (
        <section aria-label="Featured product ranges" className="pt-3">
            <div className="mb-1 flex items-center justify-between gap-2 px-3 sm:px-4">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.brand }}>
                    <Layers className="h-3 w-3" strokeWidth={2.5} /> Featured ranges
                </span>
                {multi && (
                    <div className="flex items-center gap-2">
                        {!showDots && (
                            <span className="text-[11px] font-bold tabular-nums tracking-wide" style={{ color: C.muted }}>
                                {Math.min(index + 1, n)} / {n}
                            </span>
                        )}
                        {showArrows && (
                            <div className="flex items-center gap-1">
                                {[["Previous banners", -1, ChevronLeft, canPrev], ["Next banners", 1, ChevronRight, canNext]].map(([label, dir, Icon, ok]) => (
                                    <button
                                        key={label}
                                        type="button"
                                        aria-label={label}
                                        disabled={!ok}
                                        onClick={() => goPage(dir)}
                                        className="flex h-7 w-7 items-center justify-center rounded-full border bg-white transition hover:bg-black/[0.04] active:scale-95 disabled:cursor-default disabled:opacity-35"
                                        style={{ borderColor: C.hair }}
                                    >
                                        <Icon className="h-4 w-4" style={{ color: C.ink }} strokeWidth={2.4} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div
                ref={scrollerRef}
                onScroll={onScroll}
                role="region"
                aria-roledescription="carousel"
                aria-label="Featured product ranges"
                tabIndex={0}
                className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none", scrollBehavior: reduce ? "auto" : undefined }}
            >
                {banners.map((b, i) => (
                    <BannerSlide
                        key={b.group_id}
                        banner={b}
                        index={i}
                        total={n}
                        mount={i < windowEnd}
                        priority={i < perView}
                        pct={pct}
                        onOpen={handleOpen}
                    />
                ))}
            </div>

            {showDots && (
                <div className="mt-1.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Banner pages">
                    {Array.from({ length: pages }).map((_, p) => (
                        <button
                            key={p}
                            type="button"
                            role="tab"
                            aria-selected={p === activePage}
                            aria-label={`Go to page ${p + 1}`}
                            onClick={() => goToIndex(Math.min(p * perView, lastStart))}
                            className="h-1.5 rounded-full transition-all duration-200"
                            style={{ width: p === activePage ? 18 : 6, background: p === activePage ? C.brand : "rgba(11,17,22,0.18)" }}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}