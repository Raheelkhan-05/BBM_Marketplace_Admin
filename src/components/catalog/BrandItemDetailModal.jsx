import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
    X, Loader2, Package, Info, ArrowRight, Sparkles, ShieldCheck,
    ChevronLeft, ChevronRight, ChevronDown, Maximize2,
} from "lucide-react";
import { inr, priceUnitLabel, packagingLabel } from "../../utils/priceFormat.js";
import { fetchBrandItemDetail } from "../../utils/api";

const C = { ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };

const SWIPE_THRESHOLD_PX = 45;
const SPRING = { type: "spring", stiffness: 340, damping: 34 };

// Reads a value under either casing — protects this component against the
// RPC returning snake_case (raw column names) vs camelCase (if someone
// later adds an explicit alias in the SQL).
function get(item, ...keys) {
    for (const k of keys) {
        const v = item?.[k];
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
}

function FactRow({ label, value }) {
    if (value === null) return null;
    return (
        <div className="flex items-baseline justify-between gap-3 border-b py-2 text-[12px] last:border-b-0" style={{ borderColor: C.hairSoft }}>
            <span className="shrink-0 font-semibold" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold" style={{ color: C.ink }}>{String(value)}</span>
        </div>
    );
}

// Stops a tap on an overlaid control (arrow, dot, expand icon) from also
// being seen by the swipe container it sits inside. Without this, every
// button press also fed the drag tracker below and fought the button's
// own click — which is why nav controls looked broken.
const stopBubble = (e) => e.stopPropagation();

// --- Shared swipe + navigation logic for both the inline gallery and the
// full-screen lightbox, so there is exactly one implementation of "how
// images change" to get right instead of two that can drift apart. ---
function useSwipeNav(count, active, onNavigate) {
    const [dragX, setDragX] = useState(0);
    const [dragging, setDragging] = useState(false);
    const pointer = useRef({ down: false, startX: 0, dx: 0 });
    const canNav = count > 1;

    const goTo = useCallback((i, dir = 0) => {
        onNavigate(((i % count) + count) % count, dir);
    }, [count, onNavigate]);
    const goPrev = useCallback(() => goTo(active - 1, -1), [goTo, active]);
    const goNext = useCallback(() => goTo(active + 1, 1), [goTo, active]);

    const onPointerDown = (e) => {
        if (!canNav) return;
        pointer.current = { down: true, startX: e.clientX, dx: 0 };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
    };
    const onPointerMove = (e) => {
        if (!pointer.current.down) return;
        const dx = e.clientX - pointer.current.startX;
        pointer.current.dx = dx;
        setDragX(dx);
    };
    const endDrag = () => {
        if (!pointer.current.down) return;
        const dx = pointer.current.dx;
        pointer.current.down = false;
        setDragging(false);
        setDragX(0);
        if (dx <= -SWIPE_THRESHOLD_PX) goNext();
        else if (dx >= SWIPE_THRESHOLD_PX) goPrev();
    };

    return {
        dragX, dragging, canNav, goTo, goPrev, goNext,
        swipeHandlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onPointerLeave: endDrag },
    };
}

const slideVariants = {
    enter: (dir) => ({ opacity: 0, x: dir >= 0 ? 36 : -36 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -36 : 36 }),
};

function GalleryImage({ src, alt, active, direction, dragging, dragX, className }) {
    return (
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
                key={active}
                src={src}
                alt={alt}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate={dragging ? { opacity: 1, x: dragX } : "center"}
                exit="exit"
                transition={dragging ? { duration: 0 } : SPRING}
                className={className}
                draggable={false}
            />
        </AnimatePresence>
    );
}

function GalleryDots({ images, active, goTo }) {
    return (
        <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
                <button
                    key={i}
                    type="button"
                    onPointerDown={stopBubble}
                    onClick={() => goTo(i, i > active ? 1 : -1)}
                    aria-label={`Go to image ${i + 1}`}
                    className="h-1.5 rounded-full transition-all duration-200"
                    style={{ width: i === active ? 14 : 6, background: i === active ? "white" : "rgba(255,255,255,0.55)" }}
                />
            ))}
        </div>
    );
}

