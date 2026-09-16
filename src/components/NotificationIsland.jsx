import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Package, CheckCircle2, Info } from "lucide-react";

const BALL_SIZE = 14;
const DROP_MS = 220;   // small "gravity drop" beat before it expands
const HOLD_MS = 3400;  // how long the expanded pill stays open

// Light heuristic so the pill shows a relevant icon instead of a generic one.
function pickIcon(n) {
    const t = `${n?.title || ""} ${n?.body || ""}`.toLowerCase();
    if (t.includes("order") || t.includes("shipped") || t.includes("delivered")) return Package;
    if (t.includes("approved") || t.includes("confirmed") || t.includes("success")) return CheckCircle2;
    return Info;
}

function targetStyle(phase, ball, pillWidth) {
    if (phase === "expanded") {
        return { top: 14, left: "50%", x: "-50%", width: pillWidth, height: "auto", borderRadius: 26, scale: 1, opacity: 1 };
    }
    if (phase === "collapsing") {
        return { top: ball.top, left: ball.left, x: 0, width: BALL_SIZE, height: BALL_SIZE, borderRadius: 999, scale: 1, opacity: 1 };
    }
    // "entering" — popped out of the bell, dropping a touch before it expands.
    return { top: ball.top + 18, left: ball.left, x: 0, width: BALL_SIZE, height: BALL_SIZE, borderRadius: 999, scale: 1, opacity: 1 };
}

/**
 * One notification rendered as an iOS-Dynamic-Island-style toast that
 * visibly originates from the bell: a dot pops out, drops a touch, then
 * morphs into a pill at the top of the screen. On the way back down it
 * shrinks into a dot again and disappears into the bell — `onSettle` fires
 * right then, which is the cue for the bell's badge to actually tick up.
 */
export default function NotificationIsland({ notification, originRect, onSettle }) {
    const [phase, setPhase] = useState("entering");
    const settledRef = useRef(false);

    useEffect(() => {
        if (!notification) return;
        settledRef.current = false;
        setPhase("entering");
        const toExpand = setTimeout(() => setPhase("expanded"), DROP_MS);
        const toCollapse = setTimeout(() => setPhase("collapsing"), DROP_MS + HOLD_MS);
        return () => { clearTimeout(toExpand); clearTimeout(toCollapse); };
    }, [notification]);

    if (!notification || !originRect) return null;

    const ball = {
        top: originRect.top + originRect.height / 2 - BALL_SIZE / 2,
        left: originRect.left + originRect.width / 2 - BALL_SIZE / 2,
    };
    const pillWidth = Math.min(typeof window !== "undefined" ? window.innerWidth * 0.92 : 360, 360);
    const expanded = phase === "expanded";
    const Icon = pickIcon(notification);

    return createPortal(
        <motion.div
            initial={{ top: ball.top, left: ball.left, x: 0, width: BALL_SIZE, height: BALL_SIZE, borderRadius: 999, scale: 0.3, opacity: 0 }}
            animate={targetStyle(phase, ball, pillWidth)}
            transition={{ type: "spring", stiffness: expanded ? 300 : 420, damping: expanded ? 30 : 24, mass: 0.9 }}
            onAnimationComplete={() => {
                if (phase === "collapsing" && !settledRef.current) {
                    settledRef.current = true;
                    onSettle(notification.id);
                }
            }}
            style={{ position: "fixed", zIndex: 200, background: "#0B1116", overflow: "hidden", boxShadow: "0 18px 40px -8px rgba(0,0,0,0.5)" }}
        >
            {expanded && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.14, duration: 0.18 }}
                    className="flex items-center gap-3 px-4 py-3"
                >
                    <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}
                    >
                        <Icon className="h-4 w-4 text-white" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-white">{notification.title}</p>
                        {notification.body && <p className="truncate text-[12px] text-white/70">{notification.body}</p>}
                    </div>
                </motion.div>
            )}
        </motion.div>,
        document.body
    );
}