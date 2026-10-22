// src/components/FooterDock.jsx
// Fixed pill footer: icon + label for Home, Products, Sales Orders.
// Used by GrowPage and LandingPage.
import { Link, useLocation } from "react-router-dom";
import { Home, Boxes, FileText } from "lucide-react";
import { MENU_ROUTES } from "./menuItems.js";

const GREEN = "#1F7A4D";
const GREEN_TINT = "#E8F3EC";
const INK = "#0B1116";

const FOOTER_ITEMS = [
    {
        key: "home", label: "Home", Icon: Home, to: MENU_ROUTES.home,
        match: (p) => p === "/home" || p === "/home/",
    },
    {
        key: "products", label: "Products", Icon: Boxes, to: MENU_ROUTES.manageProducts,
        match: (p) => p.startsWith("/seller/products"),
    },
    {
        key: "sales", label: "Sales Orders", Icon: FileText, to: MENU_ROUTES.salesOrders,
        match: (p, s) => (p === "/orders" && new URLSearchParams(s || "").get("tab") === "sales") || p.startsWith("/seller/orders"),
    },
];

export default function FooterDock() {
    const { pathname, search } = useLocation();
    return (
        <nav
            aria-label="Quick navigation"
            className="fixed inset-x-0 z-40 flex justify-center"
            style={{ bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
        >
            <div className="flex items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_10px_30px_-8px_rgba(20,27,34,0.35)] ring-1 ring-black/10">
                {FOOTER_ITEMS.map(({ key, label, Icon, to, match }) => {
                    const active = match(pathname, search);
                    return (
                        <Link
                            key={key}
                            to={to}
                            aria-current={active ? "page" : undefined}
                            className="flex min-w-[68px] flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 transition-colors active:scale-95"
                            style={{ background: active ? GREEN_TINT : "transparent", color: active ? GREEN : INK }}
                        >
                            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2.1} />
                            <span className="whitespace-nowrap text-[10.5px] font-bold leading-none tracking-wide">{label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}