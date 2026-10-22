// components/home/FeedQuickActions.jsx
//
// Two gradient quick-action tiles (Brands / Sellers), styled after the HTML prototype.
// Props are unchanged from HomeProductFeed's usage:
//   active      "brands" | "shop" | null
//   brandLabel  selected brand name (shown on the Brands tile while active)
//   onBrands / onMyShop   tap handlers (tapping an ACTIVE tile exits that view)

import { ChevronRight, Store, Tag, X } from "lucide-react";

const TILES = [
    { id: "brands", label: "Brands", hint: "Browse by brand", Icon: Tag, accent: "#D8420F" },
    { id: "shop", label: "Sellers", hint: "Browse all sellers", Icon: Store, accent: "#0F63B5" },
];

export default function FeedQuickActions({ active = null, brandLabel = null, onBrands, onMyShop }) {
    const handlers = { brands: onBrands, shop: onMyShop };

    return (
        <div className="mb-3 grid grid-cols-2 gap-2.5 sm:gap-3" role="group" aria-label="Quick actions">
            {TILES.map(({ id, label, hint, Icon, accent }) => {
                const isActive = active === id;
                const sub = isActive ? (id === "brands" ? brandLabel || "Clear filter" : "Back to all products") : hint;
                const Trail = isActive ? X : ChevronRight;

                return (
                    <button
                        key={id}
                        type="button"
                        onClick={handlers[id]}
                        aria-pressed={isActive}
                        aria-label={isActive ? `${label}: ${sub}. Tap to clear` : `${label}. ${hint}`}
                        className="group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[20px] border p-3 text-left text-white transition-transform duration-150 sm:gap-3 sm:p-3.5"
                        style={{
                            background: `linear-gradient(135deg, ${accent}, ${accent})`,
                            borderColor: "rgba(255,255,255,0.14)",
                            boxShadow: `2px 2px 10px 0px ${accent}90`,
                        }}
                    >
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                            style={{ background: "rgba(255,255,255,0.2)" }}
                        >
                            <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={2.3} />
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-extrabold leading-tight tracking-wide sm:text-[15px]">{label}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight opacity-90 sm:text-[12px]">{sub}</span>
                        </span>

                        <Trail
                            className={`h-5 w-5 shrink-0 opacity-90 transition-transform ${isActive ? "" : "group-hover:translate-x-0.5"}`}
                            strokeWidth={2.4}
                        />
                    </button>
                );
            })}
        </div>
    );
}