// src/pages/HomePage.jsx
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import ShopBanner from "../components/home/ShopBanner.jsx";
import MarketplaceSearchBar from "../components/MarketplaceSearchBar";
import CategoryStrip from "../components/home/CategoryStrip.jsx";
import HomeProductFeed from "../components/home/HomeProductFeed.jsx";
import PromoHero from "../components/home/PromoHero.jsx";
import FloatingSellButton from "../components/FloatingSellButton.jsx";
import { SmoothScrollProvider } from "../providers/SmoothScrollProvider";
import { useAuth } from "../context/AuthContext.jsx";

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";

// Promo banner dismissal lasts for the browser session (reappears on a fresh visit).
const PROMO_KEY = "bbm_promo_hero_dismissed_v1";
const PROMO_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour

const readPromoDismissed = () => {
    try {
        const t = Number(localStorage.getItem(PROMO_KEY));
        return t > 0 && Date.now() - t < PROMO_TTL_MS;
    } catch { return false; }
};
const writePromoDismissed = () => {
    try { localStorage.setItem(PROMO_KEY, String(Date.now())); } catch { /* private mode */ }
};

export default function HomePage() {
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { effectiveLoggedIn, needsOnboarding } = useAuth();

    const [searchParams, setSearchParams] = useSearchParams();
    const { brandName: brandParam, shopSlug: shopParam } = useParams();

    const shopSlug = shopParam || searchParams.get("shop")?.trim() || null;
    const brandName = brandParam || searchParams.get("brand")?.trim() || null;
    const viaSellers = !!shopParam || searchParams.get("via") === "sellers";

    const clearShop = () => {
        if (shopParam) { navigate("/home"); return; }
        const next = new URLSearchParams(searchParams);
        next.delete("shop");
        setSearchParams(next, { replace: true });
    };

    const [shopName, setShopName] = useState(null);
    useEffect(() => { if (!shopSlug) setShopName(null); }, [shopSlug]);

    // Promo banner: logged-out visitors only, until dismissed.
    const [promoDismissed, setPromoDismissed] = useState(readPromoDismissed);
    const showPromo = !effectiveLoggedIn && !promoDismissed;
    const dismissPromo = () => { setPromoDismissed(true); writePromoDismissed(); };
    const goSignIn = () =>
        navigate("/login", { state: { from: `${location.pathname}${location.search}${location.hash || ""}` } });
    const goSell = () => navigate("/grow");

    const handleSuggestionSelect = (s) => {
        if (s.level === "brandFamily") {
            navigate(`/brand-family/${encodeURIComponent(s.name)}`);
            return;
        }
        setQuery(s.name);
    };

    const handleSubmit = (trimmedQuery) => setQuery(trimmedQuery);
    const handleImageResolved = (result) => navigate("/browse", { state: { imageResult: result } });

    const toolbar = (
        <>
            <MarketplaceSearchBar
                value={query}
                onChange={setQuery}
                onSubmit={handleSubmit}
                onImageResolved={handleImageResolved}
                showMediaButtons={false}
                onSuggestionSelect={handleSuggestionSelect}
                placeholder={shopName ? `Search in ${shopName}…` : undefined}
                clearOnSubmit={false}
                suggestionsDirection="down"
            />
            <CategoryStrip activeCategoryId={activeCategory?.id} onSelect={setActiveCategory} />
        </>
    );

    return (
        // overflow-x-clip (NOT hidden): overflow-x-hidden breaks `position: sticky` inside.
        <div className="min-h-screen bg-[#FFFFFF] pt-3 text-slate-900 antialiased overflow-x-clip" style={{ fontFamily: FONT_BODY }}>
            <h1 className="sr-only">
                {brandName ? `${brandName} products` : shopSlug ? "Seller store" : "BBM – Wholesale marketplace for verified sellers"}
            </h1>
            <SmoothScrollProvider>
                <main className="mx-auto max-w-7xl px-2.5 sm:mt-2 sm:px-4 lg:px-6 pb-28 md:pb-20">

                    {shopSlug && !viaSellers && <ShopBanner shopSlug={shopSlug} onClear={clearShop} onLoaded={setShopName} />}

                    <AnimatePresence initial={false}>
                        {showPromo && (
                            <PromoHero
                                key="promo-hero"
                                needsOnboarding={needsOnboarding}
                                onSignIn={goSignIn}
                                onSell={goSell}
                                onDismiss={dismissPromo}
                            />
                        )}
                    </AnimatePresence>

                    <HomeProductFeed
                        category={activeCategory}
                        q={query}
                        shopSlug={shopSlug}
                        brandName={brandName}
                        toolbar={toolbar}
                        viaSellers={viaSellers}
                    />
                </main>
            </SmoothScrollProvider>

            <FloatingSellButton to="/seller/sell" label="Sell" />
        </div>
    );
}