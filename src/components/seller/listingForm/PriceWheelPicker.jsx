// components/seller/listingForm/PriceWheelPicker.jsx
//
// CHANGES (this pass):
// - REUSABLE INTERNALS: `useWheelColumn`, `WheelColumn`, `sanitizeDecimal`,
//   and the layout constants (`ITEM_HEIGHT`, `WHEEL_HEIGHT`, `PADDING`) are
//   now named exports. This popup component (the default export) is
//   completely unchanged — the export is purely so CustomPricingModal.jsx
//   can embed the same scroll-wheel + tap-to-type behaviour INLINE, right
//   in the pricing card, without the modal/backdrop/confirm-button chrome
//   around it.
//
// (Everything below this point is unchanged from before.)
//
// - MANUAL ENTRY: tapping the highlighted (centre) value now turns it into
//   a real text input (numeric keyboard on mobile). The seller can type an
//   exact number instead of scrolling. Behaviour:
//     * Typing is sanitised to digits + one dot + max 2 decimals.
//     * Enter  → commits the typed value AND confirms (same as tapping the
//                confirm button), so a typed price is a single-tap flow.
//     * Blur   → commits the typed value onto the wheel (wheel re-centres
//                on it) if it's valid, otherwise reverts to the wheel value.
//     * Esc    → cancels editing, wheel value untouched.
//     * The confirm button always uses the typed value while editing, and
//       refuses (with an inline message) if it's out of range.
//   Validation reuses the same filterFn the wheel already uses, so typed
//   values obey exactly the same bounds as scrolled values
//   (currency > 0, percent within [min, max]).
// - Tapping a non-centre row now scrolls that row to the centre.
// - New optional prop `confirmVerb` (default "Use") so callers whose
//   confirm action commits/saves immediately can label the button
//   accordingly ("Save ₹1,200"). Existing callers are unaffected.
// - The scroller ignores pointer events while typing so an accidental
//   swipe can't fight the keyboard.

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLenis } from "../../../providers/SmoothScrollProvider.jsx";
import { X, Minus, Plus, Check } from "lucide-react";
import { C, EASE } from "./FormPrimitives.jsx";

export const WHEEL_SCROLL_ENABLED = false;
const LIVE_COMMIT_DEBOUNCE_MS = 350;
export const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
export const PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

// One static window of values, big enough that ordinary scrolling never
// needs to extend it mid-drag. 300 each side = 601 values total — e.g. for
// a 1-point percent step that's 0–300% of range; for a currency step at 2%
// of reference price, roughly ±600% of that price. Reaching the very edge
// just stops scrolling further (same as any bounded picker) — the seller
// can still type an exact value by hand. This replaces the old "prepend
// more values and patch scrollTop while scrolling" approach, which is what
// caused the visible value "hopping": that approach mutated the array and
// manually adjusted scroll position WHILE a fling was still in motion on
// its own native timeline, and the two would desync under fast scrolling,
// causing `selected` to briefly read the wrong index — a big, sudden jump.
const WHEEL_SPAN = 300;

const HIGHLIGHT_INSET_X = 10;
const ERROR_RED = "#c71f11";

const CURRENCY_STEPS = [
    { value: 10, label: "₹10" },
    { value: 100, label: "₹100" },
    { value: 1000, label: "₹1,000" },
    { value: 10000, label: "₹10,000" },
];
const PERCENT_STEPS = [
    { value: 0.05, label: "0.05%" },
    { value: 0.1, label: "0.1%" },
    { value: 1, label: "1%" },
    { value: 10, label: "10%" },
];
const PERCENT_DECREASE_MAX = 99;

// mustInclude: if given, that exact value is spliced into the generated
// grid (even though it isn't an exact multiple of `step` from `anchor`),
// so the very first render of a wheel never has to approximate a real
// stored value onto the nearest grid tick. Without this, loading an
// existing listing's saved price (e.g. 1000) into a wheel anchored on the
// catalog's reference price snapped it to the nearest 2%-step tick
// (e.g. 991.2) purely for display — silently showing the wrong number
// even though nothing was ever actually changed.
function buildValues(anchor, step, span = WHEEL_SPAN, filterFn, mustInclude) {
    const values = [];
    for (let i = -span; i <= span; i++) {
        const v = Math.round((anchor + i * step) * 100) / 100;
        if (!filterFn || filterFn(v)) values.push(v);
    }
    if (mustInclude != null) {
        const rounded = Math.round(mustInclude * 100) / 100;
        if (!filterFn || filterFn(rounded)) {
            const idx = values.findIndex((v) => v === rounded);
            if (idx === -1) {
                values.push(rounded);
                values.sort((a, b) => a - b);
            }
        }
    }
    return values;
}

