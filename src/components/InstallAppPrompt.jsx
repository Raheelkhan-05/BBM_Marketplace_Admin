import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, WifiOff, Share, Home } from "lucide-react";
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";

const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.08)",
};

// Smooth, natural spring — no linear/eased feel
const SPRING = { type: "spring", stiffness: 340, damping: 32, mass: 0.9 };
const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] };

const PERKS = [
    { icon: Zap, text: "Faster load, no browser chrome" },
    { icon: WifiOff, text: "Works even with a weak connection" },
    { icon: Home, text: "One tap from your home screen" },
];

export default function InstallAppPrompt() {
    const { show, platform, promptInstall, dismiss } = usePwaInstallPrompt();
    const [installing, setInstalling] = useState(false);

    async function handleInstall() {
        setInstalling(true);
        await promptInstall();
        setInstalling(false);
    }

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: 28, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.97, transition: EXIT }}
                    transition={SPRING}
                    className="fixed inset-x-3 bottom-1 z-[999] overflow-hidden rounded-[22px] border bg-white sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px]"
                    style={{ borderColor: C.hair, boxShadow: "0 20px 50px -16px rgba(11,17,22,0.24)" }}
                >
                    {/* clean single-tone accent strip — subtle tonal gradient, not multi-hue */}
                    <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #C71F11 0%, #D2462B 100%)" }} />

                    <div className="relative p-4">
                        <motion.button
                            onClick={dismiss}
                            aria-label="Dismiss"
                            whileTap={{ scale: 0.9 }}
                            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 hover:bg-black/[0.05]"
                        >
                            <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                        </motion.button>

                        <div className="flex items-start gap-3 pr-6">
                            <span
                                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-white"
                                style={{ borderColor: C.hair }}
                            >
                                <img src="/Logo.png" alt="BBM" className="h-full w-full object-contain p-1.5" />
                            </span>

                            <div className="min-w-0 pt-0.5">
                                <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: C.secondary }}>
                                    Get the app
                                </p>
                                <h3 className="mt-0.5 text-[14.5px] font-extrabold leading-tight" style={{ color: C.ink }}>
                                    Install BBM Marketplace
                                </h3>
                            </div>
                        </div>

                        <ul className="mt-3.5 flex flex-col gap-1.5">
                            {PERKS.map(({ icon: Icon, text }) => (
                                <li key={text} className="flex items-center gap-2 text-[12px] font-medium" style={{ color: C.muted }}>
                                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                    {text}
                                </li>
                            ))}
                        </ul>

                        {platform === "android" ? (
                            <motion.button
                                onClick={handleInstall}
                                disabled={installing}
                                whileTap={{ scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white transition-opacity duration-200 disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #D2462B 0%, #C71F11 100%)" }}
                            >
                                {installing ? "Installing…" : "Install now"}
                            </motion.button>
                        ) : (
                            <div
                                className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-semibold"
                                style={{ background: `${C.secondary}0c`, color: C.ink }}
                            >
                                <Share className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                Tap Share, then "Add to Home Screen"
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}