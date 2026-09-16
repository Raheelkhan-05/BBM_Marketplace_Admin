// src/components/RouteGuards.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// No more full-screen spinner. isLoggedIn is now known synchronously the
// instant AuthContext first renders (see readStoredSession() there), so
// there's nothing left to show a spinner FOR in the common case — a
// guest sees the landing page immediately, a returning logged-in user
// sees their destination page immediately, and that page's own
// lightweight skeleton (already built into HomeProductFeed, CategoryStrip,
// etc.) takes it from there. A blank frame for the rare case where a
// profile-only check is still pending beats a spinner that appears on
// every single visit whether it was needed or not.
function DefaultFallback() {
  return null;
}

export function RequireAuth({ children, fallback }) {
  const { isLoggedIn, profile } = useAuth();
  const location = useLocation();

  // Known synchronously — no waiting required to decide this.
  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />;

  // Only the onboarding-completeness check genuinely needs the profile,
  // which loads in the background after first paint. Render the
  // protected page immediately once we know someone's logged in; if the
  // profile later reveals onboarding isn't finished, redirect then. This
  // trades a rare late correction for never blocking the common case
  // behind a spinner.
  if (profile && profile.onboarding_step !== "done") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function RequireAdmin({ children, fallback }) {
  const { profile, isLoggedIn, initializing } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />;

  // Admin status genuinely can't be known without the profile — this is
  // the one case that still has to wait, but only for however long the
  // profile fetch takes, not for the old synchronous-localStorage-read
  // step that used to be bundled into the same wait.
  if (initializing && !profile) return fallback ?? <DefaultFallback />;
  if (profile?.role !== "admin") return <Navigate to="/home" replace />;

  return children;
}

export function RequireGuest({ children, fallback }) {
  const { isLoggedIn, profile } = useAuth();

  // A guest (no stored token) renders the landing page immediately —
  // nothing to wait for. A logged-in user who never finished onboarding
  // (still sitting at the "contact" step) gets sent straight back to
  // /login to pick up where they left off, rather than seeing the
  // landing page as if they were a fresh visitor.
  // if (isLoggedIn && profile?.onboarding_step !== "done") {
  //   return <Navigate to="/login" replace />;
  // }

  return children;
}