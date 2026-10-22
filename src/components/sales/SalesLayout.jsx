import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { toTitleCase } from "../growSeller/sellerHelpers.js";
import SalesTabs from "./SalesTabs.jsx";
import "../growSeller/grow-modules.css";
import "./sales.css";

export default function SalesLayout() {
    const { isLoggedIn, profile, initializing, signOut, refreshProfile } = useAuth();
    const { pathname } = useLocation();
    const [toast, setToast] = useState("");
    const [menu, setMenu] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);
    const tt = useRef(null);
    const menuRef = useRef(null);
    const say = useCallback((m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 2600); }, []);
    useEffect(() => () => clearTimeout(tt.current), []);

    const logoUrl = profile?.businessProfile?.logo_url || "";
    useEffect(() => { setLogoFailed(false); }, [logoUrl]);

    // Close the profile menu on page change.
    useEffect(() => { setMenu(false); }, [pathname]);

    // Outside tap / Esc closes the profile menu.
    useEffect(() => {
        if (!menu) return undefined;
        const down = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
        const key = (e) => { if (e.key === "Escape") setMenu(false); };
        document.addEventListener("pointerdown", down);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
    }, [menu]);

    if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: pathname }} />;
    if (!profile) {
        return initializing
            ? <div className="gk gs" aria-busy="true"><div className="gs-main"><div className="gk-skel" style={{ height: 120, marginTop: 24 }} /></div></div>
            : (
                <div className="gk gs"><div className="gs-main" style={{ paddingTop: 48, textAlign: "center" }}>
                    <p style={{ fontWeight: 800 }}>Couldn't load your workspace.</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
                        <button type="button" className="gk-btn go" onClick={() => refreshProfile()}>Try again</button>
                        <button type="button" className="gk-btn" onClick={signOut}>Sign out</button>
                    </div>
                </div></div>
            );
    }
    if (profile.team?.role !== "salesperson") return <Navigate to="/home" replace />;

    const bp = profile.businessProfile;
    const company = toTitleCase(bp?.display_name || bp?.trade_name || bp?.legal_name || "Your company");
    const me = (profile.team.actor?.name || "").trim();
    const initial = (company || "C").charAt(0).toUpperCase();
    const showLogo = !!logoUrl && !logoFailed;

    const mark = (cls) => (
        <span className={`gs-mark ${cls}${showLogo ? "" : " ini"}`} aria-hidden="true">
            {showLogo
                ? <img src={logoUrl} alt="" onError={() => setLogoFailed(true)} />
                : initial}
        </span>
    );

    return (
        <div className="gk gs">
            <header className="gs-hd">
                <div className="gs-hd-in">
                    <div className="gs-brand">
                        <img src="/Logo.png" alt="" />
                        <div className="gs-co"><b>BBM</b><small>Sales</small></div>
                    </div>

                    <div className="gs-menu" ref={menuRef}>
                        <button
                            type="button"
                            className="gs-prof"
                            aria-label="Open profile menu"
                            aria-haspopup="menu"
                            aria-expanded={menu}
                            onClick={() => setMenu((v) => !v)}
                        >
                            {mark("sm")}
                        </button>

                        {menu && (
                            <div className="gs-pop" role="menu">
                                <div className="gs-pop-top">
                                    {mark("lg")}
                                    <div className="gs-pop-who">
                                        <b>{me || "Salesperson"}</b>
                                        <small>{company}</small>
                                    </div>
                                </div>
                                <button type="button" role="menuitem" className="gs-out" onClick={() => { setMenu(false); signOut(); }}>
                                    <LogOut size={16} aria-hidden="true" />Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Same component behaviour as GrowTabs; finds .gs-hd above as its sibling to pin itself under it. */}
            <SalesTabs />

            <main className="gs-main">
                <Suspense fallback={<div className="gk-skel" style={{ height: 140, marginTop: 24 }} aria-busy="true" />}>
                    <Outlet context={{ say, company }} />
                </Suspense>
            </main>
            <div className={`gs-toast${toast ? " on" : ""}`} role="status">{toast}</div>
        </div>
    );
}