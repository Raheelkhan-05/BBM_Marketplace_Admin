// src/components/save/SaveLayout.jsx
// Shell for the buyer area: /save (dashboard), /save/orders, /save/orders/:id, /save/cart.
// Header (logo, cart) + sticky section tabs stay mounted; only the <Outlet /> content changes.
// Visitors who are not logged in only get the public brochure at /save (rendered by SaveEntry, without the shell);
// any deeper /save/... URL sends them back to /save.
//
// Styling: save.css defines the `.sv` wrapper and ALL the variables the `sh-` pages use (--s, --line, --f ...),
// and also the `.hd` / `.wrap` header styles used below. It MUST be loaded here, because this layout replaces the
// parent element that used to import it.   >>> Adjust the import path if save.css lives somewhere else. <<<
import { Suspense, useEffect } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import SmartLink from "../SmartLink.jsx";
import SaveTabs from "./SaveTabs.jsx";
import { goTo } from "../grow/scrollTo.js";
import { MENU_ROUTES } from "../menuItems.js";
import useSaveBadges from "./useSaveBadges.js";
import "./save.css";
import "./save-home.css";
import "./save-tabs.css";

const getLenis = () => (typeof window !== "undefined" ? window.lenis || window.__lenis || null : null);
const toTop = () => {
    try { const l = getLenis(); if (l?.scrollTo) { l.scrollTo(0, { immediate: true }); return; } } catch { /* ignore */ }
    window.scrollTo(0, 0);
};

function Skeleton() {
    return (
        <div className="sh-w" aria-busy="true">
            <div className="sh-sk line" style={{ marginTop: 28, width: "55%" }} />
            <div className="sh-sk" style={{ marginTop: 18 }} />
            <div className="sh-sk" style={{ marginTop: 14 }} />
        </div>
    );
}

// Same header for buyers and visitors. SaveTabs (logged-in only) finds it as its sibling.
function SaveHeader() {
    return (
        <header className="hd">
            <div className="wrap">
                <SmartLink
                    to="/"
                    aria-label="BBM home"
                    style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, textDecoration: "none", color: "#08222B" }}
                >
                    <span style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "#FFFFFF", padding: "4px 0px" }}>
                        <img src="/Logo.png" alt="BBM" style={{ display: "block", height: "28px", width: "auto", objectFit: "contain" }} />
                    </span>
                    <span
                        style={{
                            fontFamily: '"Bricolage Grotesque", "Figtree", system-ui, sans-serif',
                            fontWeight: 800, fontSize: "1.125rem", lineHeight: 1, letterSpacing: "0.02em", whiteSpace: "nowrap",
                        }}
                    >
                        BBM
                    </span>
                </SmartLink>
            </div>
        </header>
    );
}

// Section links match the topic ids rendered in SavePage (save-find, save-info, ...).
const PUBLIC_NAV = [
    ["Find", "save-find"],
    ["Info", "save-info"],
    ["Price", "save-price"],
    ["Delivery", "save-delivery"],
    ["Orders", "save-orders"],
    ["Credit", "save-credit"],
    ["Repeat", "save-repeat"],
];

// Header for logged-out visitors on the /save brochure: logo + section nav + CTA (same layout as GROW details).
function SavePublicHeader() {
    return (
        <header className="hd hd-pub">
            <div className="wrap">
                <a
                    href="#save-top"
                    onClick={goTo("save-top")}
                    aria-label="BBM home"
                    style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, textDecoration: "none", color: "#08222B" }}
                >
                    <span style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "#FFFFFF", padding: "4px 0px" }}>
                        <img src="/Logo.png" alt="BBM" style={{ display: "block", height: "28px", width: "auto", objectFit: "contain" }} />
                    </span>
                    <span
                        style={{
                            fontFamily: '"Bricolage Grotesque", "Figtree", system-ui, sans-serif',
                            fontWeight: 800, fontSize: "1.125rem", lineHeight: 1, letterSpacing: "0.02em", whiteSpace: "nowrap",
                        }}
                    >
                        BBM
                    </span>
                </a>

                <nav aria-label="Page sections">
                    {PUBLIC_NAV.map(([label, id]) => (
                        <a key={id} href={`#${id}`} onClick={goTo(id)}>{label}</a>
                    ))}
                </nav>

                <Link className="btn" to={MENU_ROUTES.home}>Start buying</Link>
            </div>
        </header>
    );
}

// Everything that needs the shell lives here so hooks are only mounted for logged-in buyers.
function Shell() {
    const { pathname } = useLocation();
    const { cart } = useSaveBadges();

    // New section -> start at the top (list <-> detail inside a section keeps its own behaviour).
    const section = pathname.split("/").slice(0, 3).join("/");
    useEffect(() => { toTop(); }, [section]);

    return (
        <div className="sv svl pb-20">
            {/* `.hd` + `.wrap` come from save.css; SaveTabs finds this header as its sibling to pin itself under it. */}
            <SaveHeader />

            <SaveTabs />

            <main>
                <Suspense fallback={<Skeleton />}>
                    <Outlet />
                </Suspense>
            </main>
        </div>
    );
}

export default function SaveLayout() {
    const { isLoggedIn, initializing } = useAuth();
    const { pathname } = useLocation();

    if (initializing) return <div className="sv"><Skeleton /></div>;

    if (!isLoggedIn) {
        if (pathname.replace(/\/+$/, "") === "/save") {
            return (
                <div className="sv svl svl-pub pb-20" id="save-top">
                    <SavePublicHeader />
                    <main>
                        <Outlet />
                    </main>
                </div>
            );
        }
        return <Navigate to="/save" replace />;
    }
    return <Shell />;
}