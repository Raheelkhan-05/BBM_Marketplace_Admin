// components/seller/listingForm/PolicySelect.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { fetchListingPolicyOptions } from "../../../utils/sellerListingApi.js";
import { C, Label } from "./FormPrimitives.jsx";

export default function PolicySelect({ kind, label, value, onChange, error, required }) {
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [menuRect, setMenuRect] = useState(null); // { top, left, width } in viewport coords
    const boxRef = useRef(null);
    const menuRef = useRef(null);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);


    useEffect(() => {
        setLoading(true);
        fetchListingPolicyOptions(kind).then((r) => { if (r?.success) setOptions(r.items); setLoading(false); });
    }, [kind]);


    // seed highlight to current value whenever the menu opens
    useEffect(() => {
        if (!open) return;
        const idx = options.findIndex((o) => o.key === value);
        setHighlightedIdx(idx >= 0 ? idx : 0);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        function onOutside(e) {
            if (boxRef.current && boxRef.current.contains(e.target)) return;
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            setOpen(false);
        }
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, []);

    // Compute (and keep in sync) the trigger's position so the portaled menu
    // can be pinned right under it regardless of any clipping/overflow on
    // ancestor elements.
    useLayoutEffect(() => {
        if (!open) return;

        const updateRect = () => {
            const el = boxRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const menuHeight = menuRef.current?.offsetHeight || 256; // matches max-h-64 fallback
            const spaceBelow = window.innerHeight - r.bottom;
            const openUpward = spaceBelow < menuHeight && r.top > spaceBelow;

            setMenuRect({
                left: r.left,
                width: r.width,
                top: openUpward ? undefined : r.bottom + 4,
                bottom: openUpward ? window.innerHeight - r.top + 4 : undefined,
            });
        };

        updateRect();
        window.addEventListener("scroll", updateRect, true);
        window.addEventListener("resize", updateRect);
        return () => {
            window.removeEventListener("scroll", updateRect, true);
            window.removeEventListener("resize", updateRect);
        };
    }, [open, options.length]);

    const selected = options.find((o) => o.key === value);

    if (loading) {
        return (
            <div className="flex flex-col gap-1">
                <Label>{label}{required && <span style={{ color: C.primary }}> *</span>}</Label>
                <div className="h-[42px] w-full animate-pulse rounded-lg" style={{ background: C.hairSoft }} />
            </div>
        );
    }

    return (
        <div ref={boxRef} className="relative flex min-w-0 flex-col gap-1">
            <Label>{label}{required && <span style={{ color: C.primary }}> *</span>}</Label>
            <button type="button" onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
                        e.preventDefault();
                        setOpen(true);
                        return;
                    }
                    if (!open) return;
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedIdx((i) => Math.min(options.length - 1, i + 1));
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedIdx((i) => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        const opt = options[highlightedIdx];
                        if (opt) { onChange(opt.key); setOpen(false); }
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        setOpen(false);
                    }
                }}
                className="flex w-full items-center tracking-wide justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-[13px] font-bold focus:outline-none focus:ring-2"
                style={error ? { borderColor: "#f2b3ab", background: "#fff8f7" } : { borderColor: C.hair }}>
                <span className="truncate" style={{ color: selected ? C.ink : "#94a3b8" }}>{selected ? selected.label : "Select…"}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }} />
            </button>
            {selected?.description && (
                <p className="text-[10.5px] font-medium leading-snug" style={{ color: C.muted }}>{selected.description}</p>
            )}
            {open && menuRect && createPortal(
                <AnimatePresence>
                    <motion.div
                        ref={menuRef}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="fixed z-[1000] max-h-64 overflow-y-auto rounded-xl border bg-white shadow-lg"
                        style={{ borderColor: C.hair, left: menuRect.left, width: menuRect.width, top: menuRect.top, bottom: menuRect.bottom }}
                    >
                        {options.map((o, idx) => (
                            <button key={o.key} type="button" onClick={() => { onChange(o.key); setOpen(false); }}
                                className="flex w-full items-start gap-2.5 border-b px-3.5 py-2.5 tracking-wide text-left last:border-b-0 transition-colors duration-150 hover:bg-black/[0.03]"
                                style={{
                                    borderColor: C.hairSoft,
                                    background: idx === highlightedIdx ? "rgba(11,17,22,0.04)" : undefined,
                                }}
                            >
                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={o.key === value ? { background: C.secondary } : { border: `1.5px solid ${C.hair}` }}>
                                    {o.key === value && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[12.5px] font-bold" style={{ color: C.ink }}>{o.label}</span>
                                    {o.description && <span className="mt-0.5 block text-[10.5px] font-medium leading-snug" style={{ color: C.muted }}>{o.description}</span>}
                                </span>
                            </button>
                        ))}
                        {options.length === 0 && <p className="px-3.5 py-3 text-center text-[11.5px] font-medium" style={{ color: C.muted }}>No options available.</p>}
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}