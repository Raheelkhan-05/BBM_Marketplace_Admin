// components/BottomNavStrip.jsx
//
// Floating dock (FABs) + CONSOLE sheet.
//
// CONSOLE = notifications list + Team + Helpline + Sign out.
//   Mobile : a bottom sheet (same height / open / close as before). Helpline + Sign out
//            sit under the title, then a Notifications | Team switch, then the content.
//   Desktop (md+): a single wide-ish panel above the dock. Only Sign out is shown
//            (Helpline is reachable another way on desktop), top-right.
// Notifications are read from NotificationsContext (no extra fetching). Popups / toasts
// still appear as before; the Console is where they can be re-read afterwards.
// Chat notifications are not listed (Chats has its own badge elsewhere).
//
// TEAM: the Team tab (components/team/TeamPanel.jsx) lets the company admin invite people by
// phone / email, manage members and read the activity log. Team members see the team list.
//
// QUICK ACTIONS: a notification about something that still waits for the seller (a new order, a
// transport route proposal) carries its buttons right in the list (Confirm / Reject, Approve /
// Decline). Whether the buttons show is decided by NotificationActionsContext from live data, so an
// action taken here or on the page removes the buttons in both places at once.
//
// While the Console is open the other FABs collapse OUT of the dock (they take no space),
// so the dock shrinks to just the X button, which stays exactly where the Console button was.
//
// Dock, backdrop and sheet are rendered through a portal on document.body.
// Only ONE instance ever renders (an extra copy renders nothing).
//
// Dock layout is the SAME on every page: [Grow] [Save] [Console | Home | Sign in].
import { Fragment, useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, X, LogOut, Home, LogIn } from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";
import { useNotifications } from "../context/NotificationsContext.jsx";
import { useNotificationActions } from "../context/NotificationActionsContext.jsx";
import { isChatNotification } from "../utils/notificationTypes.js";
import HelpBulb from "./HelpBulb.jsx";
import NotificationTimeline from "./NotificationTimeline.jsx";
import TeamPanel from "./team/TeamPanel.jsx";
import { stampOf } from "../utils/notificationDisplay.js";
import { isSellerReady } from "./growSeller/growSeller.js";
import useGrowBadges from "./growSeller/useGrowBadges.js";

const C = { ink: "#141B22", muted: "#5B6672", secondary: "#0B7285", hair: "rgba(20,27,34,0.09)", tile: "rgba(20,27,34,0.06)" };

const FAB_BOTTOM_HOME = 12;
// 52 (tallest circle) + 4 gap + 11 label + 12 padding + 3 border + 4 ring + ~2 slack
const DOCK_HEIGHT = 88;

// Layers (portal on document.body). Kept very high so page-level fixed bars sit underneath.
const Z_BACKDROP = 9990;
const Z_SHEET = 9991;
const Z_DOCK = 9992;

// Same timing for the tiles collapsing and the dock sliding, so they move together.
const DOCK_COLLAPSE = { duration: 0.22, ease: "easeOut" };

// Page elements that must disappear while the Console is open.
const HIDE_WHEN_MENU_OPEN = [".gl .dock"];

const FAB_THEME = {
    grow: { bg: "#22A06B", fg: "#FFFFFF" },
    save: { bg: "#FFD60A", fg: "#06161C" },
    home: { bg: "#114072", fg: "#FFFFFF" },
    menu: { bg: "#0B5563", fg: "#FFFFFF" },
    login: { bg: "#08222B", fg: "#FFFFFF" },
};

const SLOT = [
    { size: 44, icon: 20 },
    { size: 52, icon: 22, raised: true }, // the "Save" slot: bigger, raised, with the ping ring
];

