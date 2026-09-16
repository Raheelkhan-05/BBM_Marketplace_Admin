import { useLocation, useNavigate } from "react-router-dom";
import { ADMIN_NAV_ITEMS } from "./AdminHeader.jsx";

const C = {
    ink: "#141B22",
    muted: "#5B6672",
    secondary: "#0B7285",
    hair: "rgba(20,27,34,0.09)",
};

export default function BottomNavStrip() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const items = ADMIN_NAV_ITEMS;

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-white backdrop-blur-md md:hidden"
            style={{
                borderColor: C.hair,
                paddingBottom: "env(safe-area-inset-bottom)",
            }}
        >
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 pb-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((it) => {
                    const Icon = it.icon;
                    const active = pathname.startsWith(it.to);

                    return (
                        <button
                            key={it.id}
                            onClick={() => navigate(it.to)}
                            className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-bold tracking-wide transition-colors duration-150"
                            style={{
                                color: active ? "#fff" : C.ink,
                                background: active
                                    ? C.secondary
                                    : "rgba(20,27,34,0.045)",
                            }}
                        >
                            <Icon
                                className="h-3.5 w-3.5"
                                style={{
                                    color: active ? "#fff" : C.muted,
                                }}
                            />

                            {it.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
