// src/components/menuItems.js
//
// Single source of truth for the app's main navigation. Used by BOTH:
//   - BottomNavStrip.jsx  (mobile full-screen menu)
//   - Header.jsx          (desktop nav, via DesktopNav.jsx)
// so the two can never drift apart.
import {
    Home, PackagePlus, Boxes, Store, FileText, HandCoins,
    Truck, ShoppingCart, MessageCircle,
    Megaphone,
} from "lucide-react";

export const MENU_ROUTES = {
    home: "/home",
    listProduct: "/seller/sell",
    manageProducts: "/seller/products",   // TODO confirm
    myStore: "/seller/store",             // approved sellers
    myStoreOnboarding: "/seller/onboarding", // anyone not yet approved
    salesOrders: "/orders?tab=sales",
    creditRequest: "/credit",      // TODO confirm
    transport: "/transport-library",
    cart: "/cart",
    marketing: "/seller/marketing",
    purchaseOrders: "/orders?tab=purchases",
    chats: "/chat",
};

// Highlight "My store" on either route, so it stays active if an approved
// seller opens onboarding (e.g. to edit details) or vice versa.
const matchMyStore = (p) =>
    startsWithRoute(MENU_ROUTES.myStore)(p) ||
    startsWithRoute(MENU_ROUTES.myStoreOnboarding)(p);

const matchMarketing = (p) =>
    startsWithRoute(MENU_ROUTES.marketing)(p);

const badgeLabel = (n) => (n > 0 ? (n > 9 ? "9+" : n) : null);
const startsWithRoute = (route) => (p) => p === route || p.startsWith(route + "/");
const tabOf = (search) => new URLSearchParams(search || "").get("tab");

const matchSalesOrders = (p, search) =>
    (p === "/orders" && tabOf(search) === "sales") || p.startsWith("/seller/orders");
const matchPurchaseOrders = (p, search) =>
    p.startsWith("/orders") && !(p === "/orders" && tabOf(search) === "sales");

// group: used to draw dividers whenever it changes between two consecutive items.
//   -1 home   0 seller tools   1 buying   2 everything else
export function buildMenuItems({
    isApprovedSeller, navigate,
    cartCount = 0, chatUnread = 0, purchaseUnread = 0, creditUnread = 0, salesUnread = 0, productsBadge = 0,
}) {
    const item = (id, label, icon, to, group, rawBadge = 0, match = startsWithRoute(to)) => ({
        id, label, icon, to, group,
        badge: badgeLabel(rawBadge), rawBadge,
        onClick: () => navigate(to),
        match,
    });

    const sellerItems = isApprovedSeller
        ? [
            item("list-product", "List a product", PackagePlus, MENU_ROUTES.listProduct, 0),
            item("manage-products", "Manage products", Boxes, MENU_ROUTES.manageProducts, 0, productsBadge),
            item("my-store", "My store", Store, MENU_ROUTES.myStore, 0, 0, matchMyStore),
            // item("marketing", "Marketing", Megaphone, MENU_ROUTES.marketing, 0, 0, matchMarketing),
            item("sales-orders", "Sales orders", FileText, MENU_ROUTES.salesOrders, 0, salesUnread, matchSalesOrders),
        ]
        : [item("my-store", "My store", Store, MENU_ROUTES.myStoreOnboarding, 0, 0, matchMyStore)];

    return [
        item(
            "home",
            "Home",
            Home,
            MENU_ROUTES.home,
            -1,
            0,
            (p) => p === "/home" || p === "/home/"
        ),
        ...sellerItems,
        item("cart", "Cart", ShoppingCart, MENU_ROUTES.cart, 1, cartCount),
        item("purchase-orders", "Purchase orders", FileText, MENU_ROUTES.purchaseOrders, 1, purchaseUnread, matchPurchaseOrders),
        item("credit-request", "Credit", HandCoins, MENU_ROUTES.creditRequest, 2, creditUnread),
        item("chats", "Chats", MessageCircle, MENU_ROUTES.chats, 2, chatUnread),
        item("transport", "Transport", Truck, MENU_ROUTES.transport, 2),
    ];
}