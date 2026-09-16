// src/components/BottomSearchBar.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MarketplaceSearchBar from "./MarketplaceSearchBar_OLD.jsx";
import { performSearchNavigation } from "../utils/searchResolve.js";

export default function BottomSearchBar() {
    const [query, setQuery] = useState("");
    const [barTop, setBarTop] = useState(null);
    const barRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const reposition = () => {
            const barHeight = barRef.current?.offsetHeight || 0;
            const visibleBottom = vv.height + vv.offsetTop;
            setBarTop(visibleBottom - barHeight);
        };
        reposition();
        vv.addEventListener("resize", reposition);
        vv.addEventListener("scroll", reposition);
        window.addEventListener("orientationchange", reposition);
        return () => {
            vv.removeEventListener("resize", reposition);
            vv.removeEventListener("scroll", reposition);
            window.removeEventListener("orientationchange", reposition);
        };
    }, []);

    const handleSubmit = (trimmedQuery) => performSearchNavigation(navigate, trimmedQuery);

    const handleImageResolved = (result) => {
        navigate("/browse", { state: { imageResult: result } });
    };

    return (
        <div
            ref={barRef}
            className="fixed inset-x-0 z-50 md:hidden"
            style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.96) 35%, #ffffff 100%)",
                paddingTop: "14px",
                paddingBottom: "max(10px, env(safe-area-inset-bottom))",
                ...(barTop != null ? { top: `${barTop}px`, bottom: "auto" } : { bottom: 0 }),
            }}
        >
            <div className="px-3">
                <MarketplaceSearchBar
                    value={query}
                    onChange={setQuery}
                    onSubmit={handleSubmit}
                    onImageResolved={handleImageResolved}
                    suggestionsDirection="up"
                />
            </div>
        </div>
    );
}