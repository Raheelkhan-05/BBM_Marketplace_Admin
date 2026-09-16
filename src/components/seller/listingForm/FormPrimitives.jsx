// components/seller/listingForm/FormPrimitives.jsx — RESTYLED to match
// the Home / SellerManageListingsPage visual language: same C tokens,
// compact uppercase-caption labels (like QuickField), rounded-xl inputs,
// rounded-2xl cards, hairline borders, tabular-nums, framer-motion entrance.
//
// THIS PASS: two UX additions.
//   1. KEYBOARD FLOW — every text-ish field (TextField, TextField2,
//      TextFieldWithUnitSelect) now accepts an optional `onEnterKey`
//      callback. Pressing Enter while focused calls it instead of doing
//      nothing / submitting a native form. TextAreaField keeps Enter as a
//      normal newline (it's multi-line) but advances on Cmd/Ctrl+Enter.
//      SelectField and the toggle/chip controls (ToggleField, ToggleField2,
//      ToggleField3, ChipToggleGroup) call `onEnterKey` right after a
//      choice is made, so picking an option (by click OR by
//      keyboard Enter/Space on a focused button) also advances the flow.
//      The actual "what's next" logic lives in SellerListingForm.jsx —
//      these primitives just expose the hook, and always forward the
//      "forward" / "backward" direction so the caller can move either way.
//   2. DRAG & DROP for CertificateUploadField — dropping files anywhere
//      inside the certificates field area now adds them as pending rows,
//      same as picking them via the file input. The drop target is
//      strictly scoped to this component's own wrapper (onDragEnter /
//      onDragOver / onDragLeave / onDrop all call stopPropagation), so a
//      drop here can never bubble up and get misinterpreted by another
//      dropzone (e.g. the product-images dropzone in SellerListingForm.jsx)
//      or by the page itself.
//
// THIS PASS (bugfix): a `dragend` listener now resets the drag-highlight
// state unconditionally. Without it, if a drag is cancelled in a way that
// doesn't fire a clean dragleave on this element (Esc mid-drag, dropping
// on a browser chrome element, a mid-drag re-render unmounting the node
// the pointer was over), `isDragActive` and the internal drag counter
// could get stuck "on" — the dropzone would keep showing the highlighted
// "Drop to add" state and stop reliably accepting new drags until a full
// remount. `dragend` always fires on the source element once the drag
// ends, dropped or not, so it's a reliable place to force a hard reset.
import { useState, useRef, useId, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Trash2, Info, Check, X, CheckCircle2, Download, Pencil, UploadCloud } from "lucide-react";
import { createPortal } from "react-dom";
import { Loader2, Upload } from "lucide-react";
import { uploadSellerFile } from "../../../utils/api.js";


export const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)",
    hairSoft: "rgba(11,17,22,0.05)",
    danger: "#c71f11",
};

export const EASE = [0.16, 1, 0.3, 1];

