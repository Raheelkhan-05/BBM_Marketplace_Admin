import { useEffect, useRef, useCallback } from "react";

// Repeatable "approaching the bottom" sentinel, driven by Lenis's scroll
// event (falling back to native scroll) — identical mechanism to the
// checkSentinel/loadMore pattern already used in BrowsePage.jsx. Calls
// `onNear` every qualifying scroll tick; `onNear` is expected to no-op
// internally when there's nothing to do, same as loadMore() does there.
// Pass `disabled: true` once there's nothing left to load.
export default function useInfiniteScrollSentinel(onNear, { lookahead = 800, disabled = false } = {}) {
    const nodeRef = useRef(null);
    const ref = useCallback((el) => { nodeRef.current = el; }, []);
    const cbRef = useRef(onNear);
    cbRef.current = onNear;

    useEffect(() => {
        if (disabled) return;

        const check = () => {
            const el = nodeRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (rect.top <= window.innerHeight + lookahead) cbRef.current();
        };

        const lenis = window.lenis;
        if (lenis?.on) lenis.on("scroll", check);
        else window.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check);
        check();

        return () => {
            lenis?.off?.("scroll", check);
            window.removeEventListener("scroll", check);
            window.removeEventListener("resize", check);
        };
    }, [disabled, lookahead]);

    return ref;
}