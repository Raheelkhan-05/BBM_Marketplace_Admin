// src/components/Layout.jsx
import { createContext, useContext, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import BottomNavStrip from "./BottomNavStrip.jsx";
import BackgroundAmbience from "./landing/BackgroundAmbience.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { NotificationsProvider } from "../context/NotificationsContext.jsx";
import { TransportLibraryProvider } from "../context/TransportLibraryContext.jsx";
import OrderNotificationToast from "./OrderNotificationToast.jsx";
import ChatNotificationToast from "./ChatNotificationToast.jsx";
import { CartProvider } from "../context/CartContext.jsx";
import { ChatProvider } from "../context/ChatContext.jsx";
import { ListingsProvider } from "../context/ListingsContext.jsx";
import { HelpRequestProvider } from "../context/HelpRequestContext.jsx";
import HelpBulb from "./HelpBulb.jsx";

const LightboxVisibilityContext = createContext(null);

export function useLightboxVisibility() {
  const ctx = useContext(LightboxVisibilityContext);
  if (!ctx) throw new Error("useLightboxVisibility must be used inside <Layout>");
  return ctx;
}

export default function Layout() {
  const { pathname } = useLocation();
  const { isLoggedIn, profile } = useAuth();
  const isLandingPage = pathname === "/";
  const isAdminPage = pathname.startsWith("/admin");
  const isWalletPage = pathname.startsWith("/seller/wallet");
  const isChatDetailPage = /^\/chat\/[^/]+/.test(pathname);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);

  // Display-only now — no redirect here. An unfinished signup can freely
  // browse / and /home (via the back button off /login), just without the
  // bottom nav, same as the header shows them as a guest (see Header.jsx's
  // effectiveLoggedIn). The one-time redirect on initial app load lives in
  // OnboardingGate (App.jsx) instead.
  const onboardingIncomplete = isLoggedIn && profile && profile.onboarding_step !== "done";

  const showBottomNav = !isLandingPage && !isAdminPage && !isWalletPage && !isChatDetailPage && !lightboxOpen && !onboardingIncomplete;

  return (
    <NotificationsProvider>
      <TransportLibraryProvider>
        <CartProvider>
          <ChatProvider>
            <ListingsProvider>
              <HelpRequestProvider>

                <LightboxVisibilityContext.Provider value={{ lightboxOpen, setLightboxOpen }}>
                  <div className="relative min-h-screen bg-[#FCFBF9] overflow-x-clip">
                    <div className="relative z-1">
                      <Header onOpenRfq={() => setRfqOpen(true)} />

                      <main className={showBottomNav ? "pb-10 md:pb-0" : ""}>
                        <Outlet />
                      </main>

                      <div className="hidden md:block">
                        <Footer />
                      </div>

                      {showBottomNav && <BottomNavStrip onOpenRfq={() => setRfqOpen(true)} />}
                    </div>

                    {/* Center-screen popup for order (purchase + sales) notifications.
                Portals to document.body, so placement in the tree doesn't
                matter — it just needs to be inside NotificationsProvider and
                inside the Router (it uses useNavigate). */}
                    <HelpBulb />
                    <OrderNotificationToast />
                    <ChatNotificationToast />
                  </div>
                </LightboxVisibilityContext.Provider>
              </HelpRequestProvider>
            </ListingsProvider>

          </ChatProvider>
        </CartProvider>
      </TransportLibraryProvider>
    </NotificationsProvider>
  );
}