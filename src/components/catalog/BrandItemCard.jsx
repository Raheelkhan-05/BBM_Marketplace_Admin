import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { C, EASE } from "./tokens";

// Infinite-loop image strip built on native scroll-snap. The loop trick:
// we render [lastClone, ...images, firstClone] and start the scroll
// position on the first *real* slide (extended index 1). When the user
// scrolls onto a clone at either end, we silently snap the scroll
// position to the matching real slide once the scroll settles — since
// the clone is pixel-identical to the real slide, the jump is invisible.
function ImageCarousel({ images, name }) {
    const scrollRef = useRef(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const rafRef = useRef(null);
    const settleTimerRef = useRef(null);

    const loop = images.length > 1;
    const extended = loop ? [images[images.length - 1], ...images, images[0]] : images;
    const realLen = images.length;

    // Map an extended-array index to the real image index for the dots.
    const toRealIndex = useCallback(
        (extIdx) => {
            if (!loop) return extIdx;
            if (extIdx <= 0) return realLen - 1;
            if (extIdx >= realLen + 1) return 0;
            return extIdx - 1;
        },
        [loop, realLen]
    );

    const settleIfOnClone = useCallback(() => {
        const el = scrollRef.current;
        if (!el || !loop) return;
        const w = el.clientWidth;
        if (!w) return;
        const extIdx = Math.round(el.scrollLeft / w);
        if (extIdx === 0) {
            el.scrollLeft = w * realLen; // jump from lead clone -> real last slide
        } else if (extIdx === realLen + 1) {
            el.scrollLeft = w * 1; // jump from tail clone -> real first slide
        }
    }, [loop, realLen]);

    const handleScroll = useCallback(() => {
        if (rafRef.current) return; // coalesce to one read per frame
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const el = scrollRef.current;
            if (!el) return;
            const w = el.clientWidth;
            if (!w) return;
            const extIdx = Math.round(el.scrollLeft / w);
            const real = toRealIndex(extIdx);
            setActiveIndex((prev) => (prev === real ? prev : real));
        });

        // Debounced "scroll has settled" check, as a fallback for browsers
        // without a native `scrollend` event.
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(settleIfOnClone, 120);
    }, [toRealIndex, settleIfOnClone]);

    // Start on the first real slide (extended index 1).
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el || !loop) return;
        const w = el.clientWidth;
        if (w) el.scrollLeft = w * 1;
    }, [loop, realLen]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        el.addEventListener("scrollend", settleIfOnClone);

        const onWheelNative = (e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaX;
        };
        el.addEventListener("wheel", onWheelNative, { passive: false });

        // Keep the loop aligned if the tile is resized (e.g. layout reflow).
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth;
            if (!w) return;
            el.scrollLeft = w * (loop ? activeIndex + 1 : activeIndex);
        });
        ro.observe(el);

        return () => {
            el.removeEventListener("scrollend", settleIfOnClone);
            el.removeEventListener("wheel", onWheelNative);
            ro.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settleIfOnClone]);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    }, []);

    if (images.length === 0) {
        return (
            <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden" style={{ background: "#f3f4f6" }}>
                <span className="text-[11px] font-bold" style={{ color: C.muted }}>No image</span>
            </span>
        );
    }

    if (images.length === 1) {
        return (
            <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden" style={{ background: "#f3f4f6" }}>
                <img src={images[0]} alt={name} className="h-full w-full object-cover" draggable={false} />
            </span>
        );
    }

    return (
        <span className="relative block aspect-square w-full overflow-hidden" style={{ background: "#f3f4f6" }}>
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ touchAction: "pan-x", overscrollBehaviorX: "contain" }}
            >
                {extended.map((imgSrc, i) => (
                    <img
                        key={i}
                        src={imgSrc}
                        alt={name}
                        draggable={false}
                        className="h-full w-full flex-shrink-0 snap-center object-cover"
                        style={{ scrollSnapStop: "always" }}
                    />
                ))}
            </div>

            <span className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1">
                {images.map((_, i) => (
                    <span
                        key={i}
                        className="h-1 rounded-full transition-all duration-200"
                        style={{
                            width: i === activeIndex ? 10 : 4,
                            background: i === activeIndex ? "#fff" : "rgba(255,255,255,0.55)",
                            boxShadow: "0 0 2px rgba(0,0,0,0.45)",
                        }}
                    />
                ))}
            </span>
        </span>
    );
}

export default function BrandItemCard({ item, idx, onClick }) {
    const gallery = item.images?.length ? item.images : (item.image ? [item.image] : []);

    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(idx * 0.02, 0.24), ease: EASE }}
            whileTap={{ scale: 0.97 }}
            className="flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-shadow duration-150 hover:shadow-[0_8px_24px_-10px_rgba(11,17,22,0.18)]"
            style={{ borderColor: C.hair }}
        >
            <ImageCarousel images={gallery} name={item.name} />
            <div className="flex flex-1 flex-col gap-1 p-2.5">
                {item.brand_name && (
                    <p className="truncate text-[9.5px] font-extrabold uppercase tracking-[0.06em]" style={{ color: C.secondary }}>
                        {item.brand_name}
                    </p>
                )}
                <p className="line-clamp-2 text-[12px] font-bold leading-tight" style={{ color: C.ink }}>{item.name}</p>
                <div className="mt-auto flex items-center justify-between pt-1">
                    {item.lowest_price != null ? (
                        <span className="text-[12.5px] font-extrabold" style={{ color: C.primary }}>From ₹{item.lowest_price}</span>
                    ) : (
                        <span className="text-[11px] font-semibold" style={{ color: C.muted }}>No sellers yet</span>
                    )}
                    {item.seller_count > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: C.muted }}>
                            <Users className="h-2.5 w-2.5" /> {item.seller_count}
                        </span>
                    )}
                </div>
            </div>
        </motion.button>
    );
}