import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Store, X } from "lucide-react";

// Lightweight, theme-matched, non-blocking toast. Renders in a portal so it
// floats above the page without any backdrop/overlay — the page underneath
// stays fully interactive. Auto-dismisses after `duration` ms.
export default function Toast({ message, show, onDone, duration = 5000, icon: Icon = Store }) {
    useEffect(() => {
        if (!show) return;
        const t = setTimeout(() => onDone?.(), duration);
        return () => clearTimeout(t);
    }, [show, duration, onDone]);

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[999] flex justify-center px-4 sm:top-5">
            <AnimatePresence>
                {show && (
                    <motion.div
                        initial={{ opacity: 0, y: -16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.97 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-[#047084]/15 bg-white px-4 py-3.5 shadow-[0_20px_45px_-15px_rgba(4,55,64,0.35)]"
                    >
                        <span
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}
                        >
                            <Icon className="h-4 w-4" />
                        </span>
                        <p className="pt-1 text-[13.5px] font-semibold leading-snug tracking-wide text-slate-700">
                            {message}
                        </p>
                        <button
                            type="button"
                            onClick={onDone}
                            className="ml-1 mt-0.5 shrink-0 rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500"
                            aria-label="Dismiss"
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