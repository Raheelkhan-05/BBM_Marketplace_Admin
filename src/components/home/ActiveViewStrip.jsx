// components/home/ActiveViewStrip.jsx
//
// Slim "you are viewing X" strip shown in the feed's sticky block when a Brand
// or a Seller (store) view is active. Colours match the quick-action tile that
// opened the view (Brands = orange, Sellers = blue), so the two read as one system.
//
// Layout (one row, ~48px tall, works from 320px up):
//   [icon chip] [LABEL / name (truncates)] [Change] [X]

import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Store, Tag, X } from "lucide-react";

const C = { ink: "#0B1116" };
const EASE = [0.16, 1, 0.3, 1];

const VARIANTS = {
    brand: { accent: "#D8420F", Icon: Tag },
    seller: { accent: "#0F63B5", Icon: Store },
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

export default function ActiveViewStrip({
    variant = "brand",   // "brand" | "seller"
    label,               // small uppercase caption, e.g. "Brand", "Seller", "Your shop"
    name,                // the selected brand / seller name
    changeTo,            // route for the "Change" pill
    onClear,             // X button handler
    clearLabel = "Clear",
}) {
    const reduce = useReducedMotion();
    const { accent, Icon } = VARIANTS[variant] || VARIANTS.brand;

    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="my-1.5 flex items-center gap-2.5 rounded-2xl border py-1.5 pl-1.5 pr-1.5 sm:pr-2"
            style={{
                background: `color-mix(in srgb, ${accent} 7%, #fff)`,
                borderColor: `color-mix(in srgb, ${accent} 24%, #fff)`,
            }}
        >
            {/* Icon chip: same gradient language as the quick-action tiles */}
            <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{
                    background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 70%, #000))`,
                    boxShadow: `0 8px 14px -8px ${accent}`,
                }}
            >
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.3} />
            </span>

            {/* Text */}
            <div className="min-w-0 flex-1">
                <p className="text-[9.5px] font-extrabold uppercase leading-none tracking-[0.14em]" style={{ color: accent }}>
                    {label}
                </p>
                <p className="mt-0 truncate text-[14px] font-extrabold capitalize leading-tight tracking-wide" style={{ color: C.ink }}>
                    {name}
                </p>
            </div>

            {/* Change */}
            {changeTo && (
                <Link
                    to={changeTo}
                    className={`inline-flex h-8 shrink-0 items-center rounded-full border bg-white px-3 text-[11px] font-extrabold tracking-wide transition active:scale-[0.97] hover:bg-white/60 ${FOCUS}`}
                    style={{ borderColor: `color-mix(in srgb, ${accent} 35%, #fff)`, color: accent, "--tw-ring-color": accent }}
                >
                    Change
                </Link>
            )}

            {/* Close */}
            <button
                type="button"
                onClick={onClear}
                aria-label={clearLabel}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-black/[0.06] ${FOCUS}`}
                style={{ "--tw-ring-color": accent }}
            >
                <X className="h-4 w-4" style={{ color: accent }} strokeWidth={2.5} />
            </button>
        </motion.div>
    );
}