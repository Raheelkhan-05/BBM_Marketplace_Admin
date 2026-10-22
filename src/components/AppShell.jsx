import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import { CartProvider } from "../context/CartContext.jsx";
import { ChatProvider } from "../context/ChatContext.jsx";
import { ListingsProvider } from "../context/ListingsContext.jsx";
import { HelpRequestProvider } from "../context/HelpRequestContext.jsx";
import { TransportLibraryProvider } from "../context/TransportLibraryContext.jsx";
// NEW: must sit inside NotificationsProvider and TransportLibraryProvider, and wrap both the pages
// (Outlet) and the Console (BottomNavStrip) so they share the same live "waiting for decision" state.
import { NotificationActionsProvider } from "../context/NotificationActionsContext.jsx";
import { LightboxVisibilityContext } from "../context/LightboxVisibilityContext.jsx";
// import BottomNavStrip from "./BottomNavStrip.jsx";
import { useAuth } from "../context/AuthContext.jsx";


const HIDE = [/^\/admin/, /^\/seller\/wallet/, /^\/grow\/bulk/, /^\/chat\/[^/]+/, /^\/orders\//, /^\/seller\/orders\//, /^\/login/, /^\/terms/, /^\/privacy-policy/, /^\/payment\/return/, /^\/sales(\/|$)/];

export default function AppShell() {
    const { pathname } = useLocation();
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const lightboxValue = useMemo(() => ({ lightboxOpen, setLightboxOpen }), [lightboxOpen]);

    // Keep the page width the same whether or not a scrollbar is needed, so content never shifts
    // sideways when switching pages (or when the menu locks scrolling).
    useEffect(() => {
        const el = document.documentElement;
        const prev = el.style.scrollbarGutter;
        el.style.scrollbarGutter = "stable";
        return () => { el.style.scrollbarGutter = prev; };
    }, []);

    // The dock is hidden on these pages, and while an image is open full screen.
    // const show = !HIDE.some((r) => r.test(pathname)) && !lightboxOpen;

    const { profile } = useAuth();
    const isSales = profile?.team?.role === "salesperson";
    // const salesExempt = /^\/(login|terms|privacy-policy)(\/|$)/.test(pathname);
    const salesExempt = /^\/(login|terms|privacy-policy|sales|payment\/return)(\/|$)/.test(pathname);
    if (isSales && !salesExempt) return <Navigate to="/sales/dashboard" replace />;

    return (
        <NotificationsProvider><CartProvider><ChatProvider><ListingsProvider><HelpRequestProvider><TransportLibraryProvider>
            <NotificationActionsProvider>
                <LightboxVisibilityContext.Provider value={lightboxValue}>
                    <Outlet />
                    {/* {show && <BottomNavStrip />} */}
                </LightboxVisibilityContext.Provider>
            </NotificationActionsProvider>
        </TransportLibraryProvider ></HelpRequestProvider></ListingsProvider></ChatProvider></CartProvider></NotificationsProvider>
    );
}