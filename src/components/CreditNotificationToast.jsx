// components/CreditNotificationToast.jsx
//
// Top-center toast for realtime credit notifications (request received,
// approved / declined, credit toggled, higher-limit ask). One at a time,
// queued, auto-dismiss, tap to open /credit. Shown on every page — including
// /credit itself, where the badge would otherwise clear before you notice.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, X } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { EASE } from "./credit/tokens.js";

const SHOW_MS = 5000;
const MAX_QUEUE = 5;

export default function CreditNotificationToast() {
    const { subscribeCredit } = useNotifications();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [current, setCurrent] = useState(null);
    const queueRef = useRef([]);
    const currentRef = useRef(null);
    const timerRef = useRef(null);

    const showNext = useCallback(() => {
        clearTimeout(timerRef.current);
        const next = queueRef.current.shift() || null;
        currentRef.current = next;
        setCurrent(next);
        if (next) timerRef.current = setTimeout(showNext, SHOW_MS);
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeCredit((n) => {
            if (queueRef.current.length < MAX_QUEUE) queueRef.current.push(n);
            if (!currentRef.current) showNext();
        });
        return () => { unsubscribe(); clearTimeout(timerRef.current); };
    }, [subscribeCredit, showNext]);

    const open = () => {
        const target = current?.link || "/credit";
        showNext();
        if (!pathname.startsWith("/credit")) navigate(target);
    };

    if (typeof document === "undefined") return null;

    const title = current?.title || "Credit update";
    const body = current?.message || current?.body || "";

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-[calc(12px+env(safe-area-inset-top,0px))] z-[90] flex justify-center px-4">
            <AnimatePresence mode="wait">
                {current && (
                    <motion.div
                        key={current.id}
                        role="status"
                        initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-black p-2.5 pr-2 text-white shadow-lg"
                    >
                        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                                <CreditCard className="h-4 w-4" strokeWidth={2.3} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-bold leading-tight tracking-wide">{title}</span>
                                {body && <span className="mt-0.5 line-clamp-2 block text-[11px] font-medium leading-snug text-white/70">{body}</span>}
                            </span>
                        </button>
                        <button
                            type="button" onClick={showNext} aria-label="Dismiss"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>,
        document.body
    );
}