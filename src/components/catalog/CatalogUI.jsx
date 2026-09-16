import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, Box, ShieldCheck, MapPin, Building2, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { C, EASE } from "./tokens";

function fgFor(idx) {
    return idx % 2 === 0 ? C.primary : C.secondary;
}

/* ---------- tile grid (category / subcategory / generic_product / brand_item) ---------- */

export function IconTile({ image, name, idx, count, sub, onClick }) {
    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.3), ease: EASE }}
            whileTap={{ scale: 0.95 }}
            className="flex snap-start flex-col items-center gap-2 outline-none"
        >
            <span
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl transition-transform duration-150 active:scale-95"
                style={{ background: "#f3f4f6ff" }}
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
            <p className="line-clamp-2 w-full text-center text-[11.5px] font-bold leading-tight tracking-[-0.005em]" style={{ color: C.ink }}>
                {name}
                {sub && <span className="text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>{" - "}{sub}</span>}
            </p>
        </motion.button>
    );
}

export function TileGrid({ children }) {
    return <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-5 lg:grid-cols-6">{children}</div>;
}

export function TileGridSkeleton() {
    return (
        <TileGrid>
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                    <div className="aspect-square w-full animate-pulse rounded-2xl" style={{ background: C.hairSoft }} />
                    <div className="h-2.5 w-3/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                </div>
            ))}
        </TileGrid>
    );
}

export function SellerListSkeleton() {
    return (
        <div className="flex flex-col sm:gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`flex items-center gap-2.5 py-2.5 sm:gap-3 sm:rounded-2xl sm:border sm:p-4 ${i !== 5 ? "border-b sm:border-b-0" : ""}`} style={{ borderColor: C.hair }}>
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg sm:h-14 sm:w-14 sm:rounded-xl" style={{ background: C.hairSoft }} />
                    <div className="flex-1">
                        <div className="h-3 w-1/3 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                        <div className="mt-2 h-2.5 w-1/4 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ---------- chrome shared by every browse page ---------- */

export function FilterSortChips() {
    return (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ icon: SlidersHorizontal, label: "Filter" }, { icon: ArrowUpDown, label: "Sort" }].map(({ icon: Icon, label }) => (
                <button
                    key={label}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11.5px] font-bold transition-colors duration-150 hover:bg-black/[0.03]"
                    style={{ borderColor: C.hair, color: C.ink }}
                >
                    <Icon className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    {label}
                </button>
            ))}
        </div>
    );
}

export function CatalogHeader({ title, titleHref, subtitle, onBack }) {
    const navigate = useNavigate();
    const TitleTag = titleHref ? "a" : "div";
    return (
        <div className="mt-3 flex items-center gap-3 sm:mb-1">
            <button
                onClick={onBack || (() => navigate(-1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 hover:bg-black/[0.03]"
                style={{ borderColor: C.hair, color: C.ink }}
                aria-label="Back"
            >
                <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
                <h1
                    className="truncate font-extrabold leading-tight tracking-[-0.01em] cursor-pointer"
                    style={{ color: C.ink, fontSize: "clamp(19px, 1.8vw, 27px)" }}
                    onClick={titleHref ? () => navigate(titleHref.pathname, { state: titleHref.state }) : undefined}
                >
                    {title}
                </h1>
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: C.muted }}>{subtitle}</p>
            </div>
        </div>
    );
}

export function CatalogLoadError({ onRetry }) {
    return (
        <div className="flex flex-col items-center py-10 text-center">
            <p className="text-[13px] font-bold" style={{ color: C.ink }}>Couldn't load this right now</p>
            <p className="mt-1 text-[12px] font-medium" style={{ color: C.muted }}>Check your connection and try again.</p>
            <button
                onClick={onRetry}
                className="mt-4 rounded-xl border px-4 py-2 text-[12px] font-bold"
                style={{ borderColor: C.hair, color: C.ink }}
            >
                Retry
            </button>
        </div>
    );
}