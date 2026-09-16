// components/MarketplaceSearchBar.jsx

import { useRef, useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Layers, Tag, Package, BadgeCheck, Lightbulb } from "lucide-react";
import { fetchAutocomplete } from "../utils/api";

const AUTOCOMPLETE_MIN_CHARS = 2;
const DEBOUNCE_MS = 100;

const BAR_GRADIENT = "linear-gradient(90deg, #0B8A93 0%, #3B82F6 50%, #FF6A00 100%)";
const RUNNING_BORDER_GRADIENT_STOPS =
    "#3B82F6 0%, #FF6A00 25%, #3B82F6 50%, #0B8A93 75%, #3B82F6 100%";

const BORDER_WIDTH_PX = 2;
const SPIN_CYCLE_MS = 2000;
const GLOW_HOLD_MS = 800;
const GLOW_FADE_MS = 800;
const FEATHER_CLOSE_MS = 260;
const SPIN_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";
const DEFAULT_GLOW_SPREAD_PX = 6;
const GLOW_RING_COUNT = 6;
const GLOW_PEAK_OPACITY = 0.5;

function buildGlowRings(spreadPx) {
    const safeSpread = Math.max(0, spreadPx);
    return Array.from({ length: GLOW_RING_COUNT }, (_, i) => {
        const t = (i + 1) / GLOW_RING_COUNT;
        return {
            extra: +(t * safeSpread).toFixed(2),
            opacity: +(GLOW_PEAK_OPACITY * Math.pow(1 - t, 2)).toFixed(3),
            blur: +(1.5 + t * 3.5).toFixed(2),
        };
    });
}

