// src/pages/HomePage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MarketplaceSearchBar from "../components/MarketplaceSearchBar";
import CategoryStrip from "../components/home/CategoryStrip.jsx";
import HomeProductFeed from "../components/home/HomeProductFeed.jsx";
import FloatingSellButton from "../components/FloatingSellButton.jsx";
import { SmoothScrollProvider } from "../providers/SmoothScrollProvider";

const FONT_BODY = "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Public Sans', Roboto, sans-serif";

export default function HomePage() {
    const [isRfqOpen, setIsRfqOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState(null);
    const navigate = useNavigate();

    const handleSuggestionSelect = (s) => {
        if (s.level === "brandFamily") {
            navigate(`/brand-family/${encodeURIComponent(s.name)}`);
            return;
        }
        setQuery(s.name);
    };

    // Typing already filters the feed live via `q`. Submitting (Enter or
    // the search button) no longer navigates anywhere — it just confirms
    // the current text; MarketplaceSearchBar closes its own suggestions.
    const handleSubmit = (trimmedQuery) => setQuery(trimmedQuery);

    const handleImageResolved = (result) => navigate("/browse", { state: { imageResult: result } });

    return (
        <div className="min-h-screen bg-[#FCFBF9] text-slate-900 antialiased overflow-x-hidden" style={{ fontFamily: FONT_BODY }}>
            <SmoothScrollProvider>
                <main className="mx-auto max-w-7xl px-2.5 mt-2 sm:px-4 lg:px-6 pb-5 sm:pb-20 pt-3 space-y-4">

                    <MarketplaceSearchBar
                        value={query}
                        onChange={setQuery}
                        onSubmit={handleSubmit}
                        onImageResolved={handleImageResolved}
                        showMediaButtons={false}
                        onSuggestionSelect={handleSuggestionSelect}
                        clearOnSubmit={false}
                    />

                    <CategoryStrip activeCategoryId={activeCategory?.id} onSelect={setActiveCategory} />

                    <HomeProductFeed category={activeCategory} q={query} />
                </main>
            </SmoothScrollProvider>

            <FloatingSellButton to="/seller/sell" label="Sell" />
        </div>
    );
}