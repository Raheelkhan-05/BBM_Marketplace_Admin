// src/hooks/useLenisScrollLock.js
//
// v7 (this pass) — FIX: v6's global capture-phase wheel/touchmove/keydown
// blockers were fighting the modal's OWN native scrolling (scrollbar drag,
// touch, wheel) even with the containerRef allow-check in place — that's
// what caused "can't scroll at all inside the modal" after v6.
//
// Realized those listeners were unnecessary in the first place: once body
// is position:fixed + overflow:hidden, it's out of the document flow —
// there is nothing left on the page behind the modal to scroll, drag a
// scrollbar on, or wheel/touch through. No JS blocking is needed to
// enforce that; it's structurally already true. Removed all of it.
//
// The only remaining real job is stopping *scroll-chaining* — once the
// modal's own overflow-y-auto content bottoms/tops out, the browser can
// still hand the leftover wheel/touch delta to whatever's behind it
// (rubber-banding). That's handled purely via CSS
// (`overscroll-behavior: contain`) injected onto every
// `[data-scroll-lock-allow]` region — zero event listeners, so there's
// no way for it to interfere with the modal's own scrolling.
import { useEffect } from "react";

const ALLOW_SELECTOR = "[data-scroll-lock-allow]";

function getScrollbarWidth() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

/**
 * @param {boolean} active - whether the lock should currently be applied
 * @param {import("lenis").default | null} [lenis] - a Lenis instance
 *   (e.g. from SmoothScrollProvider's useLenis()). Falls back to a
 *   global `window.lenis` if omitted.
 * @param {React.RefObject<HTMLElement>} [containerRef] - kept for call-site
 *   compatibility; no longer used internally (see note above), since
 *   modal-internal scrolling is now left entirely alone rather than
 *   allow-listed against a container.
 */
export function useLenisScrollLock(active, lenis, containerRef) { // eslint-disable-line no-unused-vars
    useEffect(() => {
        if (!active) return;

        const instance = lenis || (typeof window !== "undefined" ? window.lenis : null);
        instance?.stop();

        const html = document.documentElement;
        const body = document.body;

        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        const scrollbarW = getScrollbarWidth();

        const prevHtmlOverflow = html.style.overflow;
        const prevBody = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            overflow: body.style.overflow,
            paddingRight: body.style.paddingRight,
        };

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = `-${scrollX}px`;
        body.style.right = "0";
        body.style.width = "100%";
        if (scrollbarW > 0) {
            const currentPad = parseFloat(getComputedStyle(body).paddingRight) || 0;
            body.style.paddingRight = `${currentPad + scrollbarW}px`;
        }

        // Pure CSS, no listeners: stops the modal's own scroll region
        // from rubber-banding into the (already unscrollable) page
        // behind it once its content bottoms/tops out.
        const chainStyleTag = document.createElement("style");
        chainStyleTag.setAttribute("data-scroll-lock-chain-guard", "");
        chainStyleTag.textContent = `${ALLOW_SELECTOR} { overscroll-behavior: contain; }`;
        document.head.appendChild(chainStyleTag);

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.position = prevBody.position;
            body.style.top = prevBody.top;
            body.style.left = prevBody.left;
            body.style.right = prevBody.right;
            body.style.width = prevBody.width;
            body.style.overflow = prevBody.overflow;
            body.style.paddingRight = prevBody.paddingRight;
            window.scrollTo(scrollX, scrollY);
            chainStyleTag.remove();
            instance?.start();
        };
    }, [active, lenis, containerRef]);
}