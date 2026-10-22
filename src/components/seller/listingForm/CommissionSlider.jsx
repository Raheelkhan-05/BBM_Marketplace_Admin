import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

const MIN = 0.25;
const MAX = 100;

// ---------------------------------------------------------------------------
// Velocity-sensitive ("pressure-like") scrubbing
//
// The slider is relative, not absolute: the thumb moves by
//     Δvalue = Δpx / trackWidth * (MAX - MIN) * gain(speed)
// where `speed` is the smoothed pointer speed in px/ms.
//   - slow drag  -> tiny gain  -> fine, precise changes
//   - fast drag  -> large gain -> big jumps across the range
// gain interpolates *exponentially* (geometric) between GAIN_MIN and GAIN_MAX,
// so there is no threshold or step: every speed in between feels continuous,
// and one continuous touch can go slow -> fast -> slow without a hiccup.
// ---------------------------------------------------------------------------
const GAIN_MIN = 0.13;      // slowest drag: ~0.06% per px on a 250px track
const GAIN_MAX = 5;         // fastest flick: ~2% per px on a 250px track
const SPEED_LOW = 0.12;     // px/ms (~120 px/s) and below = fully "fine"
const SPEED_HIGH = 1.2;     // px/ms (~1600 px/s) and above = fully "fast"
const SPEED_TAU_MS = 50;    // smoothing time-constant of the speed estimate
const SAMPLE_MIN_MS = 8;    // merge pointer events closer than this (coalesced events)
const REVERSE_DAMP = 0.4;   // on direction reversal, cut speed so you can settle precisely
const DRAG_STEP = 0.05;     // output resolution while dragging
const TAP_STEP = 0.25;      // output resolution when tapping the track
const KEY_STEP = 0.25;
const KEY_STEP_BIG = 5;
const THUMB = 18;           // px
const THUMB_HIT = 20;       // px radius counted as "grabbed the thumb"
const TYPING_COMMIT_MS = 350;

function clamp(n, min, max) {
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
}

function gainForSpeed(speed) {
    const t = clamp((speed - SPEED_LOW) / (SPEED_HIGH - SPEED_LOW), 0, 1);
    return GAIN_MIN * Math.pow(GAIN_MAX / GAIN_MIN, t);
}

function roundTo(n, step) {
    // step is 0.05 / 0.25 — round then trim float noise
    return Math.round(Math.round(n / step) * step * 100) / 100;
}

