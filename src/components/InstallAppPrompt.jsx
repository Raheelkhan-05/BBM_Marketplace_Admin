import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";

const C = {
    ink: "#1B1F23",
    muted: "#5F6B6B",
    action: "#0F3B7B",
    surface: "#FFFFFF",
    hair: "rgba(11,17,22,0.06)",
};

const APP_NAME = "BBM Marketplace";

// Smooth drop-down from the top
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 };
const EXIT = { duration: 0.2, ease: [0.4, 0, 1, 1] };

export default function InstallAppPrompt() {
    const { show, platform, promptInstall, dismiss } = usePwaInstallPrompt();
    const [installing, setInstalling] = useState(false);

    const host = typeof window !== "undefined" ? window.location.hostname : "";

    async function handleInstall() {
        setInstalling(true);
        await promptInstall();
        setInstalling(false);
    }

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    role="dialog"
                    aria-label={`Install ${APP_NAME}`}
                    initial={{ opacity: 0, y: -90 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -60, transition: EXIT }}
                    transition={SPRING}
                    // swipe up to dismiss
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0.5, bottom: 0 }}
                    onDragEnd={(_, info) => {
                        if (info.offset.y < -40 || info.velocity.y < -300) dismiss();
                    }}
                    className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[999] touch-none rounded-xl sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[380px]"
                    style={{
                        background: C.surface,
                        border: `1px solid ${C.hair}`,
                        boxShadow: "0 10px 30px -10px rgba(11,17,22,0.28)",
                    }}
                >
                    <div className="flex items-center gap-3 px-3.5 py-3">
                        {/* App icon */}
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                            <img src="/Logo.png" alt={APP_NAME} className="h-full w-full object-contain p-1.5" />
                        </span>

                        {/* Title + subtitle */}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[16px] leading-tight" style={{ color: C.ink }}>
                                Install {APP_NAME}
                            </p>
                            <p className="mt-0.5 truncate text-[13px] leading-tight" style={{ color: C.muted }}>
                                {platform === "android" ? host : 'Tap Share, then "Add to Home Screen"'}
                            </p>
                        </div>

                        {/* Action */}
                        {platform === "android" ? (
                            <button
                                onClick={handleInstall}
                                disabled={installing}
                                className="shrink-0 rounded-full px-2.5 py-1.5 text-[14px] font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
                                style={{ color: C.action }}
                            >
                                {installing ? "Installing…" : "Install"}
                            </button>
                        ) : (
                            <button
                                onClick={dismiss}
                                className="shrink-0 rounded-full px-2.5 py-1.5 text-[14px] font-semibold transition-opacity active:opacity-60"
                                style={{ color: C.action }}
                            >
                                Got it
                            </button>
                        )}

                        {/* Close (Android only, since iOS already has "Got it") */}
                        {platform === "android" && (
                            <button
                                onClick={dismiss}
                                aria-label="Dismiss"
                                className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
                            >
                                <X className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}