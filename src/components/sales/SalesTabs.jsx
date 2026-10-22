// src/components/sales/SalesTabs.jsx
// Sales section navigation. Same markup, classes (gk / gn-*) and behaviour as GrowTabs,
// styled by grow-modules.css so the two areas look identical.
// Scroll down -> collapses into one compact bar ("All sections"), tap to open the grid as a dropdown.
// Scroll up   -> expands back. The nav's layout height never changes, so the page never jumps.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, Users, TrendingUp, Send, ChevronDown } from "lucide-react";
import "../growSeller/grow-modules.css";

export const SALES_TABS = [
    { key: "dashboard", to: "/sales/dashboard", label: "Dashboard", Icon: LayoutGrid, a: "var(--bl, #1E78D6)", ai: "var(--bt, #0F63B5)", match: ["/sales/dashboard"] },
    { key: "customers", to: "/sales/customers", label: "Customers", Icon: Users, a: "var(--tt, #0D6E7E)", ai: "var(--tt, #0D6E7E)", match: ["/sales/customers"] },
    { key: "pipeline", to: "/sales/pipeline", label: "Pipeline", Icon: TrendingUp, a: "var(--gr, #22A06B)", ai: "var(--gt, #12794A)", match: ["/sales/pipeline"] },
    { key: "enquiries", to: "/sales/enquiries", label: "RFQs", Icon: Send, a: "var(--or, #F4511E)", ai: "var(--ot, #C23A0B)", match: ["/sales/enquiries"] },
];

// Shown in the compact bar when the current page is not one of the tabs.
const NEUTRAL = { label: "Menu", Icon: LayoutGrid, a: "var(--bl, #1E78D6)", ai: "var(--bt, #0F63B5)" };

const isActive = (tab, path) => tab.match.some((m) => path === m || path.startsWith(`${m}/`));
const tabStyle = (t) => ({ "--a": t.a, "--c": t.c || "#fff", "--ai": t.ai });

const COLLAPSE_AT = 90;  // px scrolled before the bar may collapse
const EXPAND_AT = 40;    // always expanded near the top
const DELTA = 6;         // ignore scroll jitter smaller than this

export default function SalesTabs() {
    const { pathname } = useLocation();

    const rootRef = useRef(null);
    const tilesRef = useRef(null);
    const [top, setTop] = useState(0);
    const [full, setFull] = useState(0);        // natural (expanded) height, reserved so the layout never shifts
    const [compact, setCompact] = useState(false);
    const [open, setOpen] = useState(false);

    // null when the page isn't one of the tabs -> no tile is highlighted.
    const current = SALES_TABS.find((t) => isActive(t, pathname)) || null;
    const shown = current || NEUTRAL;
    const dropdown = compact && open;

    // Stick directly under the sibling header (.gs-hd in the sales shell, .hd elsewhere).
    useEffect(() => {
        const hd = rootRef.current?.parentElement?.querySelector(":scope > .gs-hd, :scope > .hd");
        if (!hd) return undefined;
        const measure = () => {
            const cs = window.getComputedStyle(hd);
            const pinned = cs.position === "sticky" || cs.position === "fixed";
            setTop(pinned ? Math.round((parseFloat(cs.top) || 0) + hd.getBoundingClientRect().height) : 0);
        };
        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(hd);
        window.addEventListener("resize", measure);
        return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
    }, []);

    // Reserve the expanded height permanently. Only the inner panel animates, so page layout is constant.
    useLayoutEffect(() => {
        const el = tilesRef.current;
        if (!el) return undefined;
        const measure = () => setFull(Math.ceil(el.getBoundingClientRect().height) + 1);
        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);

    // Collapse on scroll down, expand on scroll up (with hysteresis; rubber-band overscroll ignored).
    useEffect(() => {
        let last = window.scrollY;
        let ticking = false;
        const run = () => {
            const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const y = Math.min(Math.max(0, window.scrollY), max);
            const dy = y - last;
            if (y < EXPAND_AT) setCompact(false);
            else if (y > COLLAPSE_AT && dy > DELTA) setCompact(true);
            else if (dy < -DELTA) setCompact(false);
            if (Math.abs(dy) > DELTA) { setOpen(false); last = y; }
            else if (y < EXPAND_AT) last = y;
            ticking = false;
        };
        const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // New page: close the dropdown and show the full grid.
    const section = pathname.split("/").slice(0, 3).join("/");
    useEffect(() => { setOpen(false); setCompact(false); }, [section]);

    // Outside tap / Esc closes the dropdown.
    useEffect(() => {
        if (!dropdown) return undefined;
        const down = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
        const key = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("pointerdown", down);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
    }, [dropdown]);

    const CurIcon = shown.Icon;

    return (
        <nav
            ref={rootRef}
            className="gk gn gs-nav"
            data-c={compact}
            data-o={open}
            style={{ "--gn-top": `${top}px`, "--gn-full": full ? `${full}px` : "auto" }}
            aria-label="Sales sections"
        >
            <div className="gn-panel">
                {/* compact bar */}
                <div className="gn-barwrap">
                    <div className="gn-clip">
                        <div className="gn-barin">
                            <button
                                type="button"
                                className="gn-cbtn"
                                style={tabStyle(shown)}
                                aria-expanded={dropdown}
                                aria-controls="gn-tiles"
                                onClick={() => setOpen((o) => !o)}
                            >
                                <span className="gn-cico"><CurIcon aria-hidden="true" /></span>
                                <b>{shown.label}</b>
                                <span className="gn-chv">All sections <ChevronDown aria-hidden="true" /></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* tile grid */}
                <div className="gn-gridwrap">
                    <div className="gn-clip">
                        <div ref={tilesRef} id="gn-tiles" className="gn-tiles">
                            {SALES_TABS.map((t) => {
                                const active = current === t;
                                return (
                                    <Link
                                        key={t.key}
                                        to={t.to}
                                        className="gn-tab"
                                        style={tabStyle(t)}
                                        aria-current={active ? "page" : undefined}
                                        draggable={false}
                                        onClick={() => setOpen(false)}
                                    >
                                        <span className="gn-ico2"><t.Icon aria-hidden="true" /></span>
                                        <span className="gn-lb">{t.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}