// Portaled to document.body and positioned with `fixed` coordinates
// computed from the trigger icon's actual bounding rect. This is
// required, not optional: CommissionSlider is nested inside SectionCard
// and QuickUpdatePanel, both of which use overflow-hidden to drive their
// collapse/expand height animations. A plain `position: absolute`
// popover would be clipped at whichever of those ancestors' boundaries
// it hits first — portaling escapes the whole ancestor chain, since a
// child of document.body has no overflow-hidden parent to be clipped by.
function InfoTooltip({ C }) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState(null);
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);

    const POPOVER_WIDTH = 300; // matches the w-[280px] sm:w-[320px] below, used only for edge-clamping math
    const GAP = 8;

    const computePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();

        // Default: open below-left aligned to the icon. Clamp horizontally
        // so it never runs off the right edge of the viewport, and flip
        // above the icon if there isn't enough room below.
        let left = rect.left;
        const maxLeft = window.innerWidth - POPOVER_WIDTH - 12;
        if (left > maxLeft) left = Math.max(12, maxLeft);

        const estimatedHeight = 300; // rough — good enough for a flip decision
        const spaceBelow = window.innerHeight - rect.bottom;
        const openAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

        const top = openAbove ? rect.top - GAP : rect.bottom + GAP;

        setCoords({ top, left, openAbove, anchorLeft: rect.left + rect.width / 2 });
    }, []);

    const toggleOpen = (e) => {
        e.stopPropagation();
        if (!open) computePosition();
        setOpen((v) => !v);
    };

    useEffect(() => {
        if (!open) return;

        const onClick = (e) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target) &&
                popoverRef.current && !popoverRef.current.contains(e.target)
            ) {
                setOpen(false);
            }
        };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        // Keep the popover glued to the icon if the page scrolls or
        // resizes while it's open (e.g. the parent section's own expand
        // animation is still settling).
        const onReposition = () => computePosition();

        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onReposition, true);
        window.addEventListener("resize", onReposition);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onReposition, true);
            window.removeEventListener("resize", onReposition);
        };
    }, [open, computePosition]);

    const bullets = [
        "Category visibility",
        "Buyer discovery",
        "Targeted promotions",
        "Distribution network promotion",
        "Featured product placements",
        "Promotional campaigns",
    ];

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={toggleOpen}
                aria-label="Why increase your promotion budget?"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
                style={{ color: open ? C.secondary : C.muted }}
            >
                <Info className="h-3.5 w-3.5" />
            </button>

            {open && coords && createPortal(
                <div
                    ref={popoverRef}
                    onClick={(e) => e.stopPropagation()}
                    className="fixed z-[5] w-[280px] rounded-2xl border bg-white p-3.5 shadow-xl sm:w-[320px]"
                    style={{
                        borderColor: C.hair,
                        top: coords.openAbove ? undefined : coords.top,
                        bottom: coords.openAbove ? window.innerHeight - coords.top : undefined,
                        left: coords.left,
                    }}
                >
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-[12.5px] font-extrabold leading-snug tracking-wide" style={{ color: C.ink }}>
                            Why increase your promotion budget?
                        </p>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]"
                            style={{ color: C.muted }}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <p className="mt-2 text-[11.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.muted }}>
                        Your promotional budget determines how aggressively BBM can promote your products.
                    </p>
                    <p className="mt-2 text-[11.5px] font-semibold leading-relaxed tracking-wide" style={{ color: C.ink }}>
                        A higher budget can help us allocate more resources toward:
                    </p>

                    <ul className="mt-1.5 flex flex-col gap-1">
                        {bullets.map((b) => (
                            <li key={b} className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: C.secondary }} />
                                {b}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-2.5 rounded-lg px-2.5 py-2" style={{ background: `${C.secondary}0a` }}>
                        <p className="text-[11px] font-bold leading-snug tracking-wide" style={{ color: C.secondary }}>
                            You only pay this budget when an order is generated.
                        </p>
                    </div>

                    {/* Pointer nub — flips to point up/down depending on which
                        side the popover opened on, and stays roughly aligned
                        under/above the trigger icon regardless of the
                        left-edge clamping above. */}
                    <div
                        className="absolute h-3 w-3 rotate-45 border bg-white"
                        style={
                            coords.openAbove
                                ? { bottom: -6, left: Math.min(Math.max(coords.anchorLeft - coords.left - 6, 12), 280), borderColor: C.hair, borderTop: "none", borderLeft: "none" }
                                : { top: -6, left: Math.min(Math.max(coords.anchorLeft - coords.left - 6, 12), 280), borderColor: C.hair, borderBottom: "none", borderRight: "none" }
                        }
                    />
                </div>,
                document.body
            )}
        </>
    );
}

