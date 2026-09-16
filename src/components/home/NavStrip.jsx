// components/home/NavStrip.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { Home, LayoutGrid, ShoppingBag, FileText } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

const C = {
    ink: "#141B22",
    muted: "#5B6672",
    primary: "#C2410C",
    secondary: "#0B7285",
    hair: "rgba(20,27,34,0.09)",
};

export default function NavStrip({ onOpenRfq }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { isLoggedIn } = useAuth();

    const items = [
        { id: "home", label: "Home", icon: Home, onClick: () => navigate("/home"), match: (p) => p === "/home" },
        { id: "categories", label: "Categories", icon: LayoutGrid, onClick: () => navigate("/categories"), match: (p) => p.startsWith("/categor") },
        { id: "orders", label: "My Orders", icon: ShoppingBag, onClick: () => navigate(isLoggedIn ? "/orders" : "/login", { state: { from: "/orders" } }), match: (p) => p.startsWith("/orders") },
        { id: "rfq", label: "Post RFQ", icon: FileText, onClick: onOpenRfq, match: () => false },
    ];

    return (
        <nav className="sticky top-0 border-b bg-white backdrop-blur" style={{ borderColor: C.hair }}>
            <div
                className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-2.5 py-1.5 [scrollbar-width:none]
                           sm:gap-1.5 sm:px-4 sm:py-2
                           lg:justify-center lg:gap-2.5 lg:overflow-visible lg:px-6 lg:py-2.5
                           [&::-webkit-scrollbar]:hidden"
            >
                {items.map((it) => {
                    const Icon = it.icon;
                    const active = it.match(pathname);
                    return (
                        <button
                            key={it.id}
                            onClick={it.onClick}
                            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-150
                                       sm:px-3.5 sm:py-1.5 sm:text-[13px]
                                       lg:px-4 lg:py-2 lg:text-[13.5px]"
                            style={{
                                color: active ? "#fff" : C.ink,
                                background: active ? C.secondary : "transparent",
                            }}
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(20,27,34,0.045)"; }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                        >
                            <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" style={{ color: active ? "#fff" : C.muted }} />
                            {it.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}