// Keeps only digits and a single dot, with at most 2 decimal places —
// matches the 2-dp rounding the wheel itself uses for its values.
export function sanitizeDecimal(raw) {
    let s = String(raw).replace(/[^\d.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
        s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
    }
    return s.slice(0, 10);
}

export function useWheelColumn(initialValue, initialStep, filterFn, gridAnchor) {
    const anchorRef = useRef(gridAnchor != null ? gridAnchor : initialValue);
    const [step, setStep] = useState(initialStep);
    // mustInclude=initialValue — guarantees the seller's real saved price
    // is exactly selectable on first mount, never approximated to a
    // nearby reference-price tick.
    const [values, setValues] = useState(() => buildValues(anchorRef.current, initialStep, WHEEL_SPAN, filterFn, initialValue));
    const [selected, setSelected] = useState(() => nearestValue(values, initialValue)); // now finds an EXACT match, since it's guaranteed present
    // Tags WHY `selected` last changed, so a consumer (InlineWheelField)
    // can tell "the seller actually scrolled this field" apart from "this
    // field was just resynced programmatically" (initial mount, or a
    // jumpTo/jumpToExact triggered by a sibling field's edit, a GST-mode
    // flip, etc). Only a real scroll should ever be treated as the seller
    // choosing THIS field's basis — a programmatic resync must never
    // silently commit its value back up as if the seller had picked it.
    const changeSource = useRef("init"); // "init" | "scroll" | "programmatic"

    const containerRef = useRef(null);
    const rafRef = useRef(null);
    const isProgrammaticScroll = useRef(false);
    const pendingScrollRef = useRef(null);

    useEffect(() => {
        if (pendingScrollRef.current == null) return;
        const target = pendingScrollRef.current;
        const idx = values.findIndex((v) => v === target);
        if (idx >= 0 && containerRef.current) {
            isProgrammaticScroll.current = true;
            containerRef.current.scrollTop = idx * ITEM_HEIGHT;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => { isProgrammaticScroll.current = false; });
            });
        }
        pendingScrollRef.current = null;
    }, [values]);

    const jumpTo = useCallback((targetValue, targetStep, targetAnchor) => {
        const useStep = targetStep ?? step;
        const useAnchor = targetAnchor != null ? targetAnchor : anchorRef.current;
        anchorRef.current = useAnchor;
        const list = buildValues(useAnchor, useStep, WHEEL_SPAN, filterFn);

        const snapped = nearestValue(list, targetValue);
        changeSource.current = "programmatic";
        setStep(useStep);
        setValues(list);
        setSelected(snapped);
        pendingScrollRef.current = snapped;
    }, [step, filterFn]);

    const jumpToExact = useCallback((targetValue, targetStep) => {
        const useStep = targetStep ?? step;
        const v = Math.round(targetValue * 100) / 100;
        anchorRef.current = v;
        changeSource.current = "programmatic";
        setStep(useStep);
        setValues(buildValues(v, useStep, WHEEL_SPAN, filterFn));
        setSelected(v);
        pendingScrollRef.current = v;
    }, [step, filterFn]);

    const handleScroll = useCallback(() => {
        if (isProgrammaticScroll.current) return;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const el = containerRef.current;
            if (!el) return;
            const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
            const clamped = Math.max(0, Math.min(values.length - 1, idx));
            const val = values[clamped];
            if (val !== undefined && val !== selected) {
                changeSource.current = "scroll";
                setSelected(val);
            }
        });
    }, [values, selected]);

    // NEW — reads scrollTop directly, bypassing any stale/throttled state.
    // Called once the browser reports scrolling has TRULY finished
    // (scrollend, or a settle-timeout fallback), so it always reflects
    // where the wheel actually came to rest — not wherever the last
    // rAF-throttled poll happened to catch it mid-fling.
    const syncToActualScrollPosition = useCallback(() => {
        const el = containerRef.current;
        if (!el || isProgrammaticScroll.current) return;
        const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(values.length - 1, idx));
        const val = values[clamped];
        if (val !== undefined) {
            changeSource.current = "scroll";
            setSelected(val); // no-op if already correct, but guarantees correctness if it wasn't
        }
    }, [values]);

    return { values, selected, step, containerRef, handleScroll, syncToActualScrollPosition, jumpTo, jumpToExact, changeSource };
}

