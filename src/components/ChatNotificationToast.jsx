// components/ChatNotificationToast.jsx
//
// Center-of-screen popup for new chat messages — same mechanics as
// OrderNotificationToast (own queue, own portal), but sourced from
// NotificationsContext's subscribeChat() instead of subscribeOrder().
// Doesn't call markRead — chat's read state lives in ChatContext,
// keyed off actual message watermarks, not the notifications table.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationsContext.jsx";

const HOLD_MS = 4000;

export default function ChatNotificationToast() {
    const { subscribeChat } = useNotifications();
    const navigate = useNavigate();
    const [queue, setQueue] = useState([]);
    const [current, setCurrent] = useState(null);
    const hideTimerRef = useRef(null);

    useEffect(() => {
        const unsubscribe = subscribeChat((payload) => {
            if (!payload?.id) return;
            setQueue((prev) => [...prev, payload]);
        });
        return unsubscribe;
    }, [subscribeChat]);

    useEffect(() => {
        if (current || queue.length === 0) return;
        const next = queue[0];
        setQueue((prev) => prev.slice(1));
        setCurrent(next);
    }, [queue, current]);

    useEffect(() => {
        if (!current) return;
        hideTimerRef.current = setTimeout(() => setCurrent(null), HOLD_MS);
        return () => clearTimeout(hideTimerRef.current);
    }, [current]);

    if (typeof document === "undefined") return null;

    const handleClick = () => {
        if (!current) return;
        clearTimeout(hideTimerRef.current);
        const link = current.link;
        setCurrent(null);
        if (link) navigate(link);
    };

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
                            <MessageCircle className="h-4 w-4 text-white" />
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