// --- Compact inline gallery. Small and modest by design — this is a
// supporting visual, not the point of the modal — with an explicit
// expand button for anyone who wants to actually look at the photos. ---
function ImageGallery({ images, name, active, direction, onNavigate, onExpand }) {
    const count = images.length;
    const { dragX, dragging, canNav, goTo, goPrev, goNext, swipeHandlers } = useSwipeNav(count, active, onNavigate);

    return (
        <div
            className="relative h-44 w-full touch-pan-y select-none overflow-hidden rounded-2xl bg-[#F4F5F6] sm:h-52"
            {...swipeHandlers}
        >
            {count === 0 ? (
                <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-10 w-10" style={{ color: C.hair }} />
                </div>
            ) : (
                <GalleryImage
                    src={images[active]}
                    alt={name}
                    active={active}
                    direction={direction}
                    dragging={dragging}
                    dragX={dragX}
                    className="h-full w-full object-contain p-3 py-0"
                />
            )}

            {count > 0 && (
                <button
                    type="button"
                    onPointerDown={stopBubble}
                    onClick={onExpand}
                    aria-label="View full screen"
                    className="absolute right-2.5 top-2.5 flex items-center justify-center rounded-full bg-white/90 p-1.5 shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white"
                >
                    <Maximize2 className="h-3.5 w-3.5" style={{ color: C.ink }} />
                </button>
            )}

            {canNav && (
                <>
                    <button
                        type="button"
                        onPointerDown={stopBubble}
                        onClick={goPrev}
                        aria-label="Previous image"
                        className="absolute left-2.5 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-2 shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white sm:flex"
                    >
                        <ChevronLeft className="h-4 w-4" style={{ color: C.ink }} />
                    </button>
                    <button
                        type="button"
                        onPointerDown={stopBubble}
                        onClick={goNext}
                        aria-label="Next image"
                        className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-2 shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white sm:flex"
                    >
                        <ChevronRight className="h-4 w-4" style={{ color: C.ink }} />
                    </button>

                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur">
                        {active + 1} / {count}
                    </span>

                    <GalleryDots images={images} active={active} goTo={goTo} />
                </>
            )}
        </div>
    );
}

// --- Full-screen lightbox. Rendered as a sibling of the dialog (not
// nested inside its animated transform) so `position: fixed` stays
// relative to the real viewport instead of being contained by the
// dialog's own transform. ---
function ImageLightbox({ images, name, active, direction, onNavigate, onClose }) {
    const count = images.length;
    const { dragX, dragging, canNav, goTo, goPrev, goNext, swipeHandlers } = useSwipeNav(count, active, onNavigate);

    return (
        <motion.div
            data-lenis-prevent
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[120] flex select-none items-center justify-center bg-black/95"
            onClick={onClose}
        >
            <button
                type="button"
                onPointerDown={stopBubble}
                onClick={onClose}
                aria-label="Close full screen"
                className="absolute right-4 top-4 z-10 flex items-center justify-center rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition-colors hover:bg-white/20"
            >
                <X className="h-5 w-5" />
            </button>

            {count > 0 && (
                <span className="absolute left-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-white backdrop-blur">
                    {active + 1} / {count}
                </span>
            )}

            <div
                className="relative flex h-full w-full items-center justify-center touch-pan-y"
                onClick={stopBubble}
                {...swipeHandlers}
            >
                {count > 0 && (
                    <GalleryImage
                        src={images[active]}
                        alt={name}
                        active={active}
                        direction={direction}
                        dragging={dragging}
                        dragX={dragX}
                        className="max-h-[80vh] max-w-[92vw] object-contain"
                    />
                )}

                {canNav && (
                    <>
                        <button
                            type="button"
                            onPointerDown={stopBubble}
                            onClick={goPrev}
                            aria-label="Previous image"
                            className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition-colors hover:bg-white/20 sm:left-6"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onPointerDown={stopBubble}
                            onClick={goNext}
                            aria-label="Next image"
                            className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white backdrop-blur transition-colors hover:bg-white/20 sm:right-6"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                        <GalleryDots images={images} active={active} goTo={goTo} />
                    </>
                )}
            </div>
        </motion.div>
    );
}

