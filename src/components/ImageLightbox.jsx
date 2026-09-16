// src/components/ImageLightbox.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useLightboxVisibility } from "./Layout.jsx";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

// Card-toss transition: the outgoing image is flung to the bottom
// corner on the side it's heading toward, the incoming image drops
// in from the opposite top corner. Direction: 1 = next (swipe left),
// -1 = prev (swipe right).
const slideVariants = {
    enter: (dir) => ({
        opacity: 0,
        x: dir === 1 ? 220 : -220,
        y: -150,
        rotate: dir === 1 ? 10 : -10,
        scale: 0.96,
    }),
    center: {
        opacity: 1,
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
    },
    exit: (dir) => ({
        opacity: 0,
        x: dir === 1 ? -220 : 220,
        y: 150,
        rotate: dir === 1 ? -10 : 10,
        scale: 0.96,
    }),
};

const EASE = [0.22, 1, 0.36, 1];

// Accepts either:
//   <ImageLightbox src="url" alt="..." onClose={...} />                (single image, old behavior)
//   <ImageLightbox images={["url1","url2"]} alt="..." onClose={...} /> (gallery)
export default function ImageLightbox({ src, images, alt, initialIndex = 0, onClose }) {
    const { setLightboxOpen } = useLightboxVisibility();
    const overlayRef = useRef(null);

    const gallery = images && images.length > 0 ? images : src ? [src] : [];
    const [index, setIndex] = useState(Math.min(initialIndex, Math.max(gallery.length - 1, 0)));
    const [direction, setDirection] = useState(1);
    const currentSrc = gallery[index];

    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });

    const pointers = useRef(new Map());
    const gestureStart = useRef(null); // 2-finger pinch state
    const panStart = useRef(null);     // 1-finger / mouse drag state
    const swipeStart = useRef(null);   // 1-finger horizontal swipe-to-navigate (only when scale === 1)

    const resetZoom = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

    const closeAndReset = useCallback(() => {
        resetZoom();
        onClose();
    }, [onClose]);

    // dir defaults from the index delta, but callers (goPrev/goNext) pass
    // it explicitly so the wrap-around edges (last -> first, first -> last)
    // still animate the correct direction.
    const goTo = useCallback((next, dir) => {
        if (gallery.length <= 1) return;
        resetZoom();
        setDirection(dir ?? (next >= index ? 1 : -1));
        setIndex((next + gallery.length) % gallery.length);
    }, [gallery.length, index]);

    const goPrev = useCallback(() => goTo(index - 1, -1), [goTo, index]);
    const goNext = useCallback(() => goTo(index + 1, 1), [goTo, index]);

    // Wheel/trackpad zoom needs a NON-passive native listener. React
    // attaches onWheel as passive by default for scroll performance,
    // which silently breaks preventDefault() and lets the page fight
    // the zoom underneath — that's the source of the console error and
    // the janky zoom feel.
    useEffect(() => {
        const el = overlayRef.current;
        if (!el) return;

        const onWheelNative = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = clampScale(scale - e.deltaY * 0.01);
            setScale(next);
            if (next === 1) setTranslate({ x: 0, y: 0 });
        };

        el.addEventListener("wheel", onWheelNative, { passive: false });
        return () => el.removeEventListener("wheel", onWheelNative);
    }, [scale]);

    // Hide the bottom bar, lock page scroll, and block native pinch-zoom
    // on the page — all scoped to this component's lifetime, and always
    // undone on unmount so there's no way to get stuck zoomed or scrolled.
    useEffect(() => {
        setLightboxOpen(true);

        const scrollY = window.scrollY;
        const prevBody = {
            position: document.body.style.position,
            top: document.body.style.top,
            width: document.body.style.width,
            overflow: document.body.style.overflow,
        };
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";
        document.body.style.overflow = "hidden";

        const viewportMeta = document.querySelector('meta[name="viewport"]');
        const prevViewportContent = viewportMeta?.getAttribute("content") ?? null;
        if (viewportMeta) {
            viewportMeta.setAttribute(
                "content",
                "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
            );
        }

        return () => {
            setLightboxOpen(false);
            document.body.style.position = prevBody.position;
            document.body.style.top = prevBody.top;
            document.body.style.width = prevBody.width;
            document.body.style.overflow = prevBody.overflow;
            window.scrollTo(0, scrollY);
            if (viewportMeta) {
                if (prevViewportContent != null) viewportMeta.setAttribute("content", prevViewportContent);
                else viewportMeta.removeAttribute("content");
            }
        };
    }, [setLightboxOpen]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") closeAndReset();
            else if (e.key === "ArrowLeft") goPrev();
            else if (e.key === "ArrowRight") goNext();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeAndReset, goPrev, goNext]);

    const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

    const dragState = useRef(null);
    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        dragState.current = { startX: e.clientX, startY: e.clientY, origin: translate };
    };
    const handleMouseMove = (e) => {
        if (!dragState.current) return;
        setTranslate({
            x: dragState.current.origin.x + (e.clientX - dragState.current.startX),
            y: dragState.current.origin.y + (e.clientY - dragState.current.startY),
        });
    };
    const stopDrag = () => { dragState.current = null; };

    const handleDoubleClick = () => {
        setScale((s) => (s > 1 ? 1 : 2.5));
        setTranslate({ x: 0, y: 0 });
    };

    // Mobile: real two-finger pinch + one-finger pan once zoomed,
    // or one-finger horizontal swipe to move between images when not zoomed.
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const handlePointerDown = (e) => {
        if (e.target.closest("button")) return;
        overlayRef.current?.setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            gestureStart.current = { dist: dist(a, b), scale, midpoint: midpoint(a, b) };
            panStart.current = null;
            swipeStart.current = null;
        } else if (pointers.current.size === 1 && scale > 1) {
            panStart.current = { x: e.clientX, y: e.clientY, origin: translate };
        } else if (pointers.current.size === 1 && scale === 1 && gallery.length > 1) {
            swipeStart.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handlePointerMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.current.size === 2 && gestureStart.current) {
            e.preventDefault();
            const [a, b] = [...pointers.current.values()];
            const next = clampScale(gestureStart.current.scale * (dist(a, b) / gestureStart.current.dist));
            setScale(next);
            if (next === 1) setTranslate({ x: 0, y: 0 });
        } else if (pointers.current.size === 1 && panStart.current) {
            e.preventDefault();
            setTranslate({
                x: panStart.current.origin.x + (e.clientX - panStart.current.x),
                y: panStart.current.origin.y + (e.clientY - panStart.current.y),
            });
        }
        // swipeStart: no live transform, just measured on pointer up (keeps it simple/stable)
    };

    const handlePointerUp = (e) => {
        if (e.target.closest("button")) { pointers.current.delete(e.pointerId); return; }
        if (swipeStart.current && pointers.current.size === 1) {
            const dx = e.clientX - swipeStart.current.x;
            const dy = e.clientY - swipeStart.current.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) goNext(); else goPrev();
            }
        }
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) gestureStart.current = null;
        if (pointers.current.size === 0) { panStart.current = null; swipeStart.current = null; }
    };

    if (gallery.length === 0) return null;

    return (
        <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === overlayRef.current) closeAndReset(); }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
            style={{
                touchAction: "none",
                overscrollBehavior: "contain",
                background:
                    "radial-gradient(circle at 50% 38%, #ffffff 0%, #f6f6f7 60%, #eeeef0 100%)",
            }}
        >
            <button
                onClick={closeAndReset}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-black/[0.06] bg-white/80 text-neutral-700 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md transition hover:scale-105 hover:bg-white hover:text-neutral-900 active:scale-95 sm:right-6 sm:top-6"
                aria-label="Close"
            >
                <X className="h-5 w-5" strokeWidth={1.75} />
            </button>

            {gallery.length > 1 && (
                <span
                    className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[12px] font-semibold text-neutral-600 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md sm:top-6"
                    style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}
                >
                    {index + 1} / {gallery.length}
                </span>
            )}

            {gallery.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); goPrev(); }}
                        className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.06] bg-white/80 text-neutral-700 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md transition hover:scale-105 hover:bg-white hover:text-neutral-900 active:scale-95 sm:left-6"
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); goNext(); }}
                        className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-black/[0.06] bg-white/80 text-neutral-700 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md transition hover:scale-105 hover:bg-white hover:text-neutral-900 active:scale-95 sm:right-6"
                        aria-label="Next image"
                    >
                        <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                </>
            )}

            {/* Fixed-footprint stage: sized once from the viewport, never from the
                image's own aspect ratio, so nothing (buttons, counter, thumbnails)
                shifts position as you move between differently-shaped images. */}
            <div
                className="relative flex items-center justify-center"
                style={{ width: "min(90vw, 1100px)", height: "min(76vh, 720px)" }}
            >
                <AnimatePresence custom={direction} initial={false}>
                    <motion.img
                        key={index}
                        src={currentSrc}
                        alt={alt}
                        referrerPolicy="no-referrer"
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.42, ease: EASE }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={stopDrag}
                        onMouseLeave={stopDrag}
                        onDoubleClick={handleDoubleClick}
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                        className="absolute inset-0 m-auto max-h-full max-w-full select-none rounded-2xl bg-white object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)]"
                        style={{
                            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                            cursor: scale > 1 ? "grab" : gallery.length > 1 ? "default" : "zoom-in",
                            touchAction: "none",
                        }}
                    />
                </AnimatePresence>
            </div>

            {gallery.length > 1 && (
                <div
                    className="mt-5 pt-3 flex max-w-[92vw] gap-2.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {gallery.map((thumb, i) => (
                        <button
                            key={thumb + i}
                            onClick={() => goTo(i)}
                            className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-0 ring-offset-1 ring-offset-transparent transition-all duration-200 ${i === index
                                ? "scale-105 opacity-100 shadow-md ring-neutral-900"
                                : "opacity-45 ring-transparent hover:opacity-75"
                                }`}
                            aria-label={`Go to image ${i + 1}`}
                        >
                            <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" draggable={false} />
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}