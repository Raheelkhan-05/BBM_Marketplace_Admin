// src/components/StackedImagePreview.jsx
import { useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Maximize2, Package, Layers } from "lucide-react";

// How far (px) — or how fast (px/s) — a swipe must travel before it
// commits to the next/prev image instead of springing back.
const SWIPE_DISTANCE = 45;
const SWIPE_VELOCITY = 450;
// Anything under this many px of pointer travel is a tap, not a drag.
// This is the ONLY thing that decides tap-vs-swipe — deliberately simple
// and owned entirely by us instead of split across a gesture library and
// a click handler, which is what caused the swipe/open collision before.
const TAP_THRESHOLD = 8;
// How far the outgoing card flies off screen before we swap the image
// underneath and slide the new one in from the opposite edge.
const FLY_DISTANCE = 130;

const cardChrome = "overflow-hidden rounded-2xl border bg-white shadow-sm";
const cardBorder = { borderColor: "rgba(11,17,22,0.09)" };
const EASE = [0.22, 1, 0.36, 1];

const peekVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.18, ease: EASE } },
    exit: { opacity: 0, transition: { duration: 0.12 } },
};

// Deck-of-cards style trigger for a brand item's photo gallery.
//
// - 1 image: plain square, no stack, no gestures beyond a tap to open.
// - 2+ images: a tilted decorative stack peeks out behind the front card
//   (purely cosmetic, crossfades as you move through the gallery) and the
//   front card itself is the only interactive layer.
//
// Gestures are handled with raw Pointer Events instead of Framer's `drag`
// prop. Reasons:
//   1. `drag` + `AnimatePresence` (swapping the element on index change)
//      is a known bad combo — the dragged element can get unmounted
//      mid-gesture, which confuses tap-vs-drag detection and is exactly
//      what was causing swipe to fight with "tap to open".
//   2. Pointer Events give us `setPointerCapture` (gesture survives the
//      finger drifting outside the element) and let US own the single
//      distance threshold that decides tap vs. swipe, instead of that
//      decision being split across two different systems.
//
// Desktop mouse keeps its own simple path: hover scrubs through images,
// click opens the lightbox. No drag needed there since hover already lets
// you preview every image.
export default function StackedImagePreview({ images, name, onOpen, size = "h-24 w-24 sm:h-28 sm:w-28" }) {
    const gallery = images && images.length > 0 ? images : [];
    const [previewIndex, setPreviewIndex] = useState(0);
    const containerRef = useRef(null);

    const wrap = (i) => ((i % gallery.length) + gallery.length) % gallery.length;

    // Drives the front card during an active touch gesture, and the
    // fly-out / slide-in animation on commit. This is the single source
    // of truth for the front card's horizontal position at all times.
    const x = useMotionValue(0);
    // Subtle rotation while the front card is being dragged/flown, clamped
    // to a natural-feeling range. Declared here (not conditionally, not
    // after any early return) because hooks must run in the same order on
    // every render — putting this after the "no images" early return below
    // would break that rule the moment `gallery.length` became 0.
    const rotate = useTransform(x, [-FLY_DISTANCE * 1.4, 0, FLY_DISTANCE * 1.4], [-12, 0, 12]);
    const [busy, setBusy] = useState(false); // true while a commit animation is mid-flight

    // Pointer gesture bookkeeping. Refs (not state) because they're only
    // read/written inside event handlers, never rendered.
    const pointerId = useRef(null);
    const startX = useRef(0);
    const moved = useRef(false);
    const suppressClick = useRef(false);

    // --- Desktop hover scrub (mouse only) -----------------------------
    function handleMouseMove(e) {
        const el = containerRef.current;
        if (!el || gallery.length <= 1 || busy) return;
        const rect = el.getBoundingClientRect();
        const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 0.999);
        const next = Math.floor(ratio * gallery.length);
        if (next !== previewIndex) setPreviewIndex(next);
    }

    function handleMouseLeave() {
        if (gallery.length > 1 && !busy) setPreviewIndex(0);
    }

    // --- Touch / pen swipe, fully owned by us --------------------------
    function handlePointerDown(e) {
        if (e.pointerType === "mouse" || gallery.length <= 1 || busy) return;
        pointerId.current = e.pointerId;
        startX.current = e.clientX;
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e) {
        if (pointerId.current !== e.pointerId) return;
        const dx = e.clientX - startX.current;
        if (Math.abs(dx) > TAP_THRESHOLD) moved.current = true;
        if (moved.current) x.set(dx);
    }

    function commitSwap(dir) {
        // dir: 1 = advancing to next image, -1 = going back
        setBusy(true);
        animate(x, dir * FLY_DISTANCE, { duration: 0.16, ease: [0.4, 0, 1, 1] }).then(() => {
            setPreviewIndex((i) => wrap(i + dir));
            // New image is now showing; place it just off the opposite edge
            // and slide it into place — reads as the next card in the deck
            // sliding into the front position.
            x.jump(-dir * FLY_DISTANCE);
            animate(x, 0, { type: "spring", stiffness: 420, damping: 34 }).then(() => setBusy(false));
        });
    }

    function handlePointerUp(e) {
        if (pointerId.current !== e.pointerId) return;
        pointerId.current = null;

        if (!moved.current) {
            // Genuine tap — open immediately. No synthetic click involved,
            // so there's nothing for a swipe to collide with.
            onOpen(previewIndex);
            return;
        }

        // It was a drag: stop the ghost click a touch device would
        // otherwise fire ~300ms later, and belt-and-suspenders it with a
        // short-lived flag in case preventDefault gets swallowed anywhere
        // upstream (e.g. a passive ancestor listener).
        e.preventDefault();
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 350);

        const dx = e.clientX - startX.current;
        const velocity = x.getVelocity();
        const shouldCommit = Math.abs(dx) > SWIPE_DISTANCE || Math.abs(velocity) > SWIPE_VELOCITY;

        if (shouldCommit) {
            commitSwap(dx < 0 ? 1 : -1);
        } else {
            animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
        }
        moved.current = false;
    }

    // Mouse-only click path (hover-scrub + click). Guarded against firing
    // right after a touch swipe on devices that emulate mouse events.
    function handleClick() {
        if (suppressClick.current) return;
        onOpen(previewIndex);
    }

    if (gallery.length === 0) {
        return (
            <span className={`flex ${size} shrink-0 items-center justify-center ${cardChrome}`} style={cardBorder}>
                <Package className="h-8 w-8 text-slate-300" />
            </span>
        );
    }

    return (
        <div className={`relative ${size} shrink-0`}>
            {gallery.length > 1 && (
                <>
                    {/* Decorative tilted stack peeking out behind the front card.
                        Purely cosmetic — no gestures, no pointer events — just
                        crossfades to the next couple of images as the front
                        card advances, so the "deck" always looks alive. */}
                    {gallery.length > 2 && (
                        <div
                            className={`absolute inset-0 origin-bottom-right ${cardChrome}`}
                            style={{ ...cardBorder, transform: "rotate(8deg) translate(3px, 3px) scale(0.92)" }}
                            aria-hidden="true"
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.img
                                    key={wrap(previewIndex + 2)}
                                    src={gallery[wrap(previewIndex + 2)]}
                                    alt=""
                                    variants={peekVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="h-full w-full object-cover brightness-90"
                                    draggable={false}
                                />
                            </AnimatePresence>
                        </div>
                    )}
                    <div
                        className={`absolute inset-0 border-1 border-slate-400 origin-bottom-right ${cardChrome}`}
                        style={{
                            transform: "rotate(-6deg) translate(-6px, -6px) scale(0.96)"
                        }}
                        aria-hidden="true"
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.img
                                key={wrap(previewIndex + 1)}
                                src={gallery[wrap(previewIndex + 1)]}
                                alt=""
                                variants={peekVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="h-full w-full object-cover"
                                draggable={false}
                            />
                        </AnimatePresence>
                        <div className="pointer-events-none absolute inset-0 bg-black/5" />
                    </div>
                </>
            )}

            <div
                ref={containerRef}
                onClick={handleClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(previewIndex); }}
                aria-label="View images"
                className={`group relative z-10 flex h-full w-full cursor-pointer items-center justify-center ${cardChrome}`}
                style={{
                    ...cardBorder,
                    touchAction: "pan-y",
                    WebkitTouchCallout: "none",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                }}
                data-lenis-prevent
            >
                <motion.img
                    src={gallery[previewIndex]}
                    alt={name}
                    className="h-full w-full object-cover"
                    draggable={false}
                    style={{ x, rotate }}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-150 group-hover:bg-black/20">
                    <Maximize2 className="h-4 w-4 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </span>

                {gallery.length > 1 && (
                    <div className="absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                        {gallery.map((_, i) => (
                            <span
                                key={i}
                                className="h-1 rounded-full transition-all duration-150"
                                style={{ background: i === previewIndex ? "#fff" : "rgba(255,255,255,0.45)", width: i === previewIndex ? 10 : 4 }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}