const LEVEL_META = {
    category: { icon: Layers, label: "Category", color: "#047084", bg: "rgba(4,112,132,0.08)" },
    subcategory: { icon: Tag, label: "Subcategory", color: "#047084", bg: "rgba(4,112,132,0.08)" },
    product: { icon: Package, label: "Product", color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
    brand: { icon: BadgeCheck, label: "Brand", color: "#F15A24", bg: "rgba(241,90,36,0.08)" },
    brandFamily: { icon: BadgeCheck, label: "Brand", color: "#F15A24", bg: "rgba(241,90,36,0.08)" },
};

function HighlightedName({ name, term }) {
    if (!term.trim()) return <>{name}</>;
    const idx = name.toLowerCase().indexOf(term.trim().toLowerCase());
    if (idx === -1) return <>{name}</>;
    const before = name.slice(0, idx);
    const match = name.slice(idx, idx + term.trim().length);
    const after = name.slice(idx + term.trim().length);
    return (
        <>
            {before}
            <span className="text-slate-900">{match}</span>
            {after}
        </>
    );
}

export default function MarketplaceSearchBar({
    value, onChange, onSubmit,
    placeholder = "Search any product, brand, category...",
    suggestionsDirection = "down",
    clearOnSubmit = true,
    glowSpread = DEFAULT_GLOW_SPREAD_PX,
    onSuggestionSelect,
    allowSuggestionsToggle = true,
}) {
    const navigate = useNavigate();
    const glowRings = useMemo(() => buildGlowRings(glowSpread), [glowSpread]);

    const [suggestionsOn, setSuggestionsOn] = useState(true);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const debounceRef = useRef(null);
    const abortRef = useRef(null);
    const containerRef = useRef(null);

    // Set right before a suggestion selection changes `value` from the
    // outside. The very next run of the value-watching effect below
    // consumes this flag and skips re-fetching/re-opening the dropdown
    // for that one update — otherwise picking a suggestion immediately
    // re-triggers a fetch for the newly-filled text, which (since it
    // usually matches the suggestion just picked) reopens the exact
    // same dropdown the person just closed. Cleared automatically after
    // being consumed once, so normal typing right after still fetches
    // as expected.
    const suppressNextFetchRef = useRef(false);

    const [glowFading, setGlowFading] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setGlowFading(true), SPIN_CYCLE_MS + GLOW_HOLD_MS);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        abortRef.current?.abort();

        if (suppressNextFetchRef.current) {
            suppressNextFetchRef.current = false;
            setSuggestions([]);
            setShowSuggestions(false);
            setSuggestionsLoading(false);
            return;
        }

        if (!suggestionsOn) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSuggestionsLoading(false);
            return;
        }

        const term = value.trim();
        if (term.length < AUTOCOMPLETE_MIN_CHARS) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSuggestionsLoading(false);
            return;
        }

        setSuggestionsLoading(true);
        debounceRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const res = await fetchAutocomplete(term, 8, controller.signal);
                const list = res?.success ? res.suggestions : [];
                setSuggestions(list);
                setShowSuggestions(list.length > 0);
                setHighlightIndex(-1);
            } catch (err) {
                if (err?.name !== "AbortError") {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } finally {
                setSuggestionsLoading(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(debounceRef.current);
    }, [value, suggestionsOn]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const commitSearch = (term) => {
        const trimmed = term.trim();
        if (!trimmed) return;
        setShowSuggestions(false);
        if (clearOnSubmit) {
            // Only suppress the next fetch when we're about to blank the input
            // via onChange("") below — there's no upcoming value change to
            // suppress otherwise, and leaving this flag set would wrongly
            // skip the very next keystroke's suggestion fetch.
            suppressNextFetchRef.current = true;
            onChange("");
        }
        onSubmit(trimmed);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (highlightIndex >= 0 && suggestions[highlightIndex]) {
            handleSuggestionClick(suggestions[highlightIndex]);
        } else {
            commitSearch(value);
        }
    };

    const handleSuggestionClick = (s) => {
        if (onSuggestionSelect) {
            setShowSuggestions(false);
            setSuggestions([]);
            suppressNextFetchRef.current = true;
            onSuggestionSelect(s);
            return;
        }
        if (s.level === "brandFamily") {
            setShowSuggestions(false);
            suppressNextFetchRef.current = true;
            onChange("");
            navigate(`/brand-family/${encodeURIComponent(s.name)}`);
            return;
        }
        setShowSuggestions(false);
        suppressNextFetchRef.current = true;
        onChange(s.name);
        commitSearch(s.name);
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex((i) => (i + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
            setHighlightIndex(-1);
        }
    };

    return (
        <div className="w-full relative" ref={containerRef}>
            <style>{`
                @property --bbm-angle {
                    syntax: '<angle>';
                    inherits: false;
                    initial-value: 0deg;
                }

                @property --bbm-feather {
                    syntax: '<angle>';
                    inherits: false;
                    initial-value: 22deg;
                }

                @keyframes bbm-comet-spin {
                    from { --bbm-angle: 0deg; }
                    to   { --bbm-angle: 360deg; }
                }

                @keyframes bbm-comet-feather-close {
                    from { --bbm-feather: 22deg; }
                    to   { --bbm-feather: 0deg; }
                }

                .bbm-comet-fill {
                    position: absolute;
                    border-radius: 9999px;
                    --bbm-angle: 0deg;
                    background-image: conic-gradient(from 0deg, ${RUNNING_BORDER_GRADIENT_STOPS});
                    -webkit-mask-image: conic-gradient(
                        from 0deg,
                        black 0deg,
                        black calc(var(--bbm-angle) - var(--bbm-feather)),
                        transparent var(--bbm-angle),
                        transparent 360deg
                    );
                    mask-image: conic-gradient(
                        from 0deg,
                        black 0deg,
                        black calc(var(--bbm-angle) - var(--bbm-feather)),
                        transparent var(--bbm-angle),
                        transparent 360deg
                    );
                    animation:
                        bbm-comet-spin ${SPIN_CYCLE_MS}ms ${SPIN_EASING} 1 forwards,
                        bbm-comet-feather-close ${FEATHER_CLOSE_MS}ms linear ${SPIN_CYCLE_MS - FEATHER_CLOSE_MS}ms 1 forwards;
                }

                .bbm-comet-glow-wrap {
                    position: absolute;
                    pointer-events: none;
                    transition: opacity ${GLOW_FADE_MS}ms ease;
                }
                .bbm-comet-glow-fade-out {
                    opacity: 0;
                }

                .bbm-glass-sheen {
                    background: linear-gradient(to bottom, rgba(255,255,255,.65) 0%, rgba(255,255,255,0) 55%);
                    opacity: .55;
                }
                @media (prefers-reduced-motion: reduce) {
                    .bbm-comet-fill { animation: none; --bbm-angle: 360deg; --bbm-feather: 0deg; }
                    .bbm-comet-glow-wrap { opacity: 0; }
                }
            `}</style>

            <div className="relative rounded-full shadow-lg">
                <div
                    aria-hidden="true"
                    className={`bbm-comet-glow-wrap ${glowFading ? "bbm-comet-glow-fade-out" : ""}`}
                    style={{ inset: `-${BORDER_WIDTH_PX}px` }}
                >
                    {glowRings.map((ring, i) => (
                        <div
                            key={i}
                            aria-hidden="true"
                            className="absolute rounded-full bbm-comet-fill"
                            style={{
                                inset: `-${ring.extra}px`,
                                opacity: ring.opacity,
                                filter: `blur(${ring.blur}px)`,
                            }}
                        />
                    ))}
                </div>
                <div
                    aria-hidden="true"
                    className="absolute rounded-full bbm-comet-fill"
                    style={{ inset: `-${BORDER_WIDTH_PX}px` }}
                />

                <form onSubmit={handleSubmit} className="relative flex h-[55px] items-center overflow-hidden rounded-full bg-white px-3 pl-5 lg:h-[62px] lg:px-5 lg:pl-7 xl:h-[64px]">
                    <div aria-hidden="true" className="bbm-glass-sheen pointer-events-none absolute inset-0 rounded-full" />

                    <div className="relative flex shrink-0 items-center pr-3 lg:pr-4">
                        <Link to="/home">
                            <img src="/Logo.png" alt="BBM" className="h-6 w-6 lg:h-8 lg:w-8 object-contain" />
                        </Link>
                    </div>

                    <div className="relative mr-3 lg:mr-4 h-8 lg:h-10 w-px shrink-0 bg-gray-200" />

                    <div className="relative flex min-w-0 flex-1 items-center">
                        {suggestionsLoading ? (
                            <Loader2 size={16} className="mr-2 lg:mr-3 shrink-0 animate-spin text-[#0B8A93] lg:!w-4 lg:!h-4" />
                        ) : (
                            <Search size={16} className="mr-2 lg:mr-3 shrink-0 text-slate-400 lg:!w-4 lg:!h-4" />
                        )}
                        <input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => suggestionsOn && suggestions.length > 0 && setShowSuggestions(true)}
                            placeholder={placeholder}
                            autoComplete="off"
                            className="w-full min-w-0 bg-transparent text-[12px] lg:text-[14px] text-slate-700 placeholder:text-slate-400 outline-none tracking-wide"
                        />
                    </div>

                    {allowSuggestionsToggle && (
                        <button
                            type="button"
                            onClick={() => setSuggestionsOn((v) => !v)}
                            title={suggestionsOn ? "Turn off suggestions" : "Turn on suggestions"}
                            aria-pressed={suggestionsOn}
                            className={`relative ml-auto flex h-8 w-4 shrink-0 items-center justify-center rounded-full transition ${suggestionsOn ? "text-[#0B8A93]" : "text-slate-300"
                                }`}
                        >
                            <Lightbulb size={18} fill={suggestionsOn ? "#0B8A93" : "none"} />
                        </button>
                    )}

                    <button
                        type="submit"
                        className="relative ml-2 lg:ml-3 flex h-9 w-9 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-full bg-[#F15A24] text-white transition hover:scale-105"
                    >
                        <Search size={16} className="lg:!w-[16px] lg:!h-[16px]" />
                    </button>
                </form>
            </div>

            <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: suggestionsDirection === "up" ? 6 : -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: suggestionsDirection === "up" ? 6 : -6, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className={`absolute left-0 right-0 z-30 overflow-hidden rounded-2xl border-2 border-[#0B8A93]/15 bg-white shadow-[0_-4px_20px_-6px_rgba(4,112,132,0.35)] ring-1 ring-black/5 ${suggestionsDirection === "up"
                            ? "bottom-[calc(100%+8px)]"
                            : "top-[calc(100%+8px)]"
                            }`}
                    >
                        <div className="max-h-[340px] overflow-y-auto py-1.5">
                            {suggestions.map((s, i) => {
                                const meta = LEVEL_META[s.level] || LEVEL_META.product;
                                const Icon = meta.icon;
                                return (
                                    <motion.button
                                        key={`${s.level}-${s.id}`}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleSuggestionClick(s)}
                                        onMouseEnter={() => setHighlightIndex(i)}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.12, delay: i * 0.02 }}
                                        className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left transition last:border-b-0 ${i === highlightIndex ? "bg-[#F4FBFB]" : "bg-white"
                                            }`}
                                    >
                                        <span
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                                            style={{ background: meta.bg, color: meta.color }}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13.5px] font-semibold text-slate-500">
                                                <HighlightedName name={s.name} term={value} />
                                            </span>
                                            {s.brandName && (
                                                <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#F15A24]">
                                                    {s.brandName}
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide"
                                            style={{ background: meta.bg, color: meta.color }}
                                        >
                                            {meta.label}
                                        </span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}