// Compact uppercase caption label — same idiom as QuickField in
// SellerManageListingsPage, so every field in the app reads the same way.
export function Label({ children, hint }) {
    const [showHint, setShowHint] = useState(false);
    const wrapperRef = useRef(null);
    const tooltipId = useId();

    useEffect(() => {
        if (!showHint) return;

        const handleOutsideClick = (e) => {
            if (!wrapperRef.current?.contains(e.target)) {
                setShowHint(false);
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setShowHint(false);
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("touchstart", handleOutsideClick);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("touchstart", handleOutsideClick);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showHint]);

    if (!hint) {
        return (
            <span className="flex items-center gap-1.5">
                <span
                    className="text-[12.5px] font-extrabold uppercase"
                    style={{
                        color: "#4A535B",
                        letterSpacing: "0.08em",
                    }}
                >
                    {children}
                </span>
            </span>
        );
    }

    return (
        <span
            ref={wrapperRef}
            className="relative flex w-fit items-center gap-1.5"
        >
            <span
                className="text-[12.5px] font-extrabold uppercase"
                style={{
                    color: "#4A535B",
                    letterSpacing: "0.08em",
                }}
            >
                {children}
            </span>

            <button
                type="button"
                onClick={() => setShowHint((s) => !s)}
                className="flex h-5 w-5 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors hover:bg-black/5 active:bg-black/10"
                aria-label={`More information about ${children}`}
                aria-expanded={showHint}
                aria-describedby={showHint ? tooltipId : undefined}
            >
                <Info
                    className="h-3.5 w-3.5"
                    style={{ color: C.muted }}
                    aria-hidden="true"
                />
            </button>

            <AnimatePresence>
                {showHint && (
                    <motion.div
                        id={tooltipId}
                        role="tooltip"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="
                            absolute
                            left-0
                            top-full
                            z-[100]
                            mt-2
                            w-[min(18rem,calc(100vw-2rem))]
                            rounded-lg
                            px-3
                            py-2
                            text-[13.5px]
                            tracking-wide
                            font-medium
                            leading-snug
                            text-white
                            shadow-lg
                        "
                        style={{ background: C.ink }}
                    >
                        {hint}

                        <span
                            className="absolute -top-1.5 left-3 h-3 w-3 rotate-45"
                            style={{ background: C.ink }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </span>
    );
}

// Shared border/ring style so every field control looks the same whether
// it's untouched, valid, or (after blur) missing.
function fieldTone(error) {
    if (error) return { borderColor: "#f2b3ab", ["--tw-ring-color"]: `${C.danger}1a`, background: "#fff8f7" };
    return { borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` };
}

// Shared keydown handler factory: fires onEnterKey("forward") on plain
// Enter, onEnterKey("forward") on Tab, and onEnterKey("backward") on
// Shift+Tab. Both Enter AND Tab are hijacked here on purpose — the whole
// point is that Tab should "flow to the next empty field" the same way
// Enter does (including opening a different, currently-collapsed
// section), rather than falling back to the browser's default tab order,
// which only ever sees whatever's currently mounted in the open section.
function makeFieldKeyHandler(onEnterKey, extraOnKeyDown) {
    if (!onEnterKey && !extraOnKeyDown) return undefined;
    return (e) => {
        extraOnKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnterKey?.("forward", true); // true = "try to submit if form is complete"
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            onEnterKey?.(e.shiftKey ? "backward" : "forward", false);
        }
    };
}

// For button-group controls (ToggleField, ToggleField3, ChipToggleGroup,
// ToggleField2) — attach to the wrapping div, not each individual button.
// React's synthetic events bubble, so a Tab pressed while any button
// inside is focused still reaches this handler. Enter/Space are left
// alone here (they trigger the focused button's own onClick natively,
// which already calls onEnterKey("forward") after making the selection).
function makeGroupTabHandler(onEnterKey) {
    if (!onEnterKey) return undefined;
    return (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            onEnterKey(e.shiftKey ? "backward" : "forward");
        }
    };
}

export function TextField({ label, value, onChange, onBlur, placeholder, inputMode, type = "text", hint, required, disabled, error, dense, halfOnMobile, tinyOnMobile, onEnterKey, onKeyDown }) {
    const widthClass = tinyOnMobile ? "w-[4.5rem] sm:w-full" : halfOnMobile ? "w-1/2 sm:w-full" : "w-full";
    return (
        <div className="flex min-w-0 flex-col gap-1">
            {label && <Label hint={hint}>{label}{required && <span style={{ color: C.primary }}> *</span>}</Label>}
            <div className={widthClass}>
                <input
                    type={type}
                    value={value ?? ""}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                    onKeyDown={makeFieldKeyHandler(onEnterKey, onKeyDown)}
                    className={`w-full rounded-lg border tracking-wide bg-white ${dense ? "px-2.5 py-1.5 text-[14.5px]" : "px-3 py-2 text-[14.5px]"} font-bold placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:opacity-60`}
                    style={{ color: C.ink, ...fieldTone(error) }}
                />
            </div>
        </div>
    );
}

export function Label2({ children, hint }) {
    const [showHint, setShowHint] = useState(false);
    const wrapperRef = useRef(null);
    const tooltipId = useId();

    useEffect(() => {
        if (!showHint) return;

        const handleOutsideClick = (e) => {
            if (!wrapperRef.current?.contains(e.target)) {
                setShowHint(false);
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setShowHint(false);
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("touchstart", handleOutsideClick);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("touchstart", handleOutsideClick);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showHint]);

    return (
        <span
            ref={wrapperRef}
            className="relative flex h-5 w-fit items-end gap-1.5"
        >
            <span
                className="text-[10.5px] font-extrabold uppercase leading-none"
                style={{
                    color: "#4A535B",
                    letterSpacing: "0.08em",
                }}
            >
                {children}
            </span>

            {hint && (
                <button
                    type="button"
                    onClick={() => setShowHint((s) => !s)}
                    className="flex h-5 w-5 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors hover:bg-black/5 active:bg-black/10"
                    aria-label={`More information about ${children}`}
                    aria-expanded={showHint}
                    aria-describedby={showHint ? tooltipId : undefined}
                >
                    <Info
                        className="h-3.5 w-3.5"
                        style={{ color: C.muted }}
                        aria-hidden="true"
                    />
                </button>
            )}

            <AnimatePresence>
                {hint && showHint && (
                    <motion.div
                        id={tooltipId}
                        role="tooltip"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="
                            absolute
                            left-0
                            top-full
                            z-[100]
                            mt-2
                            w-[min(18rem,calc(100vw-2rem))]
                            rounded-lg
                            px-3
                            py-2
                            text-[13.5px]
                            tracking-wide
                            font-medium
                            leading-snug
                            text-white
                            shadow-lg
                        "
                        style={{ background: C.ink }}
                    >
                        {hint}
                        <span
                            className="absolute -top-1.5 left-3 h-3 w-3 rotate-45"
                            style={{ background: C.ink }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </span>
    );
}

export function TextFieldWithUnitSelect({
    label, value, onChange, onBlur, placeholder, inputMode = "decimal", hint,
    required, disabled, error, dense,
    unitValue, unitOptions, onUnitChange,
    onEnterKey,
}) {
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState(null);
    const wrapperRef = useRef(null);
    const triggerRef = useRef(null);

    const updateCoords = () => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) setCoords({ top: rect.bottom + 4, left: rect.right, width: rect.width });
    };

    useEffect(() => {
        if (!open) return;
        updateCoords();
        const handleOutside = (e) => {
            if (!wrapperRef.current?.contains(e.target) && !e.target.closest("[data-unitselect-panel]")) setOpen(false);
        };
        document.addEventListener("mousedown", handleOutside);
        window.addEventListener("scroll", updateCoords, true);
        window.addEventListener("resize", updateCoords);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            window.removeEventListener("scroll", updateCoords, true);
            window.removeEventListener("resize", updateCoords);
        };
    }, [open]);

    const selectedOption = unitOptions.find((o) => (o.value ?? o) === unitValue);
    const selectedLabel = selectedOption ? (selectedOption.label ?? selectedOption) : "";

    return (
        <div className="flex min-w-0 flex-col items-stretch justify-end gap-1 h-full">
            {label && <Label2>{label}</Label2>}
            <div
                className="flex w-full items-stretch rounded-lg border bg-white tracking-wide focus-within:ring-2 text-[14.5px]"
                style={{ color: C.ink, ...fieldTone(error) }}
            >
                <input
                    type="text"
                    value={value ?? ""}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                    onKeyDown={makeFieldKeyHandler(onEnterKey)}
                    className={`min-w-0 flex-1 rounded-l-lg bg-transparent font-bold placeholder:font-normal placeholder:text-slate-300 focus:outline-none ${dense ? "py-1.5 pl-2.5 pr-1.5" : "py-2 pl-3 pr-2"} disabled:opacity-60`}
                    style={{ color: C.ink }}
                />

                <div className="relative shrink-0" ref={wrapperRef}>
                    <button
                        ref={triggerRef}
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        disabled={disabled}
                        className={`flex h-full items-center gap-1 rounded-r-lg border-l font-bold tracking-wide disabled:opacity-60 ${dense ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-[13.5px]"}`}
                        style={{ borderColor: C.hair, color: C.secondary, background: `${C.secondary}0a` }}
                    >
                        <span className="max-w-[6.5rem] truncate">{selectedLabel}</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>
                </div>
            </div>

            {open && coords && createPortal(
                <AnimatePresence>
                    <motion.div
                        data-unitselect-panel
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: EASE }}
                        className="fixed z-[9999] max-h-56 w-max min-w-[130px] overflow-y-auto rounded-xl border bg-white py-1.5 shadow-lg"
                        style={{ borderColor: C.hair, top: coords.top, right: window.innerWidth - coords.left }}
                    >
                        {unitOptions.map((o) => {
                            const optValue = o.value ?? o;
                            const optLabel = o.label ?? o;
                            const active = optValue === unitValue;
                            return (
                                <button
                                    key={optValue}
                                    type="button"
                                    onClick={() => { onUnitChange(optValue); setOpen(false); }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] font-bold tracking-wide transition-colors duration-100 hover:bg-black/[0.03]"
                                    style={active ? { color: C.secondary, background: `${C.secondary}0c` } : { color: C.ink }}
                                >
                                    {optLabel}
                                    {active && <Check className="h-3.5 w-3.5" style={{ color: C.secondary }} />}
                                </button>
                            );
                        })}
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}

export function TextField2({ label, value, onChange, onBlur, placeholder, inputMode, type = "text", hint, required, disabled, error, dense, halfOnMobile, tinyOnMobile, prefix, onEnterKey }) {
    const widthClass = tinyOnMobile ? "w-[4.5rem] sm:w-full" : halfOnMobile ? "w-1/2 sm:w-full" : "w-full";
    return (
        <div className="flex min-w-0 flex-col items-stretch justify-end gap-1 h-full">
            {label && <Label2>{label}</Label2>}
            <div className={`relative flex items-center ${widthClass}`}>
                {prefix && (
                    <span
                        className="pointer-events-none absolute left-2.5 text-[14.5px] font-bold"
                        style={{ color: C.muted }}
                    >
                        {prefix}
                    </span>
                )}
                <input
                    type={type}
                    value={value ?? ""}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                    onKeyDown={makeFieldKeyHandler(onEnterKey)}
                    className={`w-full rounded-lg border tracking-wide bg-white ${dense ? "py-1.5 text-[14.5px]" : "py-2 text-[14.5px]"} font-bold placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:opacity-60`}
                    style={{
                        color: C.ink,
                        paddingLeft: prefix ? "20px" : (dense ? "10px" : "12px"),
                        paddingRight: dense ? "10px" : "12px",
                        ...fieldTone(error),
                    }}
                />
            </div>
        </div>
    );
}
export function TextAreaField({ label, value, onChange, onBlur, placeholder, hint, required, rows = 2, error, onEnterKey }) {
    return (
        <div className="flex flex-col gap-1">
            <Label hint={hint}>{label}{required && <span style={{ color: C.primary }}> *</span>}</Label>
            <textarea
                value={value ?? ""}
                placeholder={placeholder}
                rows={rows}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                onKeyDown={(e) => {
                    // Plain Enter stays a normal newline since this is a
                    // multi-line field. Cmd/Ctrl+Enter advances instead.
                    // Tab is left as native browser behavior here on
                    // purpose — this is an optional field, so hijacking
                    // Tab out of it isn't necessary the way it is for
                    // required fields.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        onEnterKey?.("forward");
                    }
                }}
                className="w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-[14.5px] font-medium placeholder:text-slate-300 focus:outline-none focus:ring-2 tracking-wide"
                style={{ color: C.ink, ...fieldTone(error) }}
            />
        </div>
    );
}

// Custom SelectField — replaces the native <select>. On mobile (<640px)
// it opens as a bottom sheet sliding up to 75vh, matching the app's other
// modal language (BuyNowModal etc). On desktop it's a normal floating
// dropdown panel anchored under the trigger. Same external API as before
// (label, value, onChange, onBlur, options, hint, required, placeholder,
// error, dense) so no caller needs to change. New: `onEnterKey`, fired
// right after a selection is made (mouse or keyboard) so the field flow
// can advance to the next field automatically.
export function SelectField({ label, value, onChange, onBlur, options, hint, required, placeholder = "Select…", error, dense, halfOnMobile, onEnterKey }) {
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const wrapperRef = useRef(null);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);

    // reset highlight whenever the dropdown opens, seeded at the current value
    useEffect(() => {
        if (open) {
            const idx = options.findIndex((o) => (o.value ?? o) === value);
            setHighlightedIdx(idx >= 0 ? idx : 0);
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        if (!open || isMobile) return;
        const handleOutside = (e) => {
            if (!wrapperRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, [open, isMobile]);

    const selectedOption = options.find((o) => (o.value ?? o) === value);
    const selectedLabel = selectedOption ? (selectedOption.label ?? selectedOption) : null;

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
        onBlur?.();
        onEnterKey?.("forward");
    };
    const closeAndBlur = () => { setOpen(false); onBlur?.(); };

    return (
        <div className="relative flex min-w-0 flex-col gap-1" ref={wrapperRef}>
            {label && <Label hint={hint}>{label}{required && <span style={{ color: C.primary }}> *</span>}</Label>}

            <div className={halfOnMobile ? "relative w-1/2 sm:w-full" : "relative w-full"}>
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    onKeyDown={(e) => {
                        if (e.key === "Tab") {
                            e.preventDefault();
                            setOpen(false);
                            onEnterKey?.(e.shiftKey ? "backward" : "forward", false);
                            return;
                        }
                        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
                            e.preventDefault();
                            setOpen(true);
                            return;
                        }
                        if (open) {
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlightedIdx((i) => Math.min(options.length - 1, i + 1));
                            } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlightedIdx((i) => Math.max(0, i - 1));
                            } else if (e.key === "Enter") {
                                e.preventDefault();
                                const opt = options[highlightedIdx];
                                if (opt) handleSelect(opt.value ?? opt);
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                closeAndBlur();
                            }
                        }
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border bg-white tracking-wide ${dense ? "px-2.5 py-1.5 text-[14.5px]" : "px-3 py-2.5 text-[15px]"} font-bold focus:outline-none focus:ring-2`}
                    style={{ color: selectedLabel ? C.ink : "#94a3b8", ...fieldTone(error) }}
                >
                    <span className="truncate">{selectedLabel || placeholder}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>

                <AnimatePresence>
                    {open && isMobile && (
                        <motion.div
                            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-[1px]"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={closeAndBlur}
                        >
                            <motion.div
                                className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white"
                                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                                transition={{ duration: 0.28, ease: EASE }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between border-b px-4 py-3.5" style={{ borderColor: C.hairSoft }}>
                                    <span className="text-[15.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>{label || "Select"}</span>
                                    <button type="button" onClick={closeAndBlur} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                                        <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto px-2 py-2">
                                    {options.map((o) => {
                                        const optValue = o.value ?? o;
                                        const optLabel = o.label ?? o;
                                        const active = optValue === value;
                                        return (
                                            <button
                                                key={optValue}
                                                type="button"
                                                onClick={() => handleSelect(optValue)}
                                                className="flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-[14.5px] font-semibold tracking-wider"
                                                style={active ? { background: `${C.secondary}12`, color: C.secondary } : { color: C.ink }}
                                            >
                                                {optLabel}
                                                {active && <Check className="h-4 w-4" style={{ color: C.secondary }} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}

                    {open && !isMobile && (
                        <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: EASE }}
                            className="absolute left-0 top-full z-[100] mt-1 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-xl border bg-white py-1.5 shadow-lg"
                            style={{ borderColor: C.hair }}
                        >
                            {options.map((o, idx) => {
                                const optValue = o.value ?? o;
                                const optLabel = o.label ?? o;
                                const active = optValue === value;
                                return (
                                    <button
                                        key={optValue}
                                        type="button"
                                        onClick={() => handleSelect(optValue)}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] font-bold tracking-wide transition-colors duration-100 hover:bg-black/[0.03]"
                                        style={active ? { color: C.secondary, background: `${C.secondary}0c` }
                                            : idx === highlightedIdx ? { background: "rgba(11,17,22,0.04)", color: C.ink }
                                                : { color: C.ink }}
                                    >
                                        {optLabel}
                                        {active && <Check className="h-3.5 w-3.5" style={{ color: C.secondary }} />}
                                    </button>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function ToggleField({ label, value, onChange, hint, onLabel = "Yes", offLabel = "No", error, onEnterKey }) {
    return (
        <div className="flex flex-col gap-1">
            <Label hint={hint}>{label}</Label>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: error ? "#fff8f7" : C.hairSoft, width: "fit-content", boxShadow: error ? `0 0 0 1px ${C.danger}40 inset` : "none" }} onKeyDown={makeGroupTabHandler(onEnterKey)}>
                {[{ v: true, t: onLabel }, { v: false, t: offLabel }].map(({ v, t }) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { onChange(v); onEnterKey?.("forward"); }}
                        className="rounded-md px-3 py-0.5 text-[13.5px] tracking-wider font-bold transition-colors duration-150"
                        style={value === v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function ToggleField3({ label, value, onChange, hint, onLabel = "Yes", offLabel = "No", error, onEnterKey }) {
    return (
        <div className="flex flex-col gap-1 self-end justify-end align-end">
            <Label hint={hint}>{label}</Label>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: error ? "#fff8f7" : C.hairSoft, width: "fit-content", boxShadow: error ? `0 0 0 1px ${C.danger}40 inset` : "none" }} onKeyDown={makeGroupTabHandler(onEnterKey)}>
                {[{ v: true, t: onLabel }, { v: false, t: offLabel }].map(({ v, t }) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { onChange(v); onEnterKey?.("forward"); }}
                        className="rounded-md px-3 py-0.5 text-[13.5px] tracking-wider font-bold transition-colors duration-150"
                        style={value === v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function ChipToggleGroup({ label, value, onChange, options, hint, dense, onEnterKey }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            {label && <Label hint={hint}>{label}</Label>}
            <div className="flex flex-wrap gap-1.5" onKeyDown={makeGroupTabHandler(onEnterKey)}>
                {options.map((o) => {
                    const optValue = o.value ?? o;
                    const active = value === optValue;
                    return (
                        <button
                            key={optValue}
                            type="button"
                            onClick={() => { onChange(optValue); onEnterKey?.("forward"); }}
                            className={`rounded-full border tracking-wide ${dense ? "px-2.5 py-1 text-[12.5px]" : "px-3 py-1.5 text-[12px]"} font-bold transition-colors duration-150`}
                            style={active
                                ? { borderColor: C.secondary, background: `${C.secondary}14`, color: C.secondary }
                                : { borderColor: C.hair, color: C.muted, background: "#fff" }}
                        >
                            {o.label ?? o}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function RepeatableRows({ label, hint, rows, columns, onChange, addLabel = "Add row" }) {
    const update = (idx, key, val) => {
        const next = rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
        onChange(next);
    };
    const remove = (idx) => onChange(rows.filter((_, i) => i !== idx));
    const add = () => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, ""]))]);

    return (
        <div className="flex flex-col gap-1.5">
            <Label hint={hint}>{label}</Label>
            {rows.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {rows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                            {columns.map((c) => (
                                <input
                                    key={c.key}
                                    value={row[c.key] ?? ""}
                                    placeholder={c.placeholder}
                                    inputMode={c.inputMode}
                                    onChange={(e) => update(idx, c.key, e.target.value)}
                                    className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[14px] font-bold placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 tracking-wide"
                                    style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
                                />
                            ))}
                            <button type="button" onClick={() => remove(idx)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" style={{ color: C.danger }} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={add}
                className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-[13px] font-bold transition-colors duration-150 hover:bg-black/[0.02] tracking-wide"
                style={{ borderColor: C.hair, color: C.secondary }}
            >
                <Plus className="h-3.5 w-3.5" /> {addLabel}
            </button>
        </div>
    );
}

export function RepeatableRows2({ label, hint, rows, columns, onChange, addLabel = "Add row" }) {
    const update = (idx, key, val) => {
        const next = rows.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
        onChange(next);
    };
    const remove = (idx) => onChange(rows.filter((_, i) => i !== idx));
    const add = () => onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, ""]))]);

    return (
        <div className="flex flex-col gap-1.5">
            <Label hint={hint}>{label}</Label>
            {rows.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    {rows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                            {columns.map((c) => {
                                const suffixText = typeof c.suffix === "function" ? c.suffix(row) : c.suffix;
                                return (
                                    <div
                                        key={c.key}
                                        className="relative min-w-0"
                                        style={{ flex: c.flex ?? 1 }}
                                    >
                                        <input
                                            value={row[c.key] ?? ""}
                                            placeholder={c.placeholder}
                                            inputMode={c.inputMode}
                                            onChange={(e) => update(idx, c.key, e.target.value)}
                                            className="w-full min-w-0 rounded-lg border py-1.5 pl-2.5 text-[12px] font-bold placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 tracking-wide"
                                            style={{
                                                borderColor: C.hair,
                                                color: C.ink,
                                                paddingRight: suffixText ? `${suffixText.length * 5.5 + 12}px` : "10px",
                                                ["--tw-ring-color"]: `${C.secondary}22`,
                                            }}
                                        />
                                        {suffixText && row[c.key] !== "" && row[c.key] != null && (
                                            <span
                                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold tracking-wide"
                                                style={{ color: C.muted }}
                                            >
                                                {suffixText}
                                            </span>
                                        )}
                                    </div>
                                );

                            })}
                            <button type="button" onClick={() => remove(idx)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" style={{ color: C.danger }} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={add}
                className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-[13px] font-bold transition-colors duration-150 hover:bg-black/[0.02] tracking-wide"
                style={{ borderColor: C.hair, color: C.secondary }}
            >
                <Plus className="h-3.5 w-3.5" /> {addLabel}
            </button>
        </div>
    );
}

// SectionCard — add a `readOnly` prop. Headers stay clickable (sections
// can still be expanded/collapsed to browse), but the field content
// inside becomes non-interactive and slightly dimmed, and the
// completion ring is hidden — "3/9 filled" reads as a validation nag,
// which makes no sense for a listing that's already been submitted.
export function SectionCard({ icon: Icon, title, subtitle, defaultOpen, headerRight, missingCount, totalCount, children, open, onOpenChange, id, alwaysOpen, readOnly }) {
    const [internalOpen, setInternalOpen] = useState(!!defaultOpen);
    const isControlled = open !== undefined;
    const isOpen = alwaysOpen ? true : (isControlled ? open : internalOpen);
    const toggle = () => {
        if (alwaysOpen) return;
        if (isControlled) onOpenChange?.(!isOpen);
        else setInternalOpen((o) => !o);
    };

    // Status ring is a "you're missing X" prompt — never relevant in
    // read-only mode, so it's suppressed outright rather than just hidden
    // via CSS (keeps the header layout from reserving dead space for it).
    const showStatus = !readOnly && typeof missingCount === "number" && typeof totalCount === "number" && totalCount > 0;
    const filledCount = showStatus ? totalCount - missingCount : 0;
    const isComplete = showStatus && missingCount === 0;
    const fillPercent = showStatus ? Math.round((filledCount / totalCount) * 100) : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            id={id}
            className="overflow-hidden rounded-2xl border bg-white"
            style={{ borderColor: C.hair, boxShadow: isOpen ? "0 1px 4px rgba(11,17,22,0.06)" : "none" }}
        >
            <div className="flex w-full items-center gap-2.5 px-3.5 py-3 sm:px-4">
                <button type="button" onClick={toggle} disabled={alwaysOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${C.secondary}14`, color: C.secondary }}>
                        <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                            <span className="block text-[15.5px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>{title}</span>
                            {showStatus && (
                                /* ...unchanged status-ring block... */
                                <span className="ml-auto inline-flex shrink-0 items-center justify-center" title={`${filledCount} of ${totalCount} fields completed`}>
                                    {isComplete ? (
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${C.secondary}12`, color: C.secondary }}>
                                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                                        </span>
                                    ) : (
                                        <span className="relative h-7 w-7">
                                            <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
                                                <circle cx="18" cy="18" r="15" fill="none" stroke={C.hairSoft} strokeWidth="3" />
                                                <circle cx="18" cy="18" r="15" fill="none" stroke={C.secondary} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${fillPercent * 0.9425} 94.25`} className="transition-all duration-300 ease-out" />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                                {filledCount}/{totalCount}
                                            </span>
                                        </span>
                                    )}
                                </span>
                            )}
                        </span>
                        {subtitle && <span className="mt-0 block truncate text-[12.5px] tracking-wide font-semibold" style={{ color: C.muted }}>{subtitle}</span>}
                    </span>
                </button>
                {headerRight}
                {!alwaysOpen && (
                    <button type="button" onClick={toggle} className="shrink-0 rounded-full p-1.5 transition-colors duration-150 hover:bg-black/[0.05]">
                        <ChevronDown className="h-4 w-4 transition-transform duration-200" style={{ color: C.muted, transform: isOpen ? "rotate(180deg)" : "none" }} />
                    </button>
                )}
            </div>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        style={{ overflow: "hidden" }}
                    >
                        {/* pointer-events-none blocks every input/button inside the
                            content (typing, toggling, uploading, adding rows) without
                            having to thread a `disabled` prop through every field
                            primitive individually. Header above is OUTSIDE this div,
                            so expand/collapse still works normally. */}
                        <div
                            className={`flex flex-col gap-3 border-t px-3.5 py-3.5 sm:px-4 ${readOnly ? "pointer-events-none opacity-[0.85]" : ""}`}
                            style={{ borderColor: C.hairSoft }}
                        >
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// Small status pill for section headers — "Auto-filled", "Optional", etc.
export function Pill({ children, tone = "muted" }) {
    const tones = {
        muted: { background: C.hairSoft, color: C.muted },
        good: { background: `${C.secondary}14`, color: C.secondary },
        warn: { background: "#fef3c7", color: "#a16207" },
    };
    return (
        <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide" style={tones[tone] || tones.muted}>
            {children}
        </span>
    );
}

// Thin, animated completion bar for the sticky footer.
export function Progress({ percent }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: C.hairSoft }}>
            <motion.div
                className="h-full rounded-full"
                style={{ background: percent >= 100 ? C.secondary : C.primary }}
                initial={false}
                animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                transition={{ duration: 0.25, ease: EASE }}
            />
        </div>
    );
}

export function CompletedBadge() {
    return (
        <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: C.secondary }}>
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
    );
}


export function ToggleField2({ label, value, onChange, hint, onLabel = "Yes", offLabel = "No", infoBlock, error, onEnterKey }) {
    return (
        <div className="flex flex-col">
            <Label hint={hint}>{label}</Label>
            {infoBlock}
            <div className="flex gap-1 rounded-lg p-1" style={{ background: error ? "#fff8f7" : C.hairSoft, width: "fit-content", boxShadow: error ? `0 0 0 1px ${C.danger}40 inset` : "none" }} onKeyDown={makeGroupTabHandler(onEnterKey)}>
                {[{ v: true, t: onLabel }, { v: false, t: offLabel }].map(({ v, t }) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { onChange(v); onEnterKey?.("forward"); }}
                        className="rounded-md px-3 py-0.5 text-[13.5px] tracking-wider font-bold transition-colors duration-150"
                        style={value === v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
}


const CERT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*";

function fileIconLabel(url) {
    const ext = (url.split(".").pop() || "").toLowerCase().split("?")[0];
    return ext ? ext.toUpperCase() : "FILE";
}

function extFromUrl(url) {
    const clean = url.split("?")[0];
    const ext = clean.split(".").pop();
    return ext && ext.length <= 5 ? ext : "";
}

// Derives a human-friendly default name from a picked File's own filename —
// strips the extension and swaps underscores/dashes for spaces, e.g.
// "iso_9001_certificate.pdf" -> "iso 9001 certificate". This is what lets
// the pending row start pre-filled instead of empty (see the file header
// note on CertificateUploadField for why an empty field was the root of
// the naming/upload confusion).
function defaultNameFromFile(file) {
    const withoutExt = file.name.replace(/\.[^.\/]+$/, "");
    return withoutExt.replace(/[_-]+/g, " ").trim();
}

// Cross-origin URLs (Supabase storage is a different origin than the
// app) make the browser IGNORE <a download>'s filename — it falls back
// to whatever's in the URL path, which is why this was downloading as
// the raw timestamped storage filename instead of the seller's own
// label. Fetching the file as a blob and downloading FROM that blob
// (a same-origin blob: URL) is what actually lets us control the
// filename the browser saves it as.
async function downloadNamed(url, desiredName) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Couldn't download this file.");
    const blob = await res.blob();
    const ext = extFromUrl(url);
    const filename = ext && !desiredName.toLowerCase().endsWith(`.${ext}`) ? `${desiredName}.${ext}` : desiredName;

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
}

// Direct-upload replacement for the old "paste a link" certificate rows.
// Flow: pick file(s) (via the file input OR by dragging them onto this
// field's own area — see the drag-and-drop handlers below) → each becomes
// a PENDING row (not yet uploaded) that asks the seller to confirm a name
// → THEN it uploads to Supabase storage via the same uploadSellerFile()
// every other upload on this form uses.
//
// DRAG & DROP: the whole field wrapper is now a dropzone. Dragging
// file(s) over it highlights the area; dropping adds them to `pending`
// exactly like picking them from the file input does. All drag events
// (`dragenter`/`dragover`/`dragleave`/`drop`) call stopPropagation(), so
// this dropzone can never "steal" a drop meant for a different field
// (e.g. product images) and vice versa — each dropzone only reacts to
// drops that land inside its own DOM subtree. A `dragend` listener also
// hard-resets the highlight/counter state in case a drag is abandoned in
// a way that never reaches this element's own dragleave (Esc mid-drag,
// dropping over unrelated browser chrome, a mid-drag re-render).
//
// UX FIX (earlier pass): sellers were picking a file, seeing the pending
// row's name input showing greyed-out placeholder text, and — because it
// looked like ordinary already-filled text rather than an empty required
// field — assuming the file was already named and done. They'd then tap
// "Upload certificate" again instead of typing a name and tapping Add, so
// the file never actually got confirmed/uploaded.
//
// Root cause was relying on a placeholder as the only signal for a required
// action. Fixed by:
//   1. Auto-filling the name from the picked file's own filename the
//      instant it's selected, so the field is NEVER empty/placeholder-only —
//      there's always real, editable text sitting in it, and "Add" is
//      immediately actionable without typing anything.
//   2. Giving the pending row its own explicit caption ("Name this
//      certificate") above the input, so the required action is stated in
//      real UI chrome, not implied by placeholder text alone.
//   3. Auto-focusing + auto-selecting that text on the newest pending row,
//      so a seller who starts typing simply overwrites the suggested name
//      instead of needing to clear it first.
//   4. Badging the "Upload certificate" button with a count whenever items
//      are still waiting to be confirmed, so re-clicking it doesn't read as
//      the obvious next step while a pending card above is still open.
export function CertificateUploadField({ label, hint, rows, onChange, token, addLabel = "Upload certificate" }) {
    const [pending, setPending] = useState([]); // [{ file, name }] — chosen but not yet uploaded
    const [confirmingIdx, setConfirmingIdx] = useState(null); // index into `pending` currently uploading
    const [downloadingIdx, setDownloadingIdx] = useState(null); // index into `rows` currently downloading
    const [error, setError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const inputRef = useRef(null);
    const newestPendingRef = useRef(null);
    const dragCounter = useRef(0); // tracks nested dragenter/dragleave pairs so the highlight doesn't flicker

    const addFiles = (fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setError(null);
        setPending((p) => [...p, ...files.map((file) => ({ file, name: defaultNameFromFile(file) }))]);
    };

    const handleFiles = (e) => {
        addFiles(e.target.files);
        e.target.value = "";
    };

    // --- Drag & drop, scoped strictly to this field's own wrapper ---
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.dataTransfer?.types?.includes("Files")) return;
        dragCounter.current += 1;
        setIsDragActive(true);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setIsDragActive(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragActive(false);
        addFiles(e.dataTransfer?.files);
    };

    // Bugfix: `dragend` always fires on the drag source once the drag is
    // over, whether it was dropped, cancelled, or dropped somewhere that
    // never triggers a clean dragleave on this element. Without this, the
    // highlighted "drop" state (and the internal counter that gates it)
    // could get stuck on, making the dropzone look broken until remount.
    useEffect(() => {
        const resetDragState = () => {
            dragCounter.current = 0;
            setIsDragActive(false);
        };
        window.addEventListener("dragend", resetDragState);
        return () => window.removeEventListener("dragend", resetDragState);
    }, []);

    // Focus + select the newest pending row's name field so a seller can
    // just start typing to replace the auto-filled suggestion, or hit
    // Enter / tap Add to accept it as-is.
    useEffect(() => {
        if (pending.length === 0) return;
        const el = newestPendingRef.current;
        if (el) { el.focus(); el.select(); }
    }, [pending.length]);

    const renamePending = (i, name) => setPending((p) => p.map((row, idx) => (idx === i ? { ...row, name } : row)));
    const cancelPending = (i) => setPending((p) => p.filter((_, idx) => idx !== i));

    const confirmPending = async (i) => {
        const row = pending[i];
        if (!row.name.trim()) return;
        setError(null);
        setConfirmingIdx(i);
        try {
            const res = await uploadSellerFile(token, row.file, "certificates");
            if (!res?.success) throw new Error("Upload failed for " + row.file.name);
            onChange([...(rows || []), { name: row.name.trim(), url: res.url }]);
            setPending((p) => p.filter((_, idx) => idx !== i));
        } catch (err) {
            setError(err.message || "Couldn't upload this file.");
        } finally {
            setConfirmingIdx(null);
        }
    };

    const removeSaved = (i) => onChange(rows.filter((_, idx) => idx !== i));
    const renameSaved = (i, name) => onChange(rows.map((r, idx) => (idx === i ? { ...r, name } : r)));

    const handleDownload = async (i, row) => {
        setError(null);
        setDownloadingIdx(i);
        try {
            await downloadNamed(row.url, row.name?.trim() || "certificate");
        } catch (err) {
            setError(err.message || "Couldn't download this file.");
        } finally {
            setDownloadingIdx(null);
        }
    };

    return (
        <div
            className="flex flex-col gap-1.5 rounded-xl transition-colors duration-150"
            style={isDragActive ? { boxShadow: `0 0 0 2px ${C.secondary}55`, background: `${C.secondary}06`, padding: "8px", margin: "-8px" } : undefined}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>{label}</span>
            {hint && <p className="-mt-0.5 text-[11px] font-medium" style={{ color: C.muted }}>{hint}</p>}

            <div className="flex flex-col gap-1.5">
                {/* Already-uploaded certificates */}
                {(rows || []).map((row, i) => (
                    <div key={row.url + i} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: C.hair }}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold" style={{ background: C.hairSoft, color: C.secondary }}>
                            {fileIconLabel(row.url)}
                        </span>
                        <input
                            value={row.name}
                            onChange={(e) => renameSaved(i, e.target.value)}
                            placeholder="What is this file about?"
                            className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold focus:outline-none"
                            style={{ color: C.ink }}
                        />
                        <button
                            type="button"
                            onClick={() => handleDownload(i, row)}
                            disabled={downloadingIdx === i}
                            className="flex shrink-0 items-center gap-1 text-[10.5px] font-bold underline disabled:opacity-50"
                            style={{ color: C.secondary }}
                        >
                            {downloadingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            {downloadingIdx === i ? "Downloading" : "Download"}
                        </button>
                        <button type="button" onClick={() => removeSaved(i)} className="shrink-0 rounded-md p-1" style={{ color: C.muted }}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}

                {/* Just-picked files, waiting to be named + confirmed. Styled as
                    a positive "you're almost done" next-step card — teal/secondary
                    tones matching the rest of the form's normal state, a checkmark-
                    style step badge instead of a warning glyph, and calm copy —
                    rather than looking like an error/validation state. It's still
                    visually distinct from an already-saved row (so it reads as
                    "one step left"), just not alarming. */}
                {pending.map((row, i) => {
                    const isNewest = i === pending.length - 1;
                    const isEmpty = !row.name.trim();
                    return (
                        <div
                            key={i}
                            className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5"
                            style={{ borderColor: C.secondary + "3a", background: C.secondary + "08" }}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: C.secondary }}>
                                    <Pencil className="h-2.5 w-2.5" />
                                </span>
                                <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: C.secondary }}>
                                    Almost there — confirm a name
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold" style={{ background: "#fff", color: C.secondary }}>
                                    {(row.file.name.split(".").pop() || "FILE").toUpperCase()}
                                </span>
                                <input
                                    ref={isNewest ? newestPendingRef : undefined}
                                    value={row.name}
                                    onChange={(e) => renamePending(i, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmPending(i); } }}
                                    placeholder="e.g. ISO 9001 Certificate"
                                    className="min-w-0 flex-1 rounded-md border tracking-wide bg-white px-2 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2"
                                    style={{ color: C.ink, borderColor: C.secondary + "40", ["--tw-ring-color"]: `${C.secondary}22` }}
                                />
                                <button
                                    type="button"
                                    onClick={() => confirmPending(i)}
                                    disabled={isEmpty || confirmingIdx === i}
                                    className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40"
                                    style={{ background: C.secondary }}
                                >
                                    {confirmingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    {confirmingIdx === i ? "Uploading" : "Add"}
                                </button>
                                <button type="button" onClick={() => cancelPending(i)} disabled={confirmingIdx === i} className="shrink-0 rounded-md p-1" style={{ color: C.muted }}>
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            <p className="text-[10.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                {row.file.name} — {isEmpty ? "type a name, then tap Add to finish" : "looks good — edit if you'd like, or tap Add"}
                            </p>
                        </div>
                    );
                })}

                <label
                    className="relative flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[12px] font-bold transition-colors duration-150"
                    style={isDragActive ? { borderColor: C.secondary, color: C.secondary, background: `${C.secondary}0a` } : { borderColor: C.hair, color: C.muted }}
                >
                    {isDragActive ? <UploadCloud className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                    {isDragActive ? "Drop to add" : addLabel}
                    {!isDragActive && pending.length > 0 && (
                        <span
                            className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-extrabold text-white"
                            style={{ background: C.secondary }}
                            title={`${pending.length} file${pending.length === 1 ? "" : "s"} ready to confirm above`}
                        >
                            {pending.length}
                        </span>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept={CERT_ACCEPT}
                        multiple
                        onChange={handleFiles}
                        className="hidden"
                    />
                </label>
                {!isDragActive && (
                    <p className="text-[10.5px] font-medium" style={{ color: C.muted }}>
                        {pending.length > 0
                            ? `Just confirm the name${pending.length === 1 ? "" : "s"} above to add ${pending.length === 1 ? "it" : "them"} — then you can upload more.`
                            : "Or drag & drop files anywhere in this box."}
                    </p>
                )}
            </div>

            {error && <p className="text-[11px] font-semibold" style={{ color: C.danger }}>{error}</p>}
        </div>
    );
}