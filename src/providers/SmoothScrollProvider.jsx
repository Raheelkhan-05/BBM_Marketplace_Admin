// src/providers/SmoothScrollProvider.jsx
import { createContext, useContext, useEffect, useState } from "react";
import Lenis from "lenis";

const LenisContext = createContext(null);

export function SmoothScrollProvider({ children }) {
    const [lenis, setLenis] = useState(null);

    useEffect(() => {
        const prefersReduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;
        if (prefersReduced) return; // respect a11y setting, skip smoothing entirely

        let instance;
        let rafId;
        let idleId;

        function start() {
            instance = new Lenis({
                duration: 1.15,
                easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
                smoothWheel: true,
                wheelMultiplier: 1,
                touchMultiplier: 1.4,
                syncTouch: false, // native touch scroll already feels good on mobile
            });
            setLenis(instance);
            function raf(time) {
                instance.raf(time);
                rafId = requestAnimationFrame(raf);
            }
            rafId = requestAnimationFrame(raf);
        }

        // Smooth scroll is a nice-to-have, not something the page needs to
        // be usable — native scroll works fine until this kicks in. Starting
        // it on idle instead of on mount keeps it off the critical path
        // while the page's real data/images are still loading.
        if ("requestIdleCallback" in window) {
            idleId = window.requestIdleCallback(start, { timeout: 1500 });
        } else {
            idleId = setTimeout(start, 300);
        }

        return () => {
            if ("cancelIdleCallback" in window && typeof idleId === "number") {
                window.cancelIdleCallback(idleId);
            } else {
                clearTimeout(idleId);
            }
            cancelAnimationFrame(rafId);
            instance?.destroy();
            setLenis(null);
        };
    }, []);

    return (
        <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
    );
}

export function useLenis() {
    return useContext(LenisContext);
}