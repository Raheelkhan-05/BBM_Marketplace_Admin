// src/components/DesktopNav.jsx
//
// Desktop header nav. Shows as many items as fit in `maxWidth`; whatever
// doesn't fit moves into a "More" dropdown (same order, same icons, same
// badges, same dividers as the mobile menu). Fit is measured from real
// pixel widths, so it's correct at any viewport size / zoom level.
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { preloadRoute } from "../routePreload.js";

const C = { ink: "#141B22", muted: "#5B6672", tile: "rgba(20,27,34,0.06)", hair: "rgba(20,27,34,0.09)" };
const EASE = [0.16, 1, 0.3, 1];

const PILL =
    "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors duration-150 lg:px-4 lg:text-[13px]";

function Badge({ children, ring }) {
    return (
        <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#d2462b] px-1 text-[10px] font-bold text-white ${ring ? "ring-2 ring-white" : ""}`}
        >
            {children}
        </span>
    );
}

export default function DesktopNav({ items, pathname, search, maxWidth }) {
    const measureRef = useRef(null);
    const wrapRef = useRef(null);
    const [visibleCount, setVisibleCount] = useState(items.length);
    const [open, setOpen] = useState(false);

    const itemsKey = items.map((i) => i.id + i.label).join("|");

    // Measure a hidden copy of every pill (+ the More button, always last)
    // and decide how many fit.
    const layout = useCallback(() => {
        const row = measureRef.current;
        if (!row) return;
        const kids = Array.from(row.children);
        if (kids.length < 2) return;
        const moreW = kids[kids.length - 1].offsetWidth;
        const widths = kids.slice(0, -1).map((k) => k.offsetWidth);
        const gap = parseFloat(getComputedStyle(row).columnGap) || 4;
        const avail = maxWidth ?? Infinity;

        const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
        if (total <= avail) return setVisibleCount(widths.length);

        let used = moreW;
        let n = 0;
        for (const w of widths) {
            if (used + gap + w > avail) break;
            used += gap + w;
            n += 1;
        }
        setVisibleCount(n);
    }, [maxWidth]);

    useLayoutEffect(() => {
        layout();
        const row = measureRef.current;
        if (!row) return;
        const ro = new ResizeObserver(layout);
        ro.observe(row); // fires when breakpoint padding changes pill widths
        return () => ro.disconnect();
    }, [layout, itemsKey]);

    // Close on outside click, Escape, or navigation.
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);
    useEffect(() => { setOpen(false); }, [pathname, search]);

    if (!items.length) return null;

    const visible = items.slice(0, visibleCount);
    const hidden = items.slice(visibleCount);
    const hiddenActive = hidden.some((it) => it.match(pathname, search));
    const hiddenBadgeTotal = hidden.reduce((s, it) => s + (it.rawBadge || 0), 0);
    const hiddenBadge = hiddenBadgeTotal > 0 ? (hiddenBadgeTotal > 9 ? "9+" : hiddenBadgeTotal) : null;

    return (
        <div className="absolute left-1/2 hidden w-max -translate-x-1/2 md:block" style={{ maxWidth: maxWidth != null ? `${maxWidth}px` : undefined }}>
            {/* Hidden measuring row — same pills, invisible, never interactive. */}
            <div
                ref={measureRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1 lg:gap-1.5"
            >
                {items.map((it) => {
                    const Icon = it.icon;
                    return (
                        <span key={it.id} className={PILL}>
                            <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                            {it.label}
                        </span>
                    );
                })}
                <span className={PILL}>
                    More <ChevronDown className="h-3.5 w-3.5" />
                </span>
            </div>

            <nav className="-my-2 flex items-center gap-1 py-5 lg:gap-1.5" aria-label="Main">
                {visible.map((it) => {
                    const Icon = it.icon;
                    const active = it.match(pathname, search);
                    return (
                        <button
                            key={it.id}
                            onClick={it.onClick}
                            onMouseEnter={(e) => {
                                if (it.to) preloadRoute(it.to.split("?")[0]);
                                if (!active) e.currentTarget.style.background = "rgba(20,27,34,0.045)";
                            }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                            onTouchStart={() => { if (it.to) preloadRoute(it.to.split("?")[0]); }}
                            aria-current={active ? "page" : undefined}
                            className={PILL}
                            style={{ color: active ? "#fff" : C.ink, background: active ? "#000" : "transparent" }}
                        >
                            <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" style={{ color: active ? "#fff" : C.muted }} />
                            {it.label}
                            {it.badge != null && <Badge ring>{it.badge}</Badge>}
                        </button>
                    );
                })}

                {hidden.length > 0 && (
                    <div className="relative shrink-0" ref={wrapRef}>
                        <button
                            onClick={() => setOpen((o) => !o)}
                            aria-haspopup="menu"
                            aria-expanded={open}
                            className={PILL}
                            style={{
                                color: hiddenActive ? "#fff" : C.ink,
                                background: hiddenActive ? "#000" : open ? "rgba(20,27,34,0.06)" : "transparent",
                            }}
                        >
                            More
                            <ChevronDown
                                className="h-3.5 w-3.5 transition-transform duration-200"
                                style={{ color: hiddenActive ? "#fff" : C.muted, transform: open ? "rotate(180deg)" : "none" }}
                            />
                            {hiddenBadge != null && !open && <Badge ring>{hiddenBadge}</Badge>}
                        </button>

                        <AnimatePresence>
                            {open && (
                                <motion.div
                                    role="menu"
                                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                    transition={{ duration: 0.16, ease: EASE }}
                                    style={{ transformOrigin: "top right", borderColor: C.hair }}
                                    className="absolute right-0 top-full z-[60] mt-3 w-64 overflow-hidden rounded-2xl border bg-white p-1.5 shadow-xl"
                                >
                                    {hidden.map((it, i) => {
                                        const Icon = it.icon;
                                        const active = it.match(pathname, search);
                                        const showDivider = i > 0 && hidden[i - 1].group !== it.group;
                                        return (
                                            <div key={it.id}>
                                                {showDivider && <div className="mx-2 my-1.5 h-px" style={{ background: C.hair }} />}
                                                <button
                                                    role="menuitem"
                                                    onClick={() => { setOpen(false); it.onClick(); }}
                                                    onMouseEnter={() => it.to && preloadRoute(it.to.split("?")[0])}
                                                    aria-current={active ? "page" : undefined}
                                                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100 hover:bg-black/[0.04] focus-visible:bg-black/[0.04] focus-visible:outline-none"
                                                >
                                                    <span
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                                        style={{ background: active ? "#000" : C.tile }}
                                                    >
                                                        <Icon className="h-4 w-4" style={{ color: active ? "#fff" : C.ink }} />
                                                    </span>
                                                    <span
                                                        className={`flex-1 truncate text-[13.5px] tracking-wide ${active ? "font-extrabold" : "font-semibold"}`}
                                                        style={{ color: C.ink }}
                                                    >
                                                        {it.label}
                                                    </span>
                                                    {it.badge != null && (
                                                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d2462b] px-1.5 text-[10px] font-bold text-white">
                                                            {it.badge}
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </nav>
        </div>
    );
}