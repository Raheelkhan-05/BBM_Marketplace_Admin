// src/hooks/useModalScrollLock.js
// Locks page scroll (native + Lenis) while a modal is mounted. Use together with
// data-lenis-prevent + onWheel/onTouchMove={stopModalEvent} on the overlay.
import { useEffect } from "react";

const getLenis = () => (typeof window !== "undefined" ? window.lenis || window.__lenis || null : null);

export const stopModalEvent = (e) => e.stopPropagation();

export default function useModalScrollLock(onEscape) {
    useEffect(() => {
        const root = document.documentElement;
        const sw = window.innerWidth - root.clientWidth;
        const { style } = document.body;
        const prevO = style.overflow, prevP = style.paddingRight, prevR = root.style.overflow;
        style.overflow = "hidden";
        root.style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        try { getLenis()?.stop?.(); } catch { /* ignore */ }
        return () => {
            style.overflow = prevO;
            style.paddingRight = prevP;
            root.style.overflow = prevR;
            try { getLenis()?.start?.(); } catch { /* ignore */ }
        };
    }, []);

    useEffect(() => {
        if (!onEscape) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onEscape(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onEscape]);
}