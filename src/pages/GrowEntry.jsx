// src/pages/GrowEntry.jsx
// Gate for /grow:
//  - ready sellers -> seller area
//  - start flow (?start=1 or enquiry return) -> GrowStartPage
//  - everyone else -> /grow/details (the full GROW page)
import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isSellerReady, markSeenGrow } from "../components/growSeller/growSeller.js";
import GrowCheckSkeleton from "../components/grow/GrowCheckSkeleton.jsx";
import { enquiryReturnTo } from "../components/grow/growReturn.js";
import GrowStartPage from "./GrowStartPage.jsx";

export default function GrowEntry() {
    const { token, isLoggedIn, profile, needsOnboarding, initializing } = useAuth();
    const [sp] = useSearchParams();
    const location = useLocation();

    // ?start=1 can arrive while this component is already mounted, so read it on every render.
    // It stays true once seen, because GrowStartPage strips the param right after mounting.
    const startParam = sp.get("start") === "1";
    const [sticky, setSticky] = useState(startParam);
    if (startParam && !sticky) setSticky(true);
    const adding = sticky || startParam;

    // Remount the flow on every fresh ?start=1 navigation (location.key changes per navigation).
    const [startKey, setStartKey] = useState(startParam ? location.key : null);
    if (startParam && startKey !== location.key) setStartKey(location.key);

    const [back] = useState(() => enquiryReturnTo(location.state?.from));

    const ready = !initializing && isLoggedIn && !needsOnboarding && isSellerReady(profile, token);

    useEffect(() => {
        if (!initializing && !ready) markSeenGrow(profile);
    }, [initializing, ready, profile]);

    if (initializing && !adding) return <div className="gs"><div className="app"><GrowCheckSkeleton /></div></div>;
    if (ready && !adding) return <Navigate to={back || "/grow/dashboard"} replace />;
    if (adding || back) return <GrowStartPage key={startKey ?? "flow"} />;
    return <Navigate to="/grow/details" replace />;
}