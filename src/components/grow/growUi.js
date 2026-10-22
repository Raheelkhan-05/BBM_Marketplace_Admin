// src/components/grow/growUi.js
// Small shared helpers for the /grow flow: drag & drop, a window-level drop guard,
// and a scroll lock so inner lists scroll natively even when Lenis smooth-scroll is active.
import { useCallback, useEffect, useRef, useState } from "react";

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

/**
 * Drag & drop for a file area.
 *   const drop = useDrop((files) => ..., { disabled });
 *   <div {...drop.bind} className={drop.active ? "on" : ""} />
 * `files` is a plain array of File objects. Filtering by type is up to the caller.
 */
export function useDrop(onFiles, { disabled = false } = {}) {
    const [active, setActive] = useState(false);
    const depth = useRef(0); // dragenter/dragleave fire for every child, so count them
    const cb = useRef(onFiles);
    const off = useRef(disabled);
    cb.current = onFiles;
    off.current = disabled;

    useEffect(() => { // an abandoned drag must never leave the zone highlighted
        const reset = () => { depth.current = 0; setActive(false); };
        window.addEventListener("dragend", reset);
        window.addEventListener("drop", reset);
        return () => {
            window.removeEventListener("dragend", reset);
            window.removeEventListener("drop", reset);
        };
    }, []);

    const bind = {
        onDragEnter(e) {
            if (!hasFiles(e)) return;
            e.preventDefault(); e.stopPropagation();
            if (off.current) return;
            depth.current += 1;
            setActive(true);
        },
        onDragOver(e) {
            if (!hasFiles(e)) return;
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = off.current ? "none" : "copy";
        },
        onDragLeave(e) {
            if (!hasFiles(e)) return;
            e.preventDefault(); e.stopPropagation();
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setActive(false);
        },
        onDrop(e) {
            if (!hasFiles(e)) return;
            e.preventDefault(); e.stopPropagation();
            depth.current = 0;
            setActive(false);
            if (off.current) return;
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) cb.current(files);
        },
    };
    return { active, bind };
}

/** Mount once on the page: a file dropped just outside a zone must not navigate the tab to that file. */
export function useDropGuard() {
    useEffect(() => {
        const stop = (e) => { if (hasFiles(e)) e.preventDefault(); };
        window.addEventListener("dragover", stop);
        window.addEventListener("drop", stop);
        return () => {
            window.removeEventListener("dragover", stop);
            window.removeEventListener("drop", stop);
        };
    }, []);
}

/**
 * Callback ref for an inner scrollable list. While the pointer is over it, the global Lenis
 * instance (window.lenis) is paused and the wheel scrolls the list itself.
 * A callback ref (not useRef + useEffect) so it also works for lists that mount later.
 *   <div ref={useScrollLock()} data-lenis-prevent> ... </div>
 */
export function useScrollLock() {
    const cleanup = useRef(null);
    return useCallback((el) => {
        if (cleanup.current) { cleanup.current(); cleanup.current = null; }
        if (!el) return;
        const lenis = () => (typeof window !== "undefined" ? window.lenis : null);
        let hover = false;
        const enter = () => { hover = true; lenis()?.stop?.(); };
        const leave = () => { hover = false; lenis()?.start?.(); };
        const wheel = (e) => {
            if (!hover) return;
            const atTop = el.scrollTop <= 0;
            const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight;
            if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return; // let the page take over at the edges
            e.preventDefault();
            e.stopPropagation();
            el.scrollTop += e.deltaY;
        };
        el.addEventListener("mouseenter", enter);
        el.addEventListener("mouseleave", leave);
        el.addEventListener("wheel", wheel, { passive: false });
        cleanup.current = () => {
            el.removeEventListener("mouseenter", enter);
            el.removeEventListener("mouseleave", leave);
            el.removeEventListener("wheel", wheel);
            if (hover) lenis()?.start?.();
        };
    }, []);
}