import { useEffect, useRef, useState, useCallback } from "react";

// Fires once, the first time the target is within `lookahead`px of the
// viewport, then stops checking. Driven by Lenis's own scroll event
// (falling back to native window scroll) rather than IntersectionObserver —
// same reasoning as BrowsePage's infinite-scroll sentinel: Lenis moves
// content via transform, and IO's default viewport root doesn't reliably
// fire against that in this app. Checking getBoundingClientRect on Lenis's
// own scroll tick sidesteps it entirely.
export default function useInViewOnce({ lookahead = 600 } = {}) {
    const [node, setNode] = useState(null);
    const [inView, setInView] = useState(false);
    const ref = useCallback((el) => setNode(el), []);
    const firedRef = useRef(false);

    useEffect(() => {
        if (!node || firedRef.current) return;

        const check = () => {
            if (firedRef.current) return;
            const rect = node.getBoundingClientRect();
            const near = rect.top <= window.innerHeight + lookahead && rect.bottom >= -lookahead;
            if (near) {
                firedRef.current = true;
                setInView(true);
            }
        };

        const lenis = window.lenis;
        if (lenis?.on) lenis.on("scroll", check);
        else window.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check);
        check(); // covers the case where it's already on/near screen at mount

        return () => {
            lenis?.off?.("scroll", check);
            window.removeEventListener("scroll", check);
            window.removeEventListener("resize", check);
        };
    }, [node, lookahead]);

    return [ref, inView];
}