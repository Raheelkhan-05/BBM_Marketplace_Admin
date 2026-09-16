// components/HelpBulb.jsx
//
// WHY THE WHITE BACKGROUND KEPT DISAPPEARING ON MOBILE
// Every previous fix attacked this at the CSS layer (removing a
// `disabled` attribute, removing a Framer `whileTap`, forcing GPU
// layers) and each one helped a *different* real bug, but the symptom
// kept coming back because the actual root cause was never touched:
// the button used Tailwind's `active:` variant, which compiles to the
// CSS `:active` pseudo-class. iOS Safari has a long-standing bug where
// `:active` does not reliably clear on touch-end — it can stay "stuck"
// applied until the user touches something else on the page. That
// matches the reported symptom exactly (background changes on tap,
// only reverts after interacting with something else). No CSS-only fix
// can solve a browser bug in when a pseudo-class clears.
//
// The fix: stop using `:active`/`:hover` for this button's feedback
// entirely. Press state is now tracked in a plain `pressed` boolean
// driven by pointer events (down/up/cancel/leave all clear it
// explicitly), and the button's own background is a *constant* inline
// value that is never conditionally swapped — a separate translucent
// overlay layer fades in/out for the press feedback instead. Because
// the state is ours to clear (not the browser's), it can never get
// stuck.
//
// PROPORTIONS ACROSS SCREEN SIZES
// Sizes that used to jump between two fixed values at the `md` (768px)
// breakpoint (button diameter, panel width, offsets, type size) now use
// CSS `clamp()` so they scale continuously with the viewport instead of
// snapping — a 360px phone, a 430px phone, and an 820px tablet in
// portrait all get a value tuned for their own width rather than being
// lumped into one "mobile" bucket. The desktop/mobile split still exists
// for things that are structurally different (which edge a panel grows
// from, whether there's a drag cord) because that can't be done with
// pure fluid sizing — but pure sizing no longer hard-jumps.
//
// UNIFIED STATUS COLOR LANGUAGE
// Previously "pending" used a burnt-orange brand color while the toast
// shown right after submitting (which represents the exact same
// pending state) used green — so the bulb and the message it had just
// produced visually disagreed. There's now one STATUS_COLORS table
// (pending = amber, in progress = blue, resolved = green) and every
// surface — bulb icon/border, corner dot, status pill, the toast right
// after tapping, and the resolution card — reads its color from it. The
// bulb also now visibly turns green for the brief window the
// resolution card is up, instead of going back to its default grey.
//
// REPEAT-PRESS MESSAGING (this round)
// Previously, tapping the bulb again while a request was already
// pending/open just re-showed the same static status pill text
// ("Received — our team will pick this up shortly."), which reads like
// a brand-new submission even though nothing was actually submitted
// (firePull() bails out early whenever `active` is true). That's
// misleading — it should be obvious this is an *existing* request, not
// a fresh one, and the wording should reflect what stage it's actually
// in. STATUS_MESSAGES below is the single source of truth for that
// copy: a distinct "you've already raised this" message for pending,
// and a distinct "our team is working on it" message once a developer
// has picked it up (stage === "open"). The one-time toast shown right
// after an actual successful submit ("Got it — our team will reach out
// to you shortly.") is left as-is, since that one *is* describing a
// fresh submission and shouldn't be confused with the repeat-tap copy.
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, animate, useMotionValue, useTransform } from "framer-motion";
import { Lightbulb, X } from "lucide-react";
import { useHelpRequest } from "../context/HelpRequestContext.jsx";

const C = {
    ink: "#141B22",
    muted: "#5B6672",
    primary: "#C2410C",
    secondary: "#0B7285",
    hair: "rgba(20,27,34,0.09)",
};

// One color per meaning, reused everywhere that meaning shows up —
// bulb, badge dot, status pill, and the toast produced by that state.
const STATUS_COLORS = {
    pending: { border: "#D97706", icon: "#D97706", bg: "#FEF3C7", text: "#92400E", label: "Pending" },
    open: { border: "#2563EB", icon: "#2563EB", bg: "#DBEAFE", text: "#1D4ED8", label: "In progress" },
    resolved: { border: "#059669", icon: "#059669", bg: "#D1FAE5", text: "#047857", label: "Resolved" },
    error: { border: "#DC2626", icon: "#DC2626", bg: "#FEE2E2", text: "#B91C1C", label: "Error" },
};