const svgBase = { viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
const GrowIcon = () => <svg {...svgBase}><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>;
const SaveIcon = () => <span style={{ font: "900 1.5rem 'Figtree', system-ui, sans-serif", lineHeight: 1 }}>₹</span>;
const HomeIcon = ({ size = 22 }) => <Home size={size} strokeWidth={1.8} aria-hidden="true" />;

// Labels shown under each dock circle live here, change them in one place.
const TILES = {
    grow: { key: "grow", label: "Sell", Icon: GrowIcon, to: "/grow", theme: FAB_THEME.grow },
    save: { key: "save", label: "Buy", Icon: SaveIcon, to: "/save", theme: FAB_THEME.save },
};

const DOCK_BTN = "relative grid shrink-0 place-items-center rounded-full";

const DOCK_RING = "#ffffff"; // ring colour where the comet isn't passing

const DOCK_CONIC =
    "conic-gradient(from 0deg, rgba(31,122,77,0) 0deg, rgba(31,122,77,0) 110deg, rgba(31,122,77,0.55) 200deg, #34C77B 275deg, #F5C75A 325deg, #FFFFFF 350deg, rgba(255,255,255,0) 360deg)";

const DOCK_AURA_CSS = `
.bbm-dock-spin {
    transform: translate(-50%, -50%);
    animation: bbm-dock-spin 6s linear infinite;
    will-change: transform;
}
@keyframes bbm-dock-spin {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(360deg); }
}
.bbm-dock-ping {
    animation: bbm-dock-ping 3.5s ease-out infinite;
}
@keyframes bbm-dock-ping {
    0%, 55% { transform: scale(1);   opacity: 0; }
    60%     { transform: scale(1);   opacity: 0.8; }
    100%    { transform: scale(1.75); opacity: 0; }
}
.bbm-dock-nudge {
    animation: bbm-dock-nudge 3.5s ease-in-out infinite;
}
@keyframes bbm-dock-nudge {
    0%, 60%, 100% { transform: translate(0, 0); }
    78%           { transform: translate(2.5px, -2.5px); }
}
@media (prefers-reduced-motion: reduce) {
    .bbm-dock-spin, .bbm-dock-ping, .bbm-dock-nudge { animation: none; }
    .bbm-dock-ping { display: none; }
}
.bbm-item { outline: none; -webkit-tap-highlight-color: transparent; }
.bbm-item:focus-visible .bbm-ic { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #141B22 !important; }
`;

// While the Console is open: our own tiles are forced hidden, plus any selectors listed above.
const MENU_OPEN_CSS = `
body[data-bbm-menu="open"] .bbm-tile { opacity: 0 !important; pointer-events: none !important; }
${HIDE_WHEN_MENU_OPEN.map((s) => `body[data-bbm-menu="open"] ${s}`).join(",\n")} { visibility: hidden !important; }
`;

// Hide the dock while a screen with its own sticky action bar, or any modal dialog, is open.
const HIDE_DOCK_CSS = `
.bbm-dock[data-hidden="true"],
body:has(.gs .app.hb) .bbm-dock,
body:has(.gax-edit) .bbm-dock,
body:has(.sh-portal) .bbm-dock,
body:has(.bbm-buynow) .bbm-dock,
body:has([role="dialog"][aria-modal="true"]) .bbm-dock { display: none !important; }
`;

// Mobile: bottom sheet (unchanged height + motion). Desktop (md+): one panel above the dock.
const SHEET_CSS = `
.bbm-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: ${Z_SHEET};
    margin-inline: auto; display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border-radius: 24px 24px 0 0;
    max-height: min(85dvh, calc(100dvh - 130px));
    transform: translateY(calc(100% + 140px));
    visibility: hidden; pointer-events: none;
    transition: transform .3s ease-out, box-shadow .3s ease-out, visibility 0s linear .3s;
}
.bbm-sheet[data-open="true"] {
    transform: translateY(0); visibility: visible; pointer-events: auto;
    box-shadow: 0 -12px 40px -12px rgba(0,0,0,.35);
    transition-delay: 0s;
}
@media (min-width: 768px) {
    .bbm-sheet {
        left: 50%; right: auto; margin-inline: 0;
        bottom: calc(${FAB_BOTTOM_HOME + DOCK_HEIGHT + 16}px + env(safe-area-inset-bottom, 0px));
        width: min(560px, calc(100vw - 64px));
        height: min(680px, 78dvh, calc(100dvh - 170px));
        max-height: min(78dvh, calc(100dvh - 170px));
        border-radius: 28px; border: 1px solid rgba(20,27,34,.08);
        opacity: 0; transform: translate(-50%, 14px) scale(.98);
        transition: transform .2s ease-out, opacity .2s ease-out, visibility 0s linear .2s;
    }
    .bbm-sheet[data-open="true"] {
        opacity: 1; transform: translate(-50%, 0) scale(1);
        box-shadow: 0 28px 70px -18px rgba(8,34,43,.4);
    }
}
`;

const ICON_TILE = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl";

// Start loading the seller home page code as soon as a finger / cursor touches the Grow button.
let growWarmed = false;
const warmGrow = () => {
    if (growWarmed) return;
    growWarmed = true;
    import("../pages/GrowEnquiriesPage.jsx").catch(() => { growWarmed = false; });
};

function formatShopName(slug) {
    if (!slug) return "";
    // Drop the numeric suffix added for slug uniqueness (e.g. "acme-traders-2").
    return slug
        .replace(/-\d+$/, "")
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

// True while any text field is focused (i.e. the mobile keyboard is up).
function useTypingActive() {
    const [active, setActive] = useState(false);
    useEffect(() => {
        const isField = (el) =>
            !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        const onIn = (e) => { if (isField(e.target)) setActive(true); };
        const onOut = () => setTimeout(() => { if (!isField(document.activeElement)) setActive(false); }, 50);
        document.addEventListener("focusin", onIn);
        document.addEventListener("focusout", onOut);
        return () => {
            document.removeEventListener("focusin", onIn);
            document.removeEventListener("focusout", onOut);
        };
    }, []);
    return active;
}

// Only the first mounted instance renders; any extra copy renders nothing.
const mountedIds = [];
const subscribers = new Set();
const notifyAll = () => subscribers.forEach((fn) => fn());
function useIsPrimaryInstance() {
    const id = useId();
    const [primary, setPrimary] = useState(false);
    useEffect(() => {
        mountedIds.push(id);
        const sync = () => setPrimary(mountedIds[0] === id);
        subscribers.add(sync);
        notifyAll();
        return () => {
            const i = mountedIds.indexOf(id);
            if (i >= 0) mountedIds.splice(i, 1);
            subscribers.delete(sync);
            notifyAll();
        };
    }, [id]);
    return primary;
}

const countLabel = (n) => (n > 99 ? "99+" : n);

// Dock badge: always in the DOM, absolutely positioned. It only fades/scales, so a count
// appearing or disappearing never adds or removes anything from the dock layout.
function DockBadge({ n }) {
    const last = useRef(n);
    if (n > 0) last.current = n; // keep the last number visible while it fades out
    return (
        <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-1 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#d2462b] px-1 text-[9px] font-bold text-white transition-[opacity,transform] duration-150 ${n > 0 ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
        >
            {countLabel(last.current)}
        </span>
    );
}

// One dock button = coloured circle + text label underneath.
function DockItem({
    label, active = false, current, theme, size = 44, ping = false, badge,
    onClick, ariaLabel, title, tabIndex, className = "", children, ...rest
}) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel || label}
            aria-current={(current ?? active) ? "page" : undefined}
            title={title || label}
            tabIndex={tabIndex}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={`bbm-item relative flex w-[72px] shrink-0 flex-col items-center gap-1 bg-transparent p-0 ${className}`}
            {...rest}
        >
            <span
                className={`${DOCK_BTN} bbm-ic transition-shadow duration-200`}
                style={{
                    width: size, height: size, background: theme.bg, color: theme.fg,
                    boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${theme.bg} 30%, transparent)` : "none",
                }}
            >
                {ping && (
                    <span aria-hidden className="bbm-dock-ping pointer-events-none absolute inset-0 rounded-full border-2" style={{ borderColor: theme.bg }} />
                )}
                {children}
                {badge !== undefined && <DockBadge n={badge} />}
            </span>

            <span
                className={`block max-w-full truncate text-[10.5px] leading-none tracking-wide transition-colors duration-150 ${active ? "font-black" : "font-bold"}`}
                style={{ color: active ? C.ink : C.muted }}
            >
                {label}
            </span>

            <span
                aria-hidden
                className={`absolute -bottom-[6px] h-[3px] w-[18px] rounded-full transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
                style={{ background: theme.bg }}
            />
        </motion.button>
    );
}

