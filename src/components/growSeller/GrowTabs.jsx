// src/components/growSeller/GrowTabs.jsx
// Icon-tile section navigation (grid, no sideways scroll).
// Scroll down  -> collapses into one compact bar ("All sections"), tap to open the grid as a dropdown.
// Scroll up    -> expands back. The nav's layout height never changes, so the page never jumps.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, Package, Megaphone, Receipt, Truck, MessageSquare, Store, Users, Film, ChevronDown } from "lucide-react";
import useGrowBadges from "./useGrowBadges.js";
import "./grow-modules.css";

const TABS = [
    { key: "dashboard", to: "/grow/dashboard", label: "Dashboard", Icon: LayoutGrid, a: "var(--bl, #1E78D6)", ai: "var(--bt, #0F63B5)", match: ["/grow/dashboard"] },
    { key: "products", to: "/grow/products", label: "Products", Icon: Package, a: "var(--go, #FFD60A)", c: "#06161C", ai: "#9A7400", match: ["/grow/products"] },
    { key: "enquiries", to: "/grow/enquiries", label: "Enquiries", Icon: Megaphone, a: "var(--or, #F4511E)", ai: "var(--ot, #C23A0B)", match: ["/grow/enquiries", "/grow/enquiry"] },
    { key: "orders", to: "/grow/orders", label: "Orders", Icon: Receipt, a: "var(--gr, #22A06B)", ai: "var(--gt, #12794A)", match: ["/grow/orders"] },
    { key: "transport", to: "/grow/transport", label: "Transport", Icon: Truck, a: "var(--tt, #0D6E7E)", ai: "var(--tt, #0D6E7E)", match: ["/grow/transport"] },
    { key: "chat", to: "/grow/chat", label: "Chat", Icon: MessageSquare, a: "var(--bl, #1E78D6)", ai: "var(--bt, #0F63B5)", match: ["/grow/chat"] },
    { key: "shop", to: "/grow/shop", label: "Shop", Icon: Store, a: "var(--go, #FFD60A)", c: "#06161C", ai: "#9A7400", match: ["/grow/shop"] },
    // Coming soon: they open a friendly "coming soon" page and show a "Soon" tag on the tile.
    { key: "customers", to: "/grow/customers", label: "Customers", Icon: Users, a: "var(--tt, #0D6E7E)", ai: "var(--tt, #0D6E7E)", match: ["/grow/customers"], soon: true },
    // { key: "media", to: "/grow/media", label: "Media", Icon: Film, a: "var(--or, #F4511E)", ai: "var(--ot, #C23A0B)", match: ["/grow/media"], soon: true },
];

// Shown in the compact bar when the current page is not one of the tabs (e.g. wallet, opened from the header).
const NEUTRAL = { label: "Menu", Icon: LayoutGrid, a: "var(--bl, #1E78D6)", ai: "var(--bt, #0F63B5)" };

const isActive = (tab, path) => tab.match.some((m) => path === m || path.startsWith(`${m}/`));
const tabStyle = (t) => ({ "--a": t.a, "--c": t.c || "#fff", "--ai": t.ai });

const COLLAPSE_AT = 90;  // px scrolled before the bar may collapse
const EXPAND_AT = 40;    // always expanded near the top
const DELTA = 6;         // ignore scroll jitter smaller than this

export default function GrowTabs() {
    const { pathname } = useLocation();
    // Same hook the Grow FAB uses, so the numbers always match.
    const counts = useGrowBadges();

    const rootRef = useRef(null);
    const tilesRef = useRef(null);
    const [top, setTop] = useState(0);
    const [full, setFull] = useState(0);        // natural (expanded) height, reserved so the layout never shifts
    const [compact, setCompact] = useState(false);
    const [open, setOpen] = useState(false);

    // null when the page isn't one of the tabs -> no tile is highlighted.
    const current = TABS.find((t) => isActive(t, pathname)) || null;
    const shown = current || NEUTRAL;
    const dropdown = compact && open;

    // Stick directly under the header (sticky / fixed header) or to the top.
    useEffect(() => {
        const hd = rootRef.current?.parentElement?.querySelector(":scope > .hd");
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
            className="gk gn"
            data-c={compact}
            data-o={open}
            style={{ "--gn-top": `${top}px`, "--gn-full": full ? `${full}px` : "auto" }}
            aria-label="Seller sections"
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
                            {TABS.map((t) => {
                                const active = current === t;
                                const n = counts[t.key] || 0;
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
                                        <span className="gn-ico2">
                                            <t.Icon aria-hidden="true" />
                                            {n > 0 && <em className="gn-badge">{n > 99 ? "99+" : n}<span className="gk-vh"> unread</span></em>}
                                        </span>
                                        <span className="gn-lb">{t.label}</span>
                                        {/* {t.soon && <span className="gn-soon">Soon</span>} */}
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