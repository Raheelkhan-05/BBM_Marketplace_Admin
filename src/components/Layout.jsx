// src/components/Layout.jsx
//
// NOTE: NotificationsProvider, CartProvider, ChatProvider, ListingsProvider,
// HelpRequestProvider and TransportLibraryProvider are provided ONCE by AppShell
// (App.jsx wraps <Layout /> inside <AppShell />). Do not re-wrap them here, or every
// page under Layout gets its own copy of state and socket listeners, and the
// BottomNavStrip (which lives in AppShell) reads a different copy than the pages.
//
// The lightbox visibility context also lives in AppShell now (so Grow / Save / Sales pages can use
// ImageLightbox too). It is re-exported below so existing imports from "./Layout.jsx" keep working.
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import { BuyerAddressProvider } from "../context/BuyerAddressContext.jsx";
import { OrderResumeProvider } from "../context/OrderResumeContext.jsx";
import { useLightboxVisibility } from "../context/LightboxVisibilityContext.jsx";
import OrderNotificationToast from "./OrderNotificationToast.jsx";
import ChatNotificationToast from "./ChatNotificationToast.jsx";
import CreditNotificationToast from "./CreditNotificationToast.jsx";
import TransportResolutionBanner from "./TransportResolutionBanner.jsx";
import GlobalBuyNowLauncher from "./GlobalBuyNowLauncher.jsx";
import HelpBulb from "./HelpBulb.jsx";

export { useLightboxVisibility };

export default function Layout() {
  const { pathname } = useLocation();
  const isAdminPage = pathname.startsWith("/admin");
  const isWalletPage = pathname.startsWith("/seller/wallet");
  const isChatDetailPage = /^\/chat\/[^/]+/.test(pathname);
  const isOrdersPage = pathname.startsWith("/orders/");
  const isSalesOrdersPage = pathname.startsWith("/seller/orders/");

  const { lightboxOpen } = useLightboxVisibility();
  const [rfqOpen, setRfqOpen] = useState(false);

  // Same rule AppShell uses to decide whether the bottom dock is shown.
  const showBottomNav = !isAdminPage && !isWalletPage && !isChatDetailPage
    && !isSalesOrdersPage && !isOrdersPage && !lightboxOpen;

  return (
    <BuyerAddressProvider>
      <OrderResumeProvider>
        <div className="relative min-h-screen bg-[#FFFFFF] overflow-x-clip">
          <div className="relative z-1">
            <Header onOpenRfq={() => setRfqOpen(true)} />

            <main className={showBottomNav ? "pb-10 md:pb-0" : ""}>
              <Outlet />
            </main>

            <div className="hidden md:block">
              <Footer />
            </div>
          </div>

          {/* Desktop only: mobile's helpline lives inside the BottomNavStrip menu. */}
          <div className="hidden md:block">
            <HelpBulb />
          </div>

          {/* Toasts portal to document.body; they only need to be inside the
              providers (from AppShell) and the Router. */}
          <CreditNotificationToast />
          <OrderNotificationToast />
          <ChatNotificationToast />
          <TransportResolutionBanner />
          <GlobalBuyNowLauncher />
        </div>
      </OrderResumeProvider>
    </BuyerAddressProvider>
  );
}