function DetailSkeleton() {
    return (
        <div className="flex flex-col gap-3 px-5 py-4">
            <div className="h-44 w-full animate-pulse rounded-2xl bg-[#EEF0F1] sm:h-52" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-[#EEF0F1]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[#EEF0F1]" />
            <div className="mt-1 h-24 w-full animate-pulse rounded-xl bg-[#EEF0F1]" />
            <div className="h-16 w-full animate-pulse rounded-xl bg-[#EEF0F1]" />
        </div>
    );
}

export default function BrandItemDetailModal({ brandItemId, onClose, onViewSellers }) {
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState(null);
    const [error, setError] = useState("");
    const [isClosing, setIsClosing] = useState(false);
    const [headerElevated, setHeaderElevated] = useState(false);
    const [activeImage, setActiveImage] = useState(0);
    const [imageDirection, setImageDirection] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [hasOverflow, setHasOverflow] = useState(false);
    const [atBottom, setAtBottom] = useState(true);

    const dialogRef = useRef(null);
    const scrollRef = useRef(null);
    const imagesRef = useRef([]);
    const dragControls = useDragControls();

    const requestClose = useCallback(() => setIsClosing(true), []);
    const navigateImage = useCallback((index, dir) => {
        setImageDirection(dir);
        setActiveImage(index);
    }, []);

    // Lock the page underneath without a layout jump when the scrollbar
    // disappears (compensates with padding-right for its width).
    useEffect(() => {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const { style } = document.body;
        const prevOverflow = style.overflow;
        const prevPaddingRight = style.paddingRight;
        style.overflow = "hidden";
        if (scrollbarWidth > 0) style.paddingRight = `${scrollbarWidth}px`;
        return () => {
            style.overflow = prevOverflow;
            style.paddingRight = prevPaddingRight;
        };
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") {
                if (lightboxOpen) setLightboxOpen(false);
                else requestClose();
                return;
            }
            const count = imagesRef.current.length;
            if (count < 2) return;
            if (e.key === "ArrowLeft") setActiveImage((i) => { setImageDirection(-1); return (i - 1 + count) % count; });
            else if (e.key === "ArrowRight") setActiveImage((i) => { setImageDirection(1); return (i + 1) % count; });
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [requestClose, lightboxOpen]);

    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        setActiveImage(0);
        setImageDirection(0);
        fetchBrandItemDetail(brandItemId).then((res) => {
            if (cancelled) return;
            if (res?.success) setItem(res.item);
            else setError(res?.message || "Couldn't load this product.");
            setLoading(false);
        }).catch(() => { if (!cancelled) { setError("Couldn't load this product."); setLoading(false); } });
        return () => { cancelled = true; };
    }, [brandItemId]);

    // "More below" affordance: measured off the real element, not guessed.
    // Re-checked after content mounts/changes and on every scroll/resize.
    const checkScrollState = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setHasOverflow(el.scrollHeight > el.clientHeight + 4);
        setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
        setHeaderElevated(el.scrollTop > 4);
    }, []);

    useEffect(() => {
        if (loading || !item) return;
        const raf = requestAnimationFrame(checkScrollState);
        window.addEventListener("resize", checkScrollState);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", checkScrollState);
        };
    }, [loading, item, checkScrollState]);

    const name = item ? get(item, "name") : null;
    const brandName = item ? get(item, "brand_name", "brandName") : null;
    const manufacturer = item ? get(item, "manufacturer") : null;
    const modelNo = item ? get(item, "model_no", "modelNo") : null;
    const gradeVariant = item ? get(item, "grade_variant", "gradeVariant") : null;
    const isAiGenerated = item ? get(item, "is_ai_generated", "isAiGenerated") : null;
    const specifications = item?.specifications || [];
    const images = item ? (item.images?.length ? item.images : (item.image ? [item.image] : [])) : [];
    const lowestPrice = item ? get(item, "lowest_price", "lowestPrice") : null;
    const highestPrice = item ? get(item, "highest_price", "highestPrice") : null;
    const priceUnit = item ? get(item, "unit", "lowest_price_unit", "lowestPriceUnit") : null;
    const priceMasterPackSize = item ? get(item, "units_per_master_pack", "unitsPerMasterPack", "lowest_price_master_pack_size", "lowestPriceMasterPackSize") : null;
    const pricePackSize = item ? get(item, "pack_size", "packSize", "lowest_price_pack_size", "lowestPricePackSize") : null;
    const priceSuffix = priceUnitLabel(priceMasterPackSize);
    const packaging = packagingLabel(pricePackSize, priceMasterPackSize, priceUnit);
    const description = item ? get(item, "description") : null;
    const manufacturingDetails = item ? get(item, "manufacturing_details", "manufacturingDetails") : null;
    const brandImage = item ? get(item, "brand_image", "brandImage") : null;
    const brandNotApplicable = item ? get(item, "brand_not_applicable", "brandNotApplicable") : null;
    const sellerCount = item ? (get(item, "seller_count", "sellerCount") ?? 0) : 0;
    imagesRef.current = images;

    return createPortal(
        <>
            <AnimatePresence onExitComplete={onClose}>
                {!isClosing && (
                    <motion.div
                        key="overlay"
                        className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={requestClose}
                    >
                        <motion.div
                            key="dialog"
                            ref={dialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="brand-item-modal-title"
                            tabIndex={-1}
                            data-lenis-prevent
                            onClick={stopBubble}
                            initial={{ opacity: 0, y: 24, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 24, scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 380, damping: 34 }}
                            drag="y"
                            dragListener={false}
                            dragControls={dragControls}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.6 }}
                            onDragEnd={(e, info) => {
                                if (info.offset.y > 120 || info.velocity.y > 600) requestClose();
                            }}
                            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[80vh] sm:max-w-xl sm:rounded-3xl"
                        >
                            {/* Drag handle — mobile bottom-sheet only; swipe down to dismiss. */}
                            <div
                                className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden"
                                onPointerDown={(e) => dragControls.start(e)}
                                style={{ touchAction: "none" }}
                            >
                                <div className="h-1.5 w-10 rounded-full" style={{ background: C.hair }} />
                            </div>

                            <div
                                className="flex shrink-0 items-center justify-between border-b px-5 py-3.5 transition-shadow duration-200"
                                style={{ borderColor: C.hairSoft, boxShadow: headerElevated ? "0 4px 12px -6px rgba(11,17,22,0.12)" : "none" }}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Info className="h-4 w-4" style={{ color: C.secondary }} />
                                    <h3 id="brand-item-modal-title" className="text-[14.5px] font-extrabold" style={{ color: C.ink }}>Product details</h3>
                                </div>
                                <button onClick={requestClose} aria-label="Close" className="rounded-full p-1.5 transition-colors hover:bg-black/[0.05]">
                                    <X className="h-4 w-4" style={{ color: C.muted }} />
                                </button>
                            </div>

                            {loading && <DetailSkeleton />}
                            {!loading && error && (
                                <p className="flex-1 px-5 py-14 text-center text-[13px] font-semibold" style={{ color: "#c71f11" }}>{error}</p>
                            )}

                            {!loading && item && (
                                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                                    <div
                                        ref={scrollRef}
                                        onScroll={checkScrollState}
                                        className="bbm-modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
                                    >
                                        <ImageGallery
                                            images={images}
                                            name={name}
                                            active={activeImage}
                                            direction={imageDirection}
                                            onNavigate={navigateImage}
                                            onExpand={() => setLightboxOpen(true)}
                                        />

                                        <div className="mt-4 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[16px] font-extrabold leading-tight" style={{ color: C.ink }}>{name}</p>
                                                {!brandNotApplicable && brandName && (
                                                    <div className="mt-0.5 flex items-center gap-1.5">
                                                        {brandImage && <img src={brandImage} alt="" className="h-4 w-4 rounded object-cover" />}
                                                        <p className="text-[12.5px] font-bold" style={{ color: C.primary }}>{brandName}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {gradeVariant && (
                                                <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: `${C.secondary}14`, color: C.secondary }}>
                                                    {gradeVariant}
                                                </span>
                                            )}
                                        </div>

                                        {(manufacturer || modelNo || gradeVariant) && (
                                            <div className="mt-1 rounded-xl border px-3.5" style={{ borderColor: C.hair }}>
                                                <FactRow label="Manufacturer" value={manufacturer} />
                                                <FactRow label="Model / Part No." value={modelNo} />
                                                <FactRow label="Grade / Variant" value={gradeVariant} />
                                            </div>
                                        )}
                                        {description && (
                                            <div className="mt-4">
                                                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>Description</p>
                                                <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: C.ink }}>{description}</p>
                                            </div>
                                        )}

                                        {manufacturingDetails && (
                                            <div className="mt-4">
                                                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>Manufacturing</p>
                                                <p className="text-[12.5px] font-medium leading-relaxed" style={{ color: C.ink }}>{manufacturingDetails}</p>
                                            </div>
                                        )}

                                        {specifications.length > 0 && (
                                            <div className="mt-4">
                                                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: C.muted }}>Specifications</p>
                                                <div className="overflow-hidden rounded-xl border" style={{ borderColor: C.hair }}>
                                                    {specifications.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            className="flex justify-between px-3.5 py-2 text-[12px] font-semibold"
                                                            style={{ background: i % 2 === 0 ? "white" : C.hairSoft, color: C.ink }}
                                                        >
                                                            <span style={{ color: C.muted }}>{s.key}</span>
                                                            <span className="text-right">{s.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-4 rounded-xl border p-3.5" style={{ borderColor: C.hair }}>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[11px] font-semibold" style={{ color: C.muted }}>Price range</p>
                                                    <p className="text-[16px] font-extrabold" style={{ color: C.ink }}>
                                                        {lowestPrice != null ? (

                                                            lowestPrice === highestPrice
                                                                ? `₹${inr(lowestPrice)}`
                                                                : `₹${inr(lowestPrice)} – ₹${inr(highestPrice)}`
                                                        ) : "Ask sellers"}
                                                        {lowestPrice != null && (
                                                            <span className="ml-1 text-[11px] font-bold" style={{ color: C.muted }}>/{priceSuffix}</span>
                                                        )}
                                                    </p>
                                                    {lowestPrice != null && (
                                                        <p className="mt-0.5 text-[10px] font-semibold" style={{ color: C.muted }}>
                                                            GST-inclusive, as listed by each seller
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[11px] font-semibold" style={{ color: C.muted }}>Sellers</p>
                                                    <p className="text-[16px] font-extrabold" style={{ color: C.secondary }}>{sellerCount}</p>
                                                </div>
                                            </div>
                                            {packaging && (
                                                <p className="mt-2.5 border-t pt-2.5 text-[11.5px] font-semibold" style={{ borderColor: C.hairSoft, color: C.secondary }}>
                                                    {packaging}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* "More below" affordance — only shown while there's genuinely
                                        unscrolled content, measured off the real DOM, not a guess. */}
                                    <AnimatePresence>
                                        {hasOverflow && !atBottom && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center"
                                            >
                                                <div className="h-14 w-full bg-gradient-to-t from-white via-white/85 to-transparent" />
                                                <motion.div
                                                    animate={{ y: [0, -3, 0] }}
                                                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                                                    className="mb-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                                                    style={{ background: "rgba(11,17,22,0.82)" }}
                                                >
                                                    Scroll for more <ChevronDown className="h-3 w-3" />
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {!loading && item && (
                                <div className="shrink-0 border-t p-3.5" style={{ borderColor: C.hairSoft }}>
                                    <button
                                        onClick={() => onViewSellers(item)}
                                        disabled={!sellerCount}
                                        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13.5px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
                                        style={{ background: C.secondary }}
                                    >
                                        {sellerCount ? `View ${sellerCount} sellers` : "No sellers yet"}
                                        {!!sellerCount && <ArrowRight className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            )}
                        </motion.div>

                        <style>{`
                            .bbm-modal-scroll {
                                scrollbar-width: thin;
                                scrollbar-color: rgba(11,17,22,0.18) transparent;
                            }
                            .bbm-modal-scroll::-webkit-scrollbar { width: 6px; }
                            .bbm-modal-scroll::-webkit-scrollbar-track { background: transparent; }
                            .bbm-modal-scroll::-webkit-scrollbar-thumb {
                                background: rgba(11,17,22,0.18);
                                border-radius: 999px;
                            }
                            .bbm-modal-scroll::-webkit-scrollbar-thumb:hover {
                                background: rgba(11,17,22,0.28);
                            }
                        `}</style>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rendered as a sibling of the dialog, not nested inside it — the
                dialog animates via transform, which would otherwise become
                the containing block for this fixed-position overlay and
                trap it inside the dialog's box instead of the viewport. */}
            <AnimatePresence>
                {lightboxOpen && item && (
                    <ImageLightbox
                        images={images}
                        name={name}
                        active={activeImage}
                        direction={imageDirection}
                        onNavigate={navigateImage}
                        onClose={() => setLightboxOpen(false)}
                    />
                )}
            </AnimatePresence>
        </>,
        document.body
    );
}