export default function BottomNavStrip({ onOpenRfq }) {
    const primary = useIsPrimaryInstance();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { token, effectiveLoggedIn, profile, signOut } = useAuth();
    const { notifications, markRead, markAllRead } = useNotifications();
    const { refresh: refreshActions } = useNotificationActions();

    const stopScrollPropagation = useCallback((e) => { e.stopPropagation(); }, []);
    const scrollProps = useMemo(() => ({
        "data-lenis-prevent": "",
        onWheel: stopScrollPropagation,
        onTouchStart: stopScrollPropagation,
        onTouchMove: stopScrollPropagation,
    }), [stopScrollPropagation]);

    const growBadges = useGrowBadges();

    // Everything except chat, newest first (stable order when the server sends no timestamps).
    const consoleNotifs = useMemo(
        () => (notifications || [])
            .filter((n) => !isChatNotification(n))
            .sort((a, b) => (Date.parse(stampOf(b)) || 0) - (Date.parse(stampOf(a)) || 0)),
        [notifications]
    );
    const unreadNotifCount = useMemo(() => consoleNotifs.filter((n) => !n.read).length, [consoleNotifs]);

    const inGrow = pathname === "/grow" || pathname.startsWith("/grow/");
    const inSave = pathname === "/save" || pathname.startsWith("/save/");
    const inLogin = pathname === "/login" || pathname.startsWith("/login/");
    const inModule = inGrow || inSave; // third slot is Home inside Grow / Save, Console everywhere else
    const activeKey = inGrow ? "grow" : inSave ? "save" : null;
    const fabBottom = FAB_BOTTOM_HOME;
    const shopName = profile?.shop_slug ? formatShopName(profile.shop_slug) : "BBM";
    const tileGap = 8;

    // Ready sellers go straight to their dashboard; everyone else goes to the Grow start page.
    const growTo = effectiveLoggedIn && isSellerReady(profile, token) ? "/grow/dashboard" : "/grow";

    // Always the same two tiles, in the same order: Grow, Save.
    const tiles = [TILES.grow, TILES.save].map((t, i) => ({
        ...t, to: t.key === "grow" ? growTo : t.to, slot: SLOT[i], badge: t.key === "grow" ? growBadges.total : 0,
    }));

    const [pageOpen, setPageOpen] = useState(false);
    const [everOpened, setEverOpened] = useState(false); // notifications list mounts on first open only
    const [tab, setTab] = useState("notifications"); // notifications | team
    const [teamOpened, setTeamOpened] = useState(false); // Team panel mounts on first visit only
    const typing = useTypingActive();

    // Measurements used to keep the Console button exactly where it was while the dock shrinks.
    const tilesInnerRef = useRef(null);
    const pillRef = useRef(null);
    const [tilesW, setTilesW] = useState(0);   // natural width of the tiles group
    const [pillH, setPillH] = useState(0);     // dock height while closed
    const [clipTiles, setClipTiles] = useState(false);

    useEffect(() => {
        const inner = tilesInnerRef.current;
        if (!inner) return undefined;
        const ro = new ResizeObserver(() => setTilesW(inner.offsetWidth));
        ro.observe(inner);
        setTilesW(inner.offsetWidth);
        return () => ro.disconnect();
    }, [primary]);

    useEffect(() => {
        if (!pageOpen && pillRef.current) setPillH(pillRef.current.offsetHeight);
    }, [pageOpen, primary, tiles.length, inModule]);

    useEffect(() => { if (pageOpen) { setClipTiles(true); setEverOpened(true); } }, [pageOpen]);

    // Opening the Console re-checks what still waits for a decision, so the buttons are never stale.
    useEffect(() => { if (pageOpen) refreshActions({ force: true }); }, [pageOpen, refreshActions]);

    // Close automatically on route change so it never lingers over the next page.
    useEffect(() => { setPageOpen(false); }, [pathname]);

    // Lock background scroll, close on Escape, and flag <body> while the Console is open.
    useEffect(() => {
        if (!primary) return undefined;
        document.body.dataset.bbmMenu = pageOpen ? "open" : "closed";
        if (!pageOpen) return () => { delete document.body.dataset.bbmMenu; };
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e) => { if (e.key === "Escape") setPageOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = original;
            document.removeEventListener("keydown", onKey);
            delete document.body.dataset.bbmMenu;
        };
    }, [pageOpen, primary]);

    // Console button badge = unread notifications only.
    const badgeTotal = unreadNotifCount;

    const openNotification = useCallback((n) => {
        if (!n.read) markRead(n.id);
        setPageOpen(false);
        const link = n.link;
        if (!link || link === "#") return;
        if (link.startsWith("/")) navigate(link);
        else window.location.assign(link);
    }, [markRead, navigate]);

    const showTab = (k) => { setTab(k); if (k === "team") setTeamOpened(true); };

    // A chat thread is open: /grow/chat/:id (hide the dock for an immersive view)
    const inChatThread = /^\/grow\/chat\/[^/]+/.test(pathname);
    const inSaveChatThread = /^\/save\/chat\/[^/]+/.test(pathname);
    const inSaveCart = /^\/save\/cart+/.test(pathname);

    const consoleButton = (
        <DockItem
            label={pageOpen ? "Close" : "Console"}
            theme={FAB_THEME.menu}
            size={SLOT[0].size}
            active={pageOpen}
            current={false}
            onClick={() => setPageOpen((v) => !v)}
            ariaLabel={badgeTotal > 0 ? `${pageOpen ? "Close" : "Open"} console, ${badgeTotal} unread` : `${pageOpen ? "Close" : "Open"} console`}
            aria-expanded={pageOpen}
            badge={pageOpen ? 0 : badgeTotal}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={pageOpen ? "x" : "console"}
                    initial={{ rotate: pageOpen ? -90 : 90, opacity: 0, scale: 0.6 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: pageOpen ? 90 : -90, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.08 }}
                    className="flex"
                >
                    {pageOpen ? <X size={SLOT[0].icon} strokeWidth={2.4} /> : <LayoutGrid size={SLOT[0].icon} strokeWidth={2.4} />}
                </motion.span>
            </AnimatePresence>
        </DockItem>
    );

    const homeButton = (
        <DockItem label="Home" theme={FAB_THEME.home} size={SLOT[0].size} onClick={() => navigate("/home")}>
            <HomeIcon size={SLOT[0].icon} />
        </DockItem>
    );

    const signInButton = (
        <DockItem label="Sign in" theme={FAB_THEME.login} size={SLOT[0].size} active={inLogin} onClick={() => navigate("/login")}>
            <LogIn size={SLOT[0].icon} strokeWidth={2.4} />
        </DockItem>
    );

    if (!primary || typeof document === "undefined") return null;

    return createPortal(
        <>
            <style>{DOCK_AURA_CSS + MENU_OPEN_CSS + HIDE_DOCK_CSS + SHEET_CSS}</style>

            {/* ===================== DOCK ===================== */}
            <div
                data-hidden={(inChatThread || inSaveChatThread || inSaveCart) ? "true" : undefined}
                className={`bbm-dock pointer-events-none fixed inset-x-0 flex justify-center transition-opacity duration-150 ${typing ? "opacity-0" : ""}`}
                style={{ zIndex: Z_DOCK, bottom: `calc(${fabBottom}px + env(safe-area-inset-bottom, 0px))` }}
            >
                {/* Slides sideways by half the removed width, so the Console button stays put.
                    Outer radius 22 = inner radius 20 + the 2px margin, so the comet ring hugs the corners. */}
                <motion.div
                    className={`${typing ? "pointer-events-none" : "pointer-events-auto"} relative isolate rounded-[22px]`}
                    initial={false}
                    animate={{ x: pageOpen ? (tilesW + tileGap) / 2 : 0 }}
                    transition={DOCK_COLLAPSE}
                >
                    {/* aura: blurred halo (22 + 4 inset = 26) */}
                    <span aria-hidden className={`pointer-events-none absolute -inset-[4px] -z-10 overflow-hidden rounded-[26px] blur-[8px] transition-opacity duration-300 ${pageOpen ? "opacity-0" : "opacity-70"}`}>
                        <span className="bbm-dock-spin absolute left-1/2 top-1/2 aspect-square w-[200%]" style={{ background: DOCK_CONIC }} />
                    </span>

                    {/* aura: comet ring */}
                    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[22px] transition-opacity duration-300 ${pageOpen ? "opacity-0" : "opacity-100"}`} style={{ background: DOCK_RING }}>
                        <span className="bbm-dock-spin absolute left-1/2 top-1/2 aspect-square w-[200%]" style={{ background: DOCK_CONIC }} />
                    </span>

                    {/* the dock body */}
                    <div
                        ref={pillRef}
                        className="relative m-[2px] flex items-end justify-center rounded-[20px] border-[1.5px] px-[20px] pb-[8px] pt-[4px] transition-[background-color,box-shadow] duration-200"
                        style={{
                            background: pageOpen ? "transparent" : "rgba(255,255,255,.92)",
                            borderColor: pageOpen ? "transparent" : "#DFE7EA",
                            boxShadow: pageOpen ? "none" : "0 18px 40px -12px rgba(8,34,43,.4)",
                            minHeight: pageOpen && pillH ? pillH : undefined,
                        }}
                    >
                        {/* Tiles group: collapses to 0 width (and 0 gap) while the Console is open */}
                        <motion.div
                            className="relative"
                            initial={false}
                            animate={{
                                width: pageOpen ? 0 : "auto",
                                marginRight: pageOpen ? 0 : tileGap,
                                opacity: pageOpen ? 0 : 1,
                            }}
                            transition={DOCK_COLLAPSE}
                            onAnimationComplete={() => { if (!pageOpen) setClipTiles(false); }}
                            style={{ overflow: clipTiles ? "hidden" : "visible" }}
                        >
                            <div ref={tilesInnerRef} className="relative flex w-max items-end" style={{ gap: tileGap }}>
                                {tiles.map(({ key, label, Icon, to, theme, slot, badge }) => (
                                    <DockItem
                                        key={key}
                                        label={label}
                                        theme={theme}
                                        size={slot.size}
                                        ping={!!slot.raised}
                                        badge={badge}
                                        active={activeKey === key}
                                        ariaLabel={badge > 0 ? `${label}, ${badge} unread` : label}
                                        tabIndex={pageOpen ? -1 : 0}
                                        onClick={() => navigate(to)}
                                        onPointerEnter={key === "grow" ? warmGrow : undefined}
                                        onTouchStart={key === "grow" ? warmGrow : undefined}
                                        className={`bbm-tile ${pageOpen ? "pointer-events-none" : ""}`}
                                    >
                                        <span className={`flex ${key === "grow" ? "bbm-dock-nudge" : ""}`}><Icon size={slot.icon} /></span>
                                    </DockItem>
                                ))}
                            </div>
                        </motion.div>

                        {/* Instant swap (no exit/enter animation): the key makes React replace the button at once */}
                        <Fragment key={inModule ? "home" : effectiveLoggedIn ? "console" : "login"}>
                            {inModule ? homeButton : effectiveLoggedIn ? consoleButton : signInButton}
                        </Fragment>
                    </div>
                </motion.div>
            </div>

            {/* ===================== BACKDROP (dims the whole page) ===================== */}
            <div
                aria-hidden="true"
                onClick={() => setPageOpen(false)}
                style={{ zIndex: Z_BACKDROP }}
                className={`fixed inset-0 bg-black/35 transition-opacity duration-300 md:bg-black/20 ${pageOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            />

            {/* ===================== CONSOLE SHEET ===================== */}
            <div
                className="bbm-sheet"
                data-open={String(pageOpen)}
                role="dialog"
                aria-label="Console"
                aria-hidden={!pageOpen}
            >
                {/* Grab handle (mobile) + title + actions.
                    Mobile: title, then Helpline + Sign out in a row under it.
                    Desktop: title and Sign out share one row, vertically centered. */}
                <div className="shrink-0 px-5 pt-2.5 md:px-7 md:pt-6">
                    <div className="mx-auto h-1 w-10 rounded-full md:hidden" style={{ background: C.hair }} />

                    <div className="mt-3 md:mt-0 md:flex md:items-center md:justify-between md:gap-4">
                        <div
                            role="heading" aria-level={2}
                            className="truncate text-[20px] font-extrabold leading-tight tracking-tight md:min-w-0 md:flex-1 md:text-[24px]"
                            style={{ color: C.ink }}
                        >
                            {shopName}
                        </div>

                        {effectiveLoggedIn && (
                            <div className="mt-3 flex gap-2 md:mt-0 md:shrink-0">
                                {/* Helpline: mobile only. HelpBulb keeps its own tap behaviour */}
                                <div
                                    className="flex flex-1 items-center gap-2 rounded-xl border px-2 py-1.5 md:hidden"
                                    style={{ borderColor: C.hair }}
                                >
                                    <span className={ICON_TILE} style={{ background: C.tile }}>
                                        <HelpBulb inline />
                                    </span>
                                    <span className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>Helpline</span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => { setPageOpen(false); signOut(); }}
                                    className="flex flex-1 items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors duration-150 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7285]/40 md:flex-none md:px-3 md:py-1.5 md:hover:bg-black/[0.04]"
                                    style={{ borderColor: C.hair }}
                                >
                                    <span className={`${ICON_TILE} md:h-7 md:w-7 md:rounded-lg`} style={{ background: C.tile }}>
                                        <LogOut className="h-4 w-4" style={{ color: C.ink }} />
                                    </span>
                                    <span className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>Sign out</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Notifications | Team */}
                    {effectiveLoggedIn && (
                        <div role="tablist" aria-label="Console sections" className="mt-3 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: C.tile }}>
                            {[["notifications", "Notifications"], ["team", "Team"]].map(([k, t]) => {
                                const on = tab === k;
                                return (
                                    <button
                                        key={k} type="button" role="tab" aria-selected={on} onClick={() => showTab(k)}
                                        className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7285]/40"
                                        style={on ? { background: "#fff", color: C.ink, boxShadow: "0 1px 3px rgba(20,27,34,.12)" } : { color: C.muted }}
                                    >
                                        {t}
                                        {k === "notifications" && unreadNotifCount > 0 && (
                                            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d2462b] px-1 text-[10px] font-bold text-white">
                                                {countLabel(unreadNotifCount)}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Body: notifications or team. --sheet-pb clears the floating dock on mobile. */}
                <div
                    className="flex min-h-0 flex-1 flex-col"
                    style={{ "--sheet-pb": `calc(${fabBottom + DOCK_HEIGHT + 12}px + env(safe-area-inset-bottom, 0px))` }}
                >
                    {everOpened && effectiveLoggedIn && tab === "notifications" && (
                        <NotificationTimeline
                            className="flex min-h-0 flex-1 flex-col"
                            items={consoleNotifs}
                            unreadCount={unreadNotifCount}
                            onOpen={openNotification}
                            onMarkAll={markAllRead}
                            scrollProps={scrollProps}
                        />
                    )}
                    {teamOpened && effectiveLoggedIn && tab === "team" && (
                        <TeamPanel token={token} active={pageOpen} scrollProps={scrollProps} />
                    )}
                </div>
            </div>
        </>,
        document.body
    );
}