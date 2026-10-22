import { Outlet } from "react-router-dom";

// Notifications, Cart, Chat, Listings, HelpRequest and TransportLibrary providers
// come from AppShell, which wraps every route. Re-wrapping them here would create a
// second copy of their state and socket listeners for the /grow/* tree, so the
// bottom dock (in AppShell) and the Grow pages/tabs would read different data.
// Keep this as a pass-through (or add Grow-only providers here, never these).
export default function GrowProviders() {
    return <Outlet />;
}