function CommissionSlider({ value, onChange, C, isErr, hideHint = false }) {
    // value: number | "" — the committed value from form state
    // local text lets the user type freely (e.g. "12." or "0.") without
    // getting clamped/reformatted on every keystroke
    const [text, setText] = useState(value === "" ? "" : String(value));
    const [dragging, setDragging] = useState(false);
    const syncedValueRef = useRef(value);

    // Slider drag session (null when idle). Lives in a ref so pointermove
    // never depends on stale closures or triggers re-renders by itself.
    const dragRef = useRef(null);
    const trackRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const typingTimerRef = useRef(null);
    const commitRef = useRef(null);

    // Keep the text field in sync when value changes from outside
    // (e.g. a chip toggle sets the same form field), but don't fight
    // the user while they're actively typing.
    if (syncedValueRef.current !== value && document.activeElement?.dataset?.commissionInput !== "true") {
        syncedValueRef.current = value;
        if (text !== (value === "" ? "" : String(value))) {
            setText(value === "" ? "" : String(value));
        }
    }

    const commit = useCallback(
        (raw) => {
            clearTimeout(typingTimerRef.current);
            const n = clamp(parseFloat(raw), MIN, MAX);
            const rounded = Math.round(n * 100) / 100; // keep up to 2 decimals
            onChangeRef.current(rounded);
            setText(String(rounded));
            syncedValueRef.current = rounded;
        },
        []
    );
    commitRef.current = commit;

    const setFromSlider = useCallback((n) => {
        clearTimeout(typingTimerRef.current);
        onChangeRef.current(n);
        setText(String(n));
        syncedValueRef.current = n;
    }, []);

    // don't leave a timer running after unmount
    useEffect(() => () => clearTimeout(typingTimerRef.current), []);

    const handleTextChange = (e) => {
        const raw = e.target.value;
        // allow empty, digits, one decimal point while typing
        if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
            setText(raw);
            const n = parseFloat(raw);
            if (!Number.isNaN(n) && n >= MIN && n <= MAX) {
                onChange(n);
                syncedValueRef.current = n;
            }

            // Commit automatically once the user pauses typing.
            clearTimeout(typingTimerRef.current);
            if (raw !== "" && !Number.isNaN(n)) {
                typingTimerRef.current = setTimeout(() => commitRef.current(raw), TYPING_COMMIT_MS);
            }
        }
    };

    const handleTextBlur = () => {
        if (text === "" || Number.isNaN(parseFloat(text))) {
            commit(MIN);
        } else {
            commit(text);
        }
    };

    const sliderValue = value === "" ? MIN : clamp(Number(value), MIN, MAX);
    const pct = ((sliderValue - MIN) / (MAX - MIN)) * 100;

    // ---- pointer (mouse / touch / pen) handling --------------------------
    const endDrag = useCallback((el, pointerId) => {
        dragRef.current = null;
        setDragging(false);
        try { el?.releasePointerCapture?.(pointerId); } catch { /* already released */ }
    }, []);

    const handlePointerDown = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (dragRef.current) return; // ignore a second finger mid-drag
        const track = trackRef.current;
        if (!track) return;

        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;

        const startPct = (sliderValue - MIN) / (MAX - MIN);
        dragRef.current = {
            id: e.pointerId,
            startX: e.clientX,
            lastX: e.clientX,
            lastT: e.timeStamp,
            accDx: 0,           // |px| accumulated since last speed sample
            accDt: 0,           // ms accumulated since last speed sample
            speed: 0,           // smoothed px/ms
            hasSpeed: false,
            dir: 0,
            value: sliderValue, // un-quantised value we integrate on
            lastEmitted: sliderValue,
            left: rect.left,
            width: rect.width,
            onThumb: Math.abs(e.clientX - (rect.left + startPct * rect.width)) <= THUMB_HIT,
        };

        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        setDragging(true);
    };

    const handlePointerMove = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.id) return;

        const dx = e.clientX - d.lastX;
        const dt = Math.max(0, e.timeStamp - d.lastT);
        d.lastX = e.clientX;
        d.lastT = e.timeStamp;

        // --- speed estimate: merge very close events, then EMA whose weight
        // depends on elapsed time. After a pause (dt large) the estimate
        // collapses to ~0, so resuming from a standstill is always precise.
        d.accDx += Math.abs(dx);
        d.accDt += dt;
        if (d.accDt >= SAMPLE_MIN_MS) {
            const inst = d.accDx / d.accDt;
            if (!d.hasSpeed) {
                d.speed = inst; // seed with the first real sample so a fast flick responds immediately
                d.hasSpeed = true;
            } else {
                const alpha = 1 - Math.exp(-d.accDt / SPEED_TAU_MS);
                d.speed += (inst - d.speed) * alpha;
            }
            d.accDx = 0;
            d.accDt = 0;
        }

        if (dx === 0) return;

        // Reversing direction usually means "I overshot, let me fine-tune".
        const dir = dx > 0 ? 1 : -1;
        if (d.dir !== 0 && dir !== d.dir) d.speed *= REVERSE_DAMP;
        d.dir = dir;

        const gain = gainForSpeed(d.speed);
        d.value = clamp(d.value + (dx / d.width) * (MAX - MIN) * gain, MIN, MAX);

        const q = clamp(roundTo(d.value, DRAG_STEP), MIN, MAX);
        if (q !== d.lastEmitted) {
            d.lastEmitted = q;
            setFromSlider(q);
        }
    };

    const handlePointerUp = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.id) return;

        // A short tap on the empty track (not on the thumb) jumps there;
        // the user can then scrub from that point with fine control.
        if (Math.abs(e.clientX - d.startX) < 4 && !d.onThumb) {
            const frac = clamp((e.clientX - d.left) / d.width, 0, 1);
            const n = clamp(roundTo(MIN + frac * (MAX - MIN), TAP_STEP), MIN, MAX);
            setFromSlider(n);
        }
        endDrag(e.currentTarget, e.pointerId);
    };

    const handlePointerCancel = (e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.id) return;
        endDrag(e.currentTarget, e.pointerId);
    };

    const handleKeyDown = (e) => {
        let next = null;
        const big = e.shiftKey;
        switch (e.key) {
            case "ArrowRight":
            case "ArrowUp":
                next = sliderValue + (big ? KEY_STEP_BIG : KEY_STEP); break;
            case "ArrowLeft":
            case "ArrowDown":
                next = sliderValue - (big ? KEY_STEP_BIG : KEY_STEP); break;
            case "PageUp": next = sliderValue + KEY_STEP_BIG; break;
            case "PageDown": next = sliderValue - KEY_STEP_BIG; break;
            case "Home": next = MIN; break;
            case "End": next = MAX; break;
            default: return;
        }
        e.preventDefault();
        setFromSlider(clamp(roundTo(next, KEY_STEP), MIN, MAX));
    };

    return (
        <div
            className="flex flex-col gap-2.5 rounded-2xl border p-3"
            style={{
                borderColor: isErr ? "rgba(199,31,17,0.35)" : C.hairSoft,
                background: `${C.secondary}06`,
            }}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                        Promotion & Visibility Budget <span style={{ color: C.primary }}>*</span>
                        <InfoTooltip C={C} />
                    </span>
                    {!hideHint && (
                        <span className="text-[10px] font-medium leading-snug tracking-wider" style={{ color: C.muted }}>
                            Higher promotional budgets may receive higher placement and greater visibility, subject to relevance and platform performance
                        </span>
                    )}

                </div>

                <div className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1.5" style={{ background: `${C.muted}14` }}>
                    <input
                        data-commission-input="true"
                        type="text"
                        inputMode="decimal"
                        value={text}
                        onChange={handleTextChange}
                        onBlur={handleTextBlur}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-[52px] bg-transparent text-right text-[18px] font-extrabold leading-none tabular-nums outline-none"
                        style={{ color: C.muted }}
                    />
                    <span className="text-[18px] font-extrabold leading-none" style={{ color: C.muted }}>
                        %
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3 px-0.5">
                <span className="w-8 shrink-0 text-[10px] font-bold tabular-nums" style={{ color: C.muted }}>
                    {MIN}%
                </span>

                {/* Hit area: tall for easy grabbing. touch-action: pan-y lets the
                    page still scroll vertically, while horizontal drags are ours. */}
                <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Promotion and visibility budget percentage"
                    aria-valuemin={MIN}
                    aria-valuemax={MAX}
                    aria-valuenow={sliderValue}
                    aria-valuetext={`${sliderValue}%`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onLostPointerCapture={handlePointerCancel}
                    onKeyDown={handleKeyDown}
                    className="group relative h-10 flex-1 cursor-grab select-none outline-none active:cursor-grabbing"
                    style={{ touchAction: "pan-y", WebkitTapHighlightColor: "transparent" }}
                >
                    {/* Inner track is inset by half a thumb so the thumb never overflows the ends */}
                    <div ref={trackRef} className="absolute inset-y-0" style={{ left: THUMB / 2, right: THUMB / 2 }}>
                        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: `${C.secondary}18` }} />
                        <div
                            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                            style={{ width: `${pct}%`, background: C.secondary }}
                        />
                        <div
                            className="pointer-events-none absolute top-1/2"
                            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                        >
                            <span
                                className="absolute rounded-full opacity-0 transition-opacity duration-150 group-focus-visible:opacity-100"
                                style={{ inset: -5, background: `${C.secondary}30` }}
                            />
                            <div
                                className="relative rounded-full border-2 border-white"
                                style={{
                                    width: THUMB,
                                    height: THUMB,
                                    background: C.secondary,
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                                    transform: `scale(${dragging ? 1.2 : 1})`,
                                    transition: "transform 120ms ease",
                                }}
                            />
                        </div>
                    </div>
                </div>

                <span className="w-8 shrink-0 text-right text-[10px] font-bold tabular-nums" style={{ color: C.muted }}>
                    {MAX}%
                </span>
            </div>

            {isErr && (
                <p className="text-[11px] font-bold" style={{ color: "#c71f11" }}>
                    Choose a commission % between 0.25 and 100.
                </p>
            )}
        </div>
    );
}

export default CommissionSlider;