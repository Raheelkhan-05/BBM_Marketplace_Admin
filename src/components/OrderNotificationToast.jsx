// components/OrderNotificationToast.jsx
//
// Center-of-screen popup for order notifications (purchase + sales),
// separate from NotificationIsland (which still handles the bell-origin
// toast for everything else). Mounted once, high up the tree (Layout.jsx),
// and portals to document.body so it floats above all page content.
//
// Order notifications never enter this component's queue directly — the
// NotificationsProvider classifies incoming socket events by link and
// only calls subscribeOrder() listeners for order-type ones, so this
// component doesn't need to know about the type/link rules itself.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Package, CheckCircle2, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationsContext.jsx";

const HOLD_MS = 3400;

// Same light heuristic NotificationIsland uses, kept local here so this
// component has no dependency on NotificationIsland's internals.
function pickIcon(n) {
    const t = `${n?.title || ""} ${n?.body || ""}`.toLowerCase();
    if (t.includes("shipped") || t.includes("delivered") || t.includes("order")) return Package;
    if (t.includes("approved") || t.includes("confirmed") || t.includes("success")) return CheckCircle2;
    return Info;
}

export default function OrderNotificationToast() {
    const { subscribeOrder, markRead } = useNotifications();
    const navigate = useNavigate();
    const [queue, setQueue] = useState([]);
    const [current, setCurrent] = useState(null);
    const hideTimerRef = useRef(null);

    useEffect(() => {
        const unsubscribe = subscribeOrder((payload) => {
            if (!payload?.id) return;
            setQueue((prev) => [...prev, payload]);
        });
        return unsubscribe;
    }, [subscribeOrder]);

    // Drain one at a time — this effect only decides WHEN to promote the
    // next queued item to `current`. It must not depend on anything that
    // changes while a notification is already showing, or its cleanup will
    // tear down the hide-timer effect below.
    useEffect(() => {
        if (current || queue.length === 0) return;
        const next = queue[0];
        setQueue((prev) => prev.slice(1));
        setCurrent(next);
    }, [queue, current]);

    // Auto-hide the currently shown notification. Keyed ONLY on current.id,
    // so a new item arriving in the queue (which changes `queue`, not
    // `current`) can't retrigger/cancel this effect and strand the timer.
    useEffect(() => {
        if (!current) return;
        hideTimerRef.current = setTimeout(() => setCurrent(null), HOLD_MS);
        return () => clearTimeout(hideTimerRef.current);
    }, [current]);

    if (typeof document === "undefined") return null;

    const handleClick = () => {
        if (!current) return;
        clearTimeout(hideTimerRef.current);
        if (!current.read) markRead(current.id);
        const link = current.link;
        setCurrent(null);
        if (link) navigate(link);
    };

    const Icon = current ? pickIcon(current) : null;

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[200] flex justify-center px-4">
            <AnimatePresence>
                {current && (
                    <motion.div
                        key={current.id}
                        initial={{ opacity: 0, y: -16, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -16, scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        onClick={handleClick}
                        className="pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-[26px] px-4 py-3 shadow-[0_18px_40px_-8px_rgba(0,0,0,0.5)]"
                        style={{ background: "#0B1116" }}
                    >
                        <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                            style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}
                        >
                            <Icon className="h-4 w-4 text-white" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-white">{current.title}</p>
                            {current.body && <p className="truncate text-[12px] text-white/70">{current.body}</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body
    );
}