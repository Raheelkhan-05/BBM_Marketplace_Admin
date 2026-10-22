import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Reachable regardless of onboarding status.
const ALLOWED_PATHS = ["/login", "/terms", "/privacy-policy"];

export default function OnboardingGate() {
    const { needsOnboarding, initializing } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (initializing) return;       // profile still loading — don't guess
        if (!needsOnboarding) return;

        // Allow login, legal pages, and the grow/onboarding flow.
        if (
            ALLOWED_PATHS.includes(pathname) ||
            pathname === "/grow" ||
            pathname.startsWith("/grow/")
        ) {
            return;
        }

        navigate("/login", {
            replace: true,
            state: { from: pathname },
        });
    }, [needsOnboarding, initializing, pathname, navigate]);

    return null;
}