// Copy shown in the status pill whenever the user taps/hovers the bulb
// while a request already exists — i.e. NOT the one-time "just
// submitted" toast, but the "here's what's already happening" message.
// Kept separate from STATUS_COLORS.label (which is a short badge word)
// because this needs to read as a full sentence.
const STATUS_MESSAGES = {
    pending: "You've already raised this — our team has received it and will pick it up shortly.",
    open: "Our team is already working to resolve your issue at the earliest.",
};

const HINT_SEEN_KEY = "bbm_help_bulb_hint_seen_v1";
const DRAG_TRIGGER_DISTANCE = 90;
const REST_CORD_LENGTH = 25;
const STATUS_AUTOHIDE_MS = 6000;

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
        const onChange = (e) => setReduced(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return reduced;
}

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
    useEffect(() => {
        const onResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return isDesktop;
}

export default function HelpBulb() {
    const { active, stage, loading, trigger, isLoggedIn, resolutionMessage, dismissResolutionMessage } = useHelpRequest();
    const [pulling, setPulling] = useState(false);
    const [pressed, setPressed] = useState(false); // JS-owned press state — see note at top of file
    const [toast, setToast] = useState(null);
    const [hint, setHint] = useState(false);
    const [statusVisible, setStatusVisible] = useState(false);
    const reducedMotion = usePrefersReducedMotion();
    const isDesktop = useIsDesktop();
    const autoHintTimerRef = useRef(null);
    const statusHideTimerRef = useRef(null);
    const prevStageRef = useRef(stage);
    const inFlightRef = useRef(false); // guards against double-fire on rapid double click/tap/Enter
    const rootRef = useRef(null); // outer container, used for mobile tap-outside-to-dismiss

    const dragX = useMotionValue(0);
    const dragY = useMotionValue(0);
    const cordHeight = useTransform(dragY, (v) => REST_CORD_LENGTH + Math.max(0, v));

    // Collapse all AnimatePresence transitions to an instant swap when the
    // user prefers reduced motion.
    const fade = reducedMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.01 } }
        : {};
    const slide = (dir) =>
        reducedMotion
            ? fade
            : { initial: { opacity: 0, y: dir }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: dir } };

    // First-time hint: shown once automatically, 900ms after the bulb
    // becomes available, then never forced on the user again.
    useEffect(() => {
        if (!isLoggedIn || loading) return;
        let seen = true;
        try { seen = localStorage.getItem(HINT_SEEN_KEY) === "1"; } catch { /* ignore */ }
        if (seen || active) return;
        const t = setTimeout(() => {
            setHint(true);
            autoHintTimerRef.current = setTimeout(() => {
                setHint(false);
                try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch { /* ignore */ }
            }, 4000);
        }, 900);
        return () => { clearTimeout(t); clearTimeout(autoHintTimerRef.current); };
    }, [isLoggedIn, loading, active]);

    // Surface the status pill briefly whenever the stage actually CHANGES
    // (pending -> open, or newly active), then auto-hide.
    useEffect(() => {
        if (stage !== prevStageRef.current) {
            prevStageRef.current = stage;
            if (stage) {
                setStatusVisible(true);
                clearTimeout(statusHideTimerRef.current);
                statusHideTimerRef.current = setTimeout(() => setStatusVisible(false), STATUS_AUTOHIDE_MS);
            } else {
                setStatusVisible(false);
            }
        }
        return () => clearTimeout(statusHideTimerRef.current);
    }, [stage]);

    // MOBILE: there's no hover-out to close a panel with your thumb, so a
    // tap anywhere outside the widget dismisses whatever's open — hint,
    // toast, or status. (The resolution card is deliberately excluded:
    // that one requires an explicit "Got it" so it can't be missed.)
    useEffect(() => {
        if (isDesktop) return;
        if (!hint && !toast && !statusVisible) return;
        function onOutside(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setHint(false);
                setToast(null);
                setStatusVisible(false);
            }
        }
        document.addEventListener("touchstart", onOutside, { passive: true });
        document.addEventListener("mousedown", onOutside);
        return () => {
            document.removeEventListener("touchstart", onOutside);
            document.removeEventListener("mousedown", onOutside);
        };
    }, [isDesktop, hint, toast, statusVisible]);

    if (!isLoggedIn || loading) return null;

    async function firePull() {
        // Already have an active request: don't submit a duplicate one —
        // just surface the existing status so the user sees where things
        // stand. This is the path that used to silently no-op (firePull
        // returned early, but the *stale* status pill text made it look
        // like the click did nothing distinguishable from a fresh submit).
        if (active) {
            revealStatus();
            return;
        }
        if (pulling || inFlightRef.current) return;
        inFlightRef.current = true;
        clearTimeout(autoHintTimerRef.current);
        setHint(false);
        try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch { /* ignore */ }
        setPulling(true);
        try {
            const res = await trigger();
            if (res.ok) {
                // Fresh submission — this is the ONE moment we show the
                // "just submitted" toast rather than the repeat-tap copy.
                setToast({ tone: "pending", text: "Got it — our team will reach out to you shortly." });
            } else if (res.alreadyActive) {
                // Race condition: backend says a request already exists
                // even though our local `active` flag hadn't caught up
                // yet. Use the same repeat-tap copy for consistency.
                const raceStage = stage || "pending";
                setToast({
                    tone: raceStage,
                    text: STATUS_MESSAGES[raceStage] || STATUS_MESSAGES.pending,
                });
            } else {
                setToast({ tone: "error", text: res.message });
            }
            setTimeout(() => setToast(null), 4200);
        } finally {
            setPulling(false);
            inFlightRef.current = false;
        }
    }

    function handleDragEnd() {
        const distance = Math.hypot(dragX.get(), dragY.get());
        animate(dragX, 0, { type: "spring", stiffness: 260, damping: 16 });
        animate(dragY, 0, { type: "spring", stiffness: 260, damping: 16 });
        if (distance >= DRAG_TRIGGER_DISTANCE) firePull();
    }

    function revealStatus() {
        if (!active) return;
        clearTimeout(statusHideTimerRef.current);
        setStatusVisible(true);
        statusHideTimerRef.current = setTimeout(() => setStatusVisible(false), STATUS_AUTOHIDE_MS);
    }

    function showHint() {
        clearTimeout(autoHintTimerRef.current);
        setHint(true);
        autoHintTimerRef.current = setTimeout(() => setHint(false), 4000);
    }

    // The bulb reads "resolved" (green) for as long as the resolution
    // card is up, then falls back to the live stage, then to "off".
    const visualStage = resolutionMessage ? "resolved" : stage;
    const meta = visualStage ? STATUS_COLORS[visualStage] : null;
    const iconColor = meta ? meta.icon : C.muted;
    const showStatus = active && statusVisible && !toast;
    const messageKind = resolutionMessage ? "resolution" : toast ? "toast" : showStatus ? "status" : null;
    const toastMeta = toast ? STATUS_COLORS[toast.tone] || STATUS_COLORS.error : null;
    // Repeat-tap status pill copy, keyed off the live stage — falls back
    // to the pending message if we somehow have no stage but are active.
    const statusPillText = STATUS_MESSAGES[stage] || STATUS_MESSAGES.pending;

    // Desktop: panels grow LEFTWARD from the container's own right edge
    // (never centered on a point close to the viewport edge). Mobile:
    // panels grow UPWARD from the button's own left edge.
    const panelAnchorClass = isDesktop ? "top-full mt-2 right-0" : "bottom-full mb-2 left-0";

    // Fluid sizing: clamp() instead of a hard mobile/desktop jump, so a
    // 360px phone and an 820px tablet each get a value scaled to their
    // own width rather than being lumped into one bucket.
    const panelStyle = isDesktop
        ? { width: "clamp(200px, 22vw, 260px)", maxWidth: "calc(100vw - 32px)" }
        : { width: "clamp(220px, 68vw, 300px)", maxWidth: "calc(100vw - 24px)" };
    const bulbSize = isDesktop ? 40 : "clamp(44px, 11vw, 48px)";
    const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

    return (
        <div
            className={isDesktop ? "fixed z-[85] right-12 -top-1" : "fixed z-[85] left-4"}
            style={!isDesktop ? { bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" } : undefined}
        >
            <div
                ref={rootRef}
                className="relative flex flex-col items-center"
                onMouseEnter={() => { if (!active) setHint(true); revealStatus(); }}
                onMouseLeave={() => setHint(false)}
            >
                {isDesktop && (
                    <>
                        <div className="h-1.5 w-6 rounded-full" style={{ background: C.hair }} />
                        <motion.div style={{ width: 2, height: cordHeight, background: "#C7CDD2", borderRadius: 2 }} />
                    </>
                )}

                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        top: isDesktop ? 20 : "50%",
                        left: "50%",
                        transform: isDesktop ? "translateX(-50%)" : "translate(-50%, -50%)",
                        width: 60, height: 60, borderRadius: "9999px",
                        background: meta ? `radial-gradient(circle, ${meta.icon}33, transparent 70%)` : "transparent",
                        opacity: active || resolutionMessage ? 1 : 0,
                        filter: "blur(6px)",
                        transition: "opacity 0.35s ease",
                        pointerEvents: "none",
                    }}
                />

                <motion.div
                    drag={!active && !reducedMotion}
                    dragMomentum={false}
                    dragElastic={0.35}
                    onDragEnd={handleDragEnd}
                    style={{
                        x: dragX, y: dragY,
                        touchAction: "none", userSelect: "none",
                        WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent",
                    }}
                    className="relative"
                >
                    <button
                        onClick={() => { firePull(); }}
                        onFocus={() => { if (!active) setHint(true); revealStatus(); }}
                        onPointerDown={() => setPressed(true)}
                        onPointerUp={() => setPressed(false)}
                        onPointerCancel={() => setPressed(false)}
                        onPointerLeave={() => setPressed(false)}
                        aria-disabled={active || undefined}
                        aria-label={active ? `Support has been notified — request ${meta?.label || ""}. Tap to view status.` : "Facing an issue? Tap or pull to notify our support team"}
                        aria-busy={pulling}
                        className={`relative flex items-center justify-center rounded-full border shadow-md md:shadow-sm ${focusRing}`}
                        style={{
                            width: bulbSize,
                            height: bulbSize,
                            // Constant, never conditionally toggled — this is what
                            // makes the background immune to the iOS :active bug.
                            background: "#ffffff",
                            borderColor: meta ? meta.border : C.hair,
                            cursor: active ? "pointer" : "grab",
                            WebkitTapHighlightColor: "transparent",
                            transform: pressed && !reducedMotion ? "scale(0.9)" : "scale(1)",
                            transition: "transform 120ms ease-out, border-color 200ms ease-out",
                            "--tw-ring-color": meta ? meta.icon : C.secondary,
                        }}
                    >
                        {/* Press-feedback overlay: a separate layer whose opacity is
                            driven by JS `pressed` state, so the base white background
                            above is never itself the thing that changes. */}
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full"
                            style={{
                                background: "rgba(0,0,0,0.06)",
                                opacity: pressed ? 1 : 0,
                                transition: "opacity 120ms ease-out",
                                pointerEvents: "none",
                            }}
                        />

                        {/* Light rays — only drawn when the bulb is "on" (active or
                            showing the resolved glow), so it reads as switched on and
                            glowing rather than just a color change. Pauses under
                            reduced-motion. */}
                        {meta && (
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className={`pointer-events-none absolute h-[26px] w-[26px] md:h-6 md:w-6 ${reducedMotion ? "" : "animate-pulse"}`}
                                style={{ top: 6 }}
                            >
                                <g stroke={meta.icon} strokeWidth={1.6} strokeLinecap="round" fill="none">
                                    <line x1="12" y1="0.5" x2="12" y2="2.6" />
                                    <line x1="5.6" y1="2.6" x2="7" y2="4" />
                                    <line x1="18.4" y1="2.6" x2="17" y2="4" />
                                </g>
                            </svg>
                        )}
                        <Lightbulb
                            className="relative h-[19px] w-[19px] transition-colors duration-300 md:h-[18px] md:w-[18px]"
                            style={{ color: iconColor, opacity: pulling ? 0.55 : 1 }}
                            fill="none"
                            strokeWidth={meta ? 2.4 : 2.1}
                        />
                        {!meta && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); showHint(); }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); showHint(); }
                                }}
                                aria-label="What does this button do?"
                                className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ring-2 ring-white ${focusRing}`}
                                style={{ background: C.primary, "--tw-ring-color": C.primary }}
                            >
                                ?
                            </span>
                        )}
                        {active && (
                            <span
                                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                                style={{ background: meta.icon }}
                            />
                        )}
                    </button>
                </motion.div>

                <AnimatePresence>
                    {hint && !messageKind && (
                        <motion.div
                            {...slide(isDesktop ? -4 : 4)}
                            className={`absolute ${panelAnchorClass} flex items-center gap-1.5 rounded-lg py-1.5 pl-2.5 pr-1.5 shadow-lg`}
                            style={{ ...panelStyle, background: C.ink, zIndex: 10 }}
                        >
                            <span style={{ fontSize: "clamp(11px, 3vw, 12px)", fontWeight: 600, lineHeight: 1.35, letterSpacing: "0.025em", color: "#fff", flex: 1 }}>
                                Got an issue? Tap the bulb.
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearTimeout(autoHintTimerRef.current);
                                    setHint(false);
                                    try { localStorage.setItem(HINT_SEEN_KEY, "1"); } catch { /* ignore */ }
                                }}
                                aria-label="Dismiss tip"
                                className={`shrink-0 rounded-full p-1 -m-1 hover:bg-white/15 ${focusRing}`}
                                style={{ "--tw-ring-color": "#fff" }}
                            >
                                <X className="h-3 w-3" style={{ color: "#fff" }} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {messageKind === "resolution" && (
                        <motion.div
                            key="resolution"
                            {...slide(isDesktop ? -6 : 6)}
                            className="absolute left-1/2 -bottom-14 -translate-x-1/2 md:left-auto md:right-0 md:bottom-auto md:top-16 md:translate-x-0 rounded-2xl border p-4 shadow-xl"
                            style={{
                                ...panelAnchorClass.split(" ").reduce((acc, cls) => acc, {}),
                                width: isDesktop ? "clamp(220px, 22vw, 280px)" : "clamp(240px, 90vw, 340px)",
                                maxWidth: "calc(100vw - 24px)",
                                background: "#fff",
                                borderColor: `${STATUS_COLORS.resolved.icon}44`,
                                zIndex: 10,
                            }}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p style={{ fontSize: "clamp(12.5px, 3vw, 13px)", fontWeight: 800, letterSpacing: "0.025em", color: STATUS_COLORS.resolved.text, margin: 0 }}>
                                    Request resolved
                                </p>
                                <button
                                    onClick={dismissResolutionMessage}
                                    aria-label="Dismiss"
                                    className={`shrink-0 rounded-full p-1 -m-1 hover:bg-black/5 active:bg-black/10 ${focusRing}`}
                                    style={{ "--tw-ring-color": STATUS_COLORS.resolved.icon }}
                                >
                                    <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                </button>
                            </div>
                            <p style={{ marginTop: 6, fontSize: "clamp(11.5px, 3vw, 12px)", fontWeight: 500, lineHeight: 1.4, letterSpacing: "0.025em", color: C.ink }}>
                                {resolutionMessage.notes}
                            </p>
                            <button
                                onClick={dismissResolutionMessage}
                                className={`mt-3 w-full rounded-lg py-2 text-[12.5px] font-bold text-white ${focusRing}`}
                                style={{ background: C.secondary, "--tw-ring-color": C.secondary }}
                            >
                                Got it
                            </button>
                        </motion.div>
                    )}

                    {messageKind === "toast" && (
                        <motion.div
                            key="toast" role="status" aria-live="polite"
                            {...slide(isDesktop ? -6 : 6)}
                            className={`absolute ${panelAnchorClass} rounded-xl border px-3 py-2.5 shadow-lg`}
                            style={{ ...panelStyle, background: toastMeta.bg, borderColor: `${toastMeta.icon}33`, zIndex: 10 }}
                        >
                            <p style={{
                                fontSize: "clamp(12px, 3.2vw, 13px)", fontWeight: 700, lineHeight: 1.4, letterSpacing: "0.025em", margin: 0, textAlign: "center",
                                color: toastMeta.text,
                            }}>
                                {toast.text}
                            </p>
                        </motion.div>
                    )}

                    {messageKind === "status" && (
                        <motion.div
                            key="status"
                            role="status"
                            aria-live="polite"
                            {...slide(isDesktop ? -6 : 6)}
                            className={`absolute ${panelAnchorClass} rounded-xl border px-3 py-2 shadow-md`}
                            style={{ ...panelStyle, background: meta.bg, borderColor: `${meta.icon}44`, zIndex: 10 }}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p style={{ fontSize: "clamp(11.5px, 3vw, 12px)", fontWeight: 700, lineHeight: 1.35, letterSpacing: "0.025em", color: meta.text, margin: 0 }}>
                                    {statusPillText}
                                </p>
                                <button
                                    onClick={() => setStatusVisible(false)}
                                    aria-label="Dismiss"
                                    className={`shrink-0 rounded-full p-1 -m-1 hover:bg-black/5 active:bg-black/10 ${focusRing}`}
                                    style={{ "--tw-ring-color": meta.icon }}
                                >
                                    <X className="h-3 w-3" style={{ color: meta.text }} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}