// Embedded, no modal/backdrop/confirm button. The wheel itself updates its
// own displayed value every frame (smooth, local) — but only commits up to
// the parent once scrolling has actually settled. Committing every frame
// was what caused both the visible glitch (parent recompute fighting the
// in-flight scroll) and the runaway percentages (an intermediate, not-yet-
// consistent value got written as the real price).
// Embedded, no modal/backdrop/confirm button, no nudge buttons — just the
// field itself. Sliding it scrolls through values; tapping it lets you type
// an exact one.
//
// FEEDBACK-LOOP FIX: the wheel commits its own scrolled/typed value up to
// the parent (onCommit), and the parent typically stores it and echoes a
// recomputed value straight back down as `seed` (e.g. after re-deriving
// unit/pack/master-pack from a single stored basePrice). That echo is
// rarely bit-for-bit identical to what we sent up — dividing and
// re-multiplying through pack/master-pack sizes introduces float noise —
// so the old code's ">0.004 difference ⇒ force jumpToExact(seed)" rule
// was firing on ORDINARY ECHOES of our own last commit, snapping the wheel
// backward mid-scroll. That's the "jumps to the last updated value" bug.
//
// The fix: remember exactly what we last sent up (`lastCommitted`). If the
// incoming `seed` matches that (not a genuinely external change), ignore
// it — our own live/scrolled value is more current and correct than a
// stale, already-superseded echo of what we told the parent a moment ago.
// Only a seed that does NOT match our last commit (a real external change:
// GST-mode flip, "Clear", switching to a different product) is honoured.
// Embedded, no modal/backdrop/confirm button — just the field itself.
// Sliding scrolls through values; tapping lets you type an exact one.
//
// SYNC MODEL (grace period, not value comparison): the wheel commits its
// own scrolled/typed value up to the parent, and the parent usually
// re-renders with a recomputed `seed` shortly after — sometimes bit-for-
// bit identical, sometimes off by a little because it went through real
// unit-conversion math (pack/master-pack, GST-inclusive/exclusive). A
// value-difference threshold can't tell those two cases apart — legitimate
// external updates can be smaller OR larger than any threshold you pick,
// which is exactly why every previous version of this still glitched.
//
// The reliable signal is TIME: right after WE commit a value, any seed
// change that arrives within a short grace window is almost certainly the
// echo of that same commit working its way back down — so we ignore it.
// Once the grace window has passed, a seed change is treated as genuinely
// external (GST-mode flip, switching product, "Clear", a sibling field's
// edit changing this field's derived value) and IS honoured exactly,
// via jumpToExact — never snapped to a grid.
const RESYNC_GRACE_MS = 400;

