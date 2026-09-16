import {
    Home,
    LayoutGrid,
    ShoppingBag,
    Store,
    FileText,
    Package,
    MessageCircle,
    ListChecks,
    PackagePlus,
    ShoppingCart,
    ChartNoAxesCombined,
    Wallet,
    Truck,
} from "lucide-react";

// ordersBadgeCount: total unread order notifications (purchase + sales
// combined) — see NotificationsContext's `orderUnreadCount`. Rendered by
// Header.jsx (desktop) and BottomNavStrip.jsx (mobile) as a small badge
// on the "My Orders" pill. Clamped to "9+" the same way the bell's badge
// is, for consistency.
//
// transportBadgeCount: count of the SELLER's pending transport proposals
// awaiting approve/reject — see TransportLibraryContext. Unlike the other
// badges here, this isn't a "you haven't seen this" count; it's a "this
// still needs your action" count, so it only clears once the seller
// actually resolves the proposal, not just once they've viewed it. Callers
// should only pass a non-zero value for approved sellers.

export function NAV_ITEMS({ isLoggedIn, isApprovedSeller, onOpenRfq, navigate, ordersBadgeCount = 0, cartBadgeCount = 0, chatBadgeCount = 0, productsBadgeCount = 0, transportBadgeCount = 0 }) {
    return [
        isLoggedIn ? {
            id: "home",
            label: "Home",
            icon: Home,
            to: "/home",
            onClick: () => navigate("/home"),
            match: (p) => p === "/home",
        } : null,
        isLoggedIn ? {
            id: "myproducts",
            label: "My Products",
            icon: Package,
            to: "/seller/listings",
            badge: productsBadgeCount > 0 ? (productsBadgeCount > 9 ? "9+" : productsBadgeCount) : null,
            onClick: () => navigate("/seller/listings"),
            match: (p) => p === "/seller/listings",
        } : null,
        isLoggedIn ? {
            id: "chat",
            label: "Chat",
            icon: MessageCircle,
            to: "/chat",
            badge: chatBadgeCount > 0 ? (chatBadgeCount > 9 ? "9+" : chatBadgeCount) : null,
            onClick: () => navigate("/chat"),
            match: (p) => p === "/chat" || p.startsWith("/chat/"),
        } : null,
        isLoggedIn ? {
            id: "cart",
            label: "Cart",
            icon: ShoppingCart,
            to: "/cart",
            badge: cartBadgeCount > 0 ? (cartBadgeCount > 9 ? "9+" : cartBadgeCount) : null,
            onClick: () => navigate("/cart"),
            match: (p) => p === "/cart",
        } : null,
        isLoggedIn ? {
            id: "orders",
            label: "My Orders",
            icon: ShoppingBag,
            to: "/orders",
            badge: ordersBadgeCount > 0 ? (ordersBadgeCount > 9 ? "9+" : ordersBadgeCount) : null,
            onClick: () =>
                navigate(isLoggedIn ? "/orders" : "/login", {
                    state: { from: "/orders" },
                }),
            match: (p) => p.startsWith("/orders"),
        } : null,
        isLoggedIn ? {
            id: "transport-library",
            label: "Transport Library",
            icon: Truck,
            to: "/transport-library",
            badge: transportBadgeCount > 0 ? (transportBadgeCount > 9 ? "9+" : transportBadgeCount) : null,
            onClick: () => navigate("/transport-library"),
            match: (p) => p === "/transport-library" || p.startsWith("/transport-library/"),
        } : null,

    ].filter(Boolean);
}