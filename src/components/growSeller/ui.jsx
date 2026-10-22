// Small shared UI pieces for the GROW seller area.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Ic from "./Ic.jsx";
import { useGrowSeller } from "../../context/GrowSellerContext.js";

/** Renders inside the .gsl root so the scoped CSS (and theme variables) apply. */
export function Portal({ children }) {
    const { root } = useGrowSeller();
    return root ? createPortal(children, root) : null;
}

// Phone: keeps the sheet's layer inside the area above the keyboard,
// and scrolls the focused field into view. Writes to the DOM directly (no React lag).
function useKeyboardSheet(shadeRef, sheetRef) {
    useEffect(() => {
        const shade = shadeRef.current;
        const sheet = sheetRef.current;
        if (!shade || !sheet) return undefined;
        const phone = window.matchMedia("(max-width: 767px)");
        const vv = window.visualViewport;
        const timers = [];
        let raf = 0;

        const apply = () => {
            if (!phone.matches) {
                shade.style.height = shade.style.transform = sheet.style.maxHeight = "";
                shade.dataset.kb = "false";
                return;
            }
            const h = Math.round(vv ? vv.height : window.innerHeight);
            const top = Math.round(vv ? vv.offsetTop : 0);
            shade.style.height = `${h}px`;
            shade.dataset.kb = window.innerHeight - h > 120 ? "true" : "false";
            shade.style.transform = `translate3d(0, ${top}px, 0)`;
            sheet.style.maxHeight = `${Math.round(h * 0.94)}px`;
        };
        const reveal = () => {
            const el = document.activeElement;
            if (el && sheet.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
                el.scrollIntoView({ block: "center", behavior: "auto" });
            }
        };
        const onChange = () => {
            if (window.scrollX || window.scrollY) window.scrollTo(0, 0); // undo browser page pan
            apply();
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { apply(); reveal(); });
        };
        const settle = () => {
            onChange();
            [60, 150, 300, 600].forEach((ms) => timers.push(setTimeout(onChange, ms)));
        };

        apply();
        vv?.addEventListener("resize", onChange);
        vv?.addEventListener("scroll", onChange);
        window.addEventListener("resize", onChange);
        window.addEventListener("orientationchange", settle);
        document.addEventListener("focusin", settle);
        document.addEventListener("focusout", settle);
        return () => {
            cancelAnimationFrame(raf);
            timers.forEach(clearTimeout);
            vv?.removeEventListener("resize", onChange);
            vv?.removeEventListener("scroll", onChange);
            window.removeEventListener("resize", onChange);
            window.removeEventListener("orientationchange", settle);
            document.removeEventListener("focusin", settle);
            document.removeEventListener("focusout", settle);
        };
    }, [shadeRef, sheetRef]);
}

/**
 * Bottom sheet on phones, centred modal from 768px.
 * `light` = white panel for reused (Tailwind, light) content such as the edit form.
 * Omit `title` to render only the grab handle + close button.
 */
export function Sheet({ title, sub, onClose, wide = false, light = false, bare = false, children }) {
    const closeRef = useRef(onClose);
    const shadeRef = useRef(null);
    const sheetRef = useRef(null);
    useKeyboardSheet(shadeRef, sheetRef);
    closeRef.current = onClose;

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        try { window.lenis?.stop?.(); } catch { /* noop */ }
        const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            try { window.lenis?.start?.(); } catch { /* noop */ }
            window.removeEventListener("keydown", onKey);
        };
    }, []);

    return (
        <Portal>
            <div ref={shadeRef} className="shade" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current?.(); }}>
                <div ref={sheetRef} className={`sheet${wide ? " wide" : ""}${light ? " lt" : ""}${bare ? " bare" : ""}`} role="dialog" aria-modal="true" aria-label={title || "Details"} data-lenis-prevent="">
                    <div className="gp" />
                    {!bare && (
                        <div className="shh">
                            <div>
                                {title && <h2 className="h2">{title}</h2>}
                                {sub && <p className="sub2">{sub}</p>}
                            </div>
                            <button type="button" className="ib sm" aria-label="Close" onClick={() => closeRef.current?.()}><Ic n="x" /></button>
                        </div>
                    )}

                    {children}
                </div>
            </div>
        </Portal>
    );
}

export function Thumb({ src, name, onClick, zoom }) {
    const inner = src ? <img src={src} alt="" loading="lazy" decoding="async" /> : (name || "?").trim()[0]?.toUpperCase() || "?";
    const cls = `th${src ? "" : " ph"}${zoom && src ? " zoom" : ""}`;
    if (onClick && src) return <button type="button" className={cls} aria-label="View images" onClick={onClick}>{inner}</button>;
    return <div className={cls} aria-hidden={!src}>{inner}</div>;
}

export function ListSkeleton({ n = 3, tall = false }) {
    return (
        <div className="grid c2" aria-busy="true" aria-label="Loading">
            {Array.from({ length: n }).map((_, i) => <div key={i} className={`sk${tall ? " tall" : ""}`} />)}
        </div>
    );
}

export function Empty({ title, text, children }) {
    return <div className="emp"><b>{title}</b>{text}{children}</div>;
}

export function Spinner() { return <Ic n="spin" />; }