export function InlineWheelField({ seed, step, filterFn, formatValue, prefix, suffix, rangeMessage, onCommit, gridAnchor }) {
    const wheel = useWheelColumn(seed, step, filterFn, gridAnchor);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [draftError, setDraftError] = useState("");

    const lastCommitAt = useRef(0);
    const lastSeed = useRef(seed);
    const lastGridAnchor = useRef(gridAnchor);
    const commitTimer = useRef(null);

    // --- live-typing bookkeeping ---
    const liveTimer = useRef(null);       // debounce timer for typed input
    const editStartValue = useRef(null);  // value when this edit session began (for Esc revert)
    const lastLiveValue = useRef(null);   // last typed value already pushed to the parent

    useEffect(() => () => clearTimeout(liveTimer.current), []);

    // Scroll settling -> commit (unchanged)
    useEffect(() => {
        if (wheel.changeSource.current !== "scroll") return;
        clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
            lastCommitAt.current = Date.now();
            onCommit(wheel.selected);
        }, 200);
        return () => clearTimeout(commitTimer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wheel.selected]);

    // External seed / anchor resync (unchanged)
    useEffect(() => {
        const seedChanged = seed !== lastSeed.current;
        const anchorChanged = gridAnchor !== lastGridAnchor.current;
        if (!seedChanged && !anchorChanged) return;
        lastSeed.current = seed;
        lastGridAnchor.current = gridAnchor;

        const isLikelyOwnEcho = Date.now() - lastCommitAt.current < RESYNC_GRACE_MS;
        if (isLikelyOwnEcho) return;

        // While typing, never yank the wheel/draft out from under the seller.
        if (!editing) {
            wheel.jumpToExact(seed, step);
            lastCommitAt.current = Date.now();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed, step, gridAnchor]);

    const parseValue = (str) => {
        if (str == null || str.trim() === "" || str === ".") return null;
        const n = Number(str);
        if (!Number.isFinite(n)) return null;
        const v = Math.round(n * 100) / 100;
        return filterFn(v) ? v : null;
    };
    const parseDraft = () => parseValue(draft);

    const startEdit = () => {
        clearTimeout(commitTimer.current); // drop any pending scroll-commit
        editStartValue.current = wheel.selected;
        lastLiveValue.current = null;
        setDraft(String(wheel.selected));
        setDraftError("");
        setEditing(true);
    };

    // revert = true (Esc): undo any live commits made during this edit session.
    const cancelEdit = (revert = false) => {
        clearTimeout(liveTimer.current);
        if (revert && lastLiveValue.current != null && editStartValue.current != null) {
            const original = editStartValue.current;
            wheel.jumpToExact(original, step);
            lastCommitAt.current = Date.now();
            onCommit(original);
        }
        lastLiveValue.current = null;
        setEditing(false);
        setDraftError("");
    };

    // Final commit (Enter / blur with a valid value): also re-centres the wheel.
    const commitDraft = () => {
        const v = parseDraft();
        if (v == null) return null;
        clearTimeout(liveTimer.current);
        clearTimeout(commitTimer.current);
        const isCurrencyField = suffix == null && prefix != null;
        const rebasedStep = isCurrencyField
            ? (Math.round(v * 0.02 * 100) / 100 || step)
            : step;
        wheel.jumpToExact(v, rebasedStep);
        lastCommitAt.current = Date.now();
        if (v !== lastLiveValue.current) onCommit(v); // skip if already pushed live
        lastLiveValue.current = null;
        setEditing(false);
        setDraftError("");
        return v;
    };

    // LIVE: every keystroke restarts a short timer; once the seller pauses,
    // the typed value is pushed up WITHOUT leaving edit mode or waiting for
    // blur/Enter. Invalid / empty / partial values (e.g. "", ".", "0") are
    // simply not committed until they become valid.
    const handleDraftChange = (next) => {
        const cleaned = String(next).replace(/[^\d.]/g, "").slice(0, 10);
        setDraft(cleaned);
        if (draftError) setDraftError("");

        clearTimeout(liveTimer.current);
        const v = parseValue(cleaned);
        if (v == null) return;

        liveTimer.current = setTimeout(() => {
            if (v === lastLiveValue.current) return;
            lastLiveValue.current = v;
            lastCommitAt.current = Date.now(); // protects against our own echo
            onCommit(v);
        }, LIVE_COMMIT_DEBOUNCE_MS);
    };

    const handleInputBlur = () => {
        if (!editing) return;
        if (parseDraft() == null) {
            // Invalid draft on blur: keep whatever was last pushed live
            // (if anything) instead of throwing it away.
            clearTimeout(liveTimer.current);
            if (lastLiveValue.current != null) wheel.jumpToExact(lastLiveValue.current, step);
            cancelEdit(false);
        } else {
            commitDraft();
        }
    };
    const handleEnter = () => {
        const v = commitDraft();
        if (v == null) setDraftError(rangeMessage);
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="w-full">
                <WheelColumn wheel={wheel} formatValue={formatValue} editing={editing} draft={draft} hasError={!!draftError}
                    prefix={prefix} suffix={suffix} onDraftChange={handleDraftChange} onStartEdit={startEdit}
                    onInputBlur={handleInputBlur} onEnter={handleEnter} onCancelEdit={() => cancelEdit(true)} />
            </div>
            <p className="text-center text-[10px] font-semibold leading-snug tracking-wide" style={{ color: draftError ? ERROR_RED : C.muted }}>
                {draftError || (WHEEL_SCROLL_ENABLED ? "Tap to type, or slide to scroll" : "Tap to type")}
            </p>
        </div>
    );
}

export function WheelColumn({ wheel, formatValue, editing, draft, hasError, prefix, suffix, onDraftChange, onStartEdit, onInputBlur, onEnter, onCancelEdit }) {
    const { values, selected, containerRef, handleScroll, syncToActualScrollPosition } = wheel;
    const didMountScroll = useRef(false);
    const inputRef = useRef(null);
    const fallbackTimer = useRef(null);

    const onScroll = () => {
        handleScroll();
        // Fallback settle-check for browsers without `scrollend` (older
        // Safari): if no further scroll events arrive for 120ms, treat
        // that as settled and re-read the exact final position.
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = setTimeout(syncToActualScrollPosition, 120);
    };

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Authoritative signal: the browser itself says scrolling (incl.
        // momentum + snap-settling) has fully finished. Always wins over
        // the rAF-throttled poll above, which can catch the position one
        // row early on a fast multi-row fling.
        const onScrollEnd = () => { clearTimeout(fallbackTimer.current); syncToActualScrollPosition(); };
        el.addEventListener("scrollend", onScrollEnd);
        return () => {
            el.removeEventListener("scrollend", onScrollEnd);
            clearTimeout(fallbackTimer.current);
        };
    }, [containerRef, syncToActualScrollPosition]);

    useEffect(() => {
        if (didMountScroll.current) return;
        didMountScroll.current = true;
        const idx = values.findIndex((v) => v === selected);
        if (containerRef.current && idx >= 0) containerRef.current.scrollTop = idx * ITEM_HEIGHT;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Focus + select-all the moment editing starts, so typing replaces the
    // current value instead of appending to it.
    useEffect(() => {
        if (!editing) return;
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.select();
    }, [editing]);

    const scrollToIndex = (idx) => {
        containerRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
    };

    return (
        // Clipped to exactly ONE row (ITEM_HEIGHT) — so this reads as a
        // plain bordered input field, not a wheel. No highlight box, no
        // fade gradients: there's nothing to fade, since only the value
        // that's actually centred is ever visible at rest. The full list
        // of values still scrolls underneath with the same snap physics as
        // before — sliding it just reveals other values passing through
        // this one-row window until it settles on one.
        <div
            className="relative min-w-0 flex-1 overflow-hidden rounded-lg border"
            style={{ height: ITEM_HEIGHT, borderColor: hasError ? ERROR_RED : C.hair, background: "#fff" }}
        >
            {/* Manual-entry overlay — same size as the field itself now. */}
            {editing && (
                <div
                    className="absolute inset-0 z-20 flex items-center justify-center gap-1 bg-white px-2 rounded-lg"
                    style={{ border: `1.5px solid ${hasError ? ERROR_RED : C.secondary}` }}
                >
                    {prefix && <span className="text-[16px] font-extrabold" style={{ color: C.muted }}>{prefix}</span>}
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        autoComplete="off"
                        value={draft}
                        onChange={(e) => onDraftChange(sanitizeDecimal(e.target.value))}
                        onBlur={onInputBlur}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); onEnter(); }
                            else if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
                        }}
                        aria-label="Type a value"
                        className="min-w-0 flex-1 bg-transparent text-center font-extrabold tabular-nums tracking-wide focus:outline-none"
                        style={{ fontSize: 17, color: C.ink }}
                    />
                    {suffix && <span className="text-[16px] font-extrabold" style={{ color: C.muted }}>{suffix}</span>}
                </div>
            )}

            {/* The scroll list is kept mounted (not conditionally rendered)
                so containerRef/scrollTop stay valid across edit/commit —
                it's just faded out and made non-interactive while typing. */}
            <div
                ref={containerRef}
                onScroll={onScroll}
                data-lenis-prevent={WHEEL_SCROLL_ENABLED ? "" : undefined}
                onWheel={WHEEL_SCROLL_ENABLED ? (e) => e.stopPropagation() : undefined}
                onTouchMove={WHEEL_SCROLL_ENABLED ? (e) => e.stopPropagation() : undefined}
                className="hide-scrollbar absolute inset-x-0"
                style={{
                    top: -PADDING,
                    height: WHEEL_HEIGHT,
                    overflowY: WHEEL_SCROLL_ENABLED ? "auto" : "hidden",
                    overscrollBehavior: WHEEL_SCROLL_ENABLED ? "contain" : "auto",
                    scrollSnapType: WHEEL_SCROLL_ENABLED ? "y mandatory" : "none",
                    WebkitOverflowScrolling: "touch",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    pointerEvents: editing ? "none" : undefined,
                    opacity: editing ? 0 : 1,
                }}
            >
                <div style={{ height: PADDING }} />
                {values.map((v, i) => {
                    const isActive = v === selected;
                    return (
                        <div
                            key={v}
                            onClick={() => (isActive ? onStartEdit() : scrollToIndex(i))}
                            style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center", cursor: isActive ? "text" : "pointer" }}
                            className="flex items-center justify-center px-2"
                        >
                            {/* Uniform styling — no "big centre / small faded
                                neighbours" treatment, since neighbours are
                                never visible at rest anyway; only relevant
                                while a slide is passing through. */}
                            <span
                                className="tabular-nums tracking-wide whitespace-nowrap"
                                style={{ fontSize: 17, fontWeight: 800, color: C.ink }}
                            >
                                {formatValue(v)}
                            </span>
                        </div>
                    );
                })}
                <div style={{ height: PADDING }} />
            </div>
        </div>
    );
}

// Anchor is fixed (e.g. the item's default price) — every generated value is
// an exact multiple of `step` away from that fixed point, so ticks are
// always clean 2%-of-default steps and never drift after GST-mode flips or
// repeated edits. Previously the anchor was whatever value happened to be
// centred, so drift compounded tick after tick.
function nearestValue(values, target) {
    let best = values[0], bestDiff = Infinity;
    for (const v of values) {
        const diff = Math.abs(v - target);
        if (diff < bestDiff) { bestDiff = diff; best = v; }
    }
    return best;
}


function NudgeButton({ icon: Icon, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 active:scale-90"
            style={{ borderColor: C.hair, color: C.secondary }}
        >
            <Icon className="h-4 w-4" />
        </button>
    );
}

// unit: "currency" | "percent"
// For percent mode, direction ("decrease" | "increase") is supplied by the
// caller (e.g. a Decrease/Increase toggle) — this wheel only ever scrolls a
// plain, unsigned magnitude that matches that direction:
//   - decrease: 0% to 99%
//   - increase: 0% and up, no ceiling
//
// `onConfirm(value)` receives the final number (scrolled OR typed).
// `confirmVerb` labels the confirm button ("Use" by default).
export default function PriceWheelPicker({
    open, onClose, onConfirm,
    initialValue, referenceValue, loadingReference,
    unit = "currency",
    unitLabel = "Pack",
    referenceLabel = "Default price",
    direction = "decrease",
    confirmVerb = "Use",
    min,
    max,
}) {
    const isPercent = unit === "percent";
    const isIncrease = isPercent && direction === "increase";
    const stepOptions = isPercent ? PERCENT_STEPS : CURRENCY_STEPS;
    const defaultStep = isPercent ? 1 : 10;

    const percentMin = min != null ? min : 0;
    const percentMax = max != null ? max : (isIncrease ? Infinity : PERCENT_DECREASE_MAX);

    const filterFn = isPercent
        ? (v) => v >= percentMin && v <= percentMax
        : (v) => v > 0;

    const rawSeed = initialValue != null && initialValue !== "" ? Number(initialValue) : 0;
    const seed = isPercent ? Math.min(Math.max(rawSeed, percentMin), percentMax) : rawSeed;

    const wheel = useWheelColumn(seed, defaultStep, filterFn);

    // ---- manual entry state ----
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [draftError, setDraftError] = useState("");

    const rangeMessage = isPercent
        ? (Number.isFinite(percentMax)
            ? `Enter a value between ${percentMin}% and ${percentMax}%.`
            : `Enter a value of ${percentMin}% or more.`)
        : "Enter a price greater than ₹0.";

    // Returns the typed number if it's valid for this wheel, else null.
    const parseDraft = () => {
        if (draft.trim() === "" || draft === ".") return null;
        const n = Number(draft);
        if (!Number.isFinite(n)) return null;
        const v = Math.round(n * 100) / 100;
        return filterFn(v) ? v : null;
    };

    const startEdit = () => {
        setDraft(String(wheel.selected));
        setDraftError("");
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
        setDraftError("");
    };

    // Applies a valid typed value to the wheel (wheel re-centres on it) and
    // leaves edit mode. Returns the value, or null if the draft is invalid.
    const commitDraft = () => {
        const v = parseDraft();
        if (v == null) return null;
        const rebasedStep = isPercent
            ? wheel.step
            : (Math.round(v * 0.02 * 100) / 100 || wheel.step);
        wheel.jumpToExact(v, rebasedStep);
        setEditing(false);
        setDraftError("");
        return v;
    };

    const handleDraftChange = (next) => {
        setDraft(next);
        if (draftError) setDraftError("");
    };

    // Blur: keep a valid value, silently revert an invalid one.
    const handleInputBlur = () => {
        if (!editing) return;
        if (parseDraft() == null) cancelEdit();
        else commitDraft();
    };

    const handleConfirm = () => {
        if (editing) {
            const v = commitDraft();
            if (v == null) { setDraftError(rangeMessage); return; }
            onConfirm(v);
            return;
        }
        onConfirm(wheel.selected);
    };

    // Locks page/background scroll while this sheet is open. WheelColumn's
    // own container keeps scrolling normally because the check below only
    // blocks events whose target is OUTSIDE this modal's DOM subtree —
    // everything inside modalRef (the wheel columns, step chips, buttons,
    // the manual-entry input) is left completely alone.
    const modalRef = useRef(null);
    const lenis = useLenis();

    useEffect(() => {
        if (!open) return;

        const isInsideModal = (e) => !!modalRef.current && modalRef.current.contains(e.target);

        const blockScroll = (e) => {
            if (!isInsideModal(e)) e.preventDefault();
        };

        const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
        const blockKeyScroll = (e) => {
            if (!SCROLL_KEYS.includes(e.key)) return;
            if (isInsideModal(e)) return;
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
            e.preventDefault();
        };

        // Stop Lenis directly — the window-level preventDefault listeners
        // below only fight the browser's native scroll; Lenis runs its own
        // independent wheel/touch handling. If some OUTER modal already
        // called lenis.stop() before this opened, calling it again is a
        // harmless no-op — but we only call lenis.start() on cleanup if WE
        // were the one that stopped it.
        const weStoppedLenis = !!lenis && typeof lenis.stop === "function";
        if (weStoppedLenis) lenis.stop();

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        window.addEventListener("wheel", blockScroll, { passive: false, capture: true });
        window.addEventListener("touchmove", blockScroll, { passive: false, capture: true });
        window.addEventListener("keydown", blockKeyScroll, { passive: false, capture: true });

        return () => {
            document.body.style.overflow = prevOverflow;
            if (weStoppedLenis && typeof lenis.start === "function") lenis.start();

            window.removeEventListener("wheel", blockScroll, { capture: true });
            window.removeEventListener("touchmove", blockScroll, { capture: true });
            window.removeEventListener("keydown", blockKeyScroll, { capture: true });
        };
    }, [open, lenis]);

    const nudge = (dir) => {
        const el = wheel.containerRef.current;
        if (!el) return;
        el.scrollBy({ top: dir * ITEM_HEIGHT, behavior: "smooth" });
    };

    const jumpToReference = () => {
        if (editing) cancelEdit();
        if (isPercent) {
            wheel.jumpTo(referenceValue != null ? referenceValue : percentMin, wheel.step);
        } else {
            wheel.jumpTo(referenceValue, wheel.step);
        }
    };

    const formatValue = (v) => (isPercent ? `${v}%` : `₹${v.toLocaleString("en-IN")}`);

    if (!open) return null;

    // A bounded percent wheel (min/max both given) is an absolute-value
    // picker (e.g. "pick a commission rate"), not a relative discount/markup
    // — so it gets its own plain copy instead of the "increase/decrease
    // relative to a reference price" language used elsewhere.
    const isBoundedAbsolute = isPercent && min != null && max != null;

    // What the confirm button will submit right now.
    const previewValue = editing ? (parseDraft() ?? wheel.selected) : wheel.selected;

    return (
        <motion.div
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                ref={modalRef}
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-t-[24px] bg-white p-5 sm:rounded-[20px]"
            >
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                        {isBoundedAbsolute ? `Set ${unitLabel.toLowerCase()} %` : isPercent ? `Set % ${isIncrease ? "increase" : "decrease"}` : `Set price per ${unitLabel}`}
                    </p>
                    <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                {isBoundedAbsolute ? (
                    <p className="mt-1.5 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                        Scroll to choose your rate, from {percentMin}% to {percentMax}%.
                    </p>
                ) : isPercent && (
                    <p className="mt-1.5 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                        {isIncrease
                            ? <>Scroll to choose how much to <span style={{ color: C.warn }}>increase</span> this buyer's price, relative to {referenceLabel.toLowerCase()}.</>
                            : <>Scroll to choose how much to <span style={{ color: C.ok }}>decrease</span> this buyer's price (up to {PERCENT_DECREASE_MAX}%), relative to {referenceLabel.toLowerCase()}.</>}
                    </p>
                )}

                {!isPercent && referenceValue > 0 && (
                    <button type="button" onClick={jumpToReference} className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors duration-150 active:scale-[0.99]" style={{ background: `${C.secondary}0a`, border: `1px dashed ${C.secondary}35` }}>
                        <span className="text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>
                            {loadingReference ? "Checking…" : `${referenceLabel}: ₹${referenceValue.toLocaleString("en-IN")}`}
                        </span>
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.secondary }}>Jump here</span>
                    </button>
                )}
                {isBoundedAbsolute && referenceValue != null && (
                    <button type="button" onClick={jumpToReference} className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors duration-150 active:scale-[0.99]" style={{ background: `${C.secondary}0a`, border: `1px dashed ${C.secondary}35` }}>
                        <span className="text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>
                            {referenceLabel}: {referenceValue}%
                        </span>
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.secondary }}>Jump here</span>
                    </button>
                )}
                {isPercent && !isBoundedAbsolute && (
                    <button type="button" onClick={jumpToReference} className="mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors duration-150 active:scale-[0.99]" style={{ background: `${C.secondary}0a`, border: `1px dashed ${C.secondary}35` }}>
                        <span className="text-[11.5px] font-bold tracking-wide" style={{ color: C.secondary }}>
                            {referenceLabel}: 0% change (₹{referenceValue?.toLocaleString("en-IN")})
                        </span>
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.secondary }}>Jump here</span>
                    </button>
                )}


                {WHEEL_SCROLL_ENABLED && (
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                        {stepOptions.map((s) => (
                            <button
                                key={s.value}
                                type="button"
                                onClick={() => { if (editing) cancelEdit(); wheel.jumpTo(wheel.selected, s.value); }}
                                className="rounded-full border px-3 py-1 text-[11.5px] font-bold tracking-wide transition-colors duration-150"
                                style={wheel.step === s.value
                                    ? { borderColor: C.secondary, background: `${C.secondary}14`, color: C.secondary }
                                    : { borderColor: C.hair, color: C.muted }}
                            >
                                Step {s.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-3 flex w-full items-center justify-center gap-3">
                    {WHEEL_SCROLL_ENABLED && <NudgeButton icon={Minus} onClick={() => nudge(-1)} />}
                    <WheelColumn
                        wheel={wheel}
                        formatValue={formatValue}
                        editing={editing}
                        draft={draft}
                        hasError={!!draftError}
                        prefix={isPercent ? null : "₹"}
                        suffix={isPercent ? "%" : null}
                        onDraftChange={handleDraftChange}
                        onStartEdit={startEdit}
                        onInputBlur={handleInputBlur}
                        onEnter={handleConfirm}
                        onCancelEdit={cancelEdit}
                    />
                    {WHEEL_SCROLL_ENABLED && <NudgeButton icon={Plus} onClick={() => nudge(1)} />}
                </div>

                <p
                    className="mt-2 text-center text-[11px] font-semibold leading-snug tracking-wide"
                    style={{ color: draftError ? ERROR_RED : C.muted }}
                >
                    {draftError || (editing
                        ? "Type a value, then tap the button below."
                        : WHEEL_SCROLL_ENABLED ? "Tap the highlighted value to type it in." : "Tap the value to type it in.")}
                </p>

                <button
                    type="button"
                    // Prevents the input's blur from firing (and re-rendering)
                    // between pointer-down and click, so the click handler
                    // always sees the typed draft.
                    onMouseDown={(e) => { if (editing) e.preventDefault(); }}
                    onClick={handleConfirm}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-bold tracking-wide text-white"
                    style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
                >
                    <Check className="h-4 w-4" /> {confirmVerb} {formatValue(previewValue)}
                </button>
            </motion.div>
        </motion.div>
    );
}