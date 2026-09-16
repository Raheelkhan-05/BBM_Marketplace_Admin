// src/components/OnboardingGate.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Module-level, not a ref — survives any remount of this component,
// only resets on an actual full page reload (new JS execution). A
// component-local ref was getting reset if this component ever
// remounted, causing the redirect to keep re-firing on every
// navigation instead of just once per app load.
let hasChecked = false;

export default function OnboardingGate() {
    const { isLoggedIn, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (hasChecked) return;
        if (!isLoggedIn) { hasChecked = true; return; }
        if (profile === null) return; // still loading — wait for it, don't mark checked yet

        hasChecked = true;
        if (profile.onboarding_step !== "done" && location.pathname !== "/login") {
            navigate("/login", { replace: true });
        }
    }, [isLoggedIn, profile, location.pathname, navigate]);

    return null;
}