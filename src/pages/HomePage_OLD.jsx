// src/pages/HomePage.jsx
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import MarketplaceSearchBar from "../components/MarketplaceSearchBar_OLD.jsx";

import HomePageSkeleton from "../components/skeletons/HomePageSkeleton.jsx";
import StartSellingBanner from "../components/home/StartSellingBanner.jsx";
import Hero16by9Banner from "../components/home/Hero16by9Banner.jsx";
import QuickActionsJustBelowBanner from "../components/home/QuickActionsJustBelowBanner.jsx";
import SellerQuickManageListings from "../components/home/SellerQuickManageListings.jsx";
import TrustStripLogos from "../components/home/TrustStripLogos.jsx";
import CategoryIconExplorer from "../components/home/CategoryIconExplorer.jsx";
import WelcomeBanner from "../components/home/WelcomeBanner.jsx";
import { SmoothScrollProvider } from "../providers/SmoothScrollProvider.jsx";
import { performSearchNavigation } from "../utils/searchResolve.js";

const HomeProductShelves = lazy(() => import("../components/home/HomeProductShelves.jsx"));

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [isRfqOpen, setIsRfqOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) return <HomePageSkeleton />;

  return (
    <div className="min-h-screen bg-[#FCFBF9] text-slate-900 antialiased overflow-x-hidden" style={{ fontFamily: FONT_BODY }}>
      <SmoothScrollProvider>
        <main className="mx-auto max-w-[1400px] px-2.5 sm:px-4 lg:px-6 pb-5 sm:pb-20 pt-3 space-y-6">

          <Hero16by9Banner onOpenRfq={() => setIsRfqOpen(true)} />

          <span className="hidden md:block">
            <AmazonSearchHeader onOpenRfq={() => setIsRfqOpen(true)} />
          </span>

          <WelcomeBanner />

          <QuickActionsJustBelowBanner onOpenRfq={() => setIsRfqOpen(true)} />

          <SellerQuickManageListings />

          <TrustStripLogos />

          <CategoryIconExplorer />

          {/* Blinkit/Amazon-style infinite product feed — code-split
              since it's the most network-active section and shouldn't
              delay the rest of Home's first paint. */}
          <Suspense fallback={<HomeFeedFallback />}>
            <HomeProductShelves />
          </Suspense>

          <StartSellingBanner />
        </main>
      </SmoothScrollProvider>
    </div>
  );
}

function HomeFeedFallback() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-48 animate-pulse rounded-full bg-slate-200" />
      <div className="h-[220px] w-full animate-pulse rounded-[20px] bg-slate-200" />
    </div>
  );
}

function AmazonSearchHeader() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const handleSubmit = (trimmedQuery) => performSearchNavigation(navigate, trimmedQuery);
  const handleImageResolved = (result) => navigate("/browse", { state: { imageResult: result } });

  return (
    <MarketplaceSearchBar
      value={query}
      onChange={setQuery}
      onSubmit={handleSubmit}
      onImageResolved={handleImageResolved}
    />
  );
}