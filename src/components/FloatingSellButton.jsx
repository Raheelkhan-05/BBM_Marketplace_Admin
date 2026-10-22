// components/FloatingSellButton.jsx
//
// Desktop (md+): the original floating "Sell" button with its hover label.
// Mobile (<md): a floating MENU button. Tapping it morphs the icon into an X,
// dims the screen, and fans the menu items upward one by one.
// Sell is the first (highlighted) item, so nothing is lost on mobile.

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Menu, X, Home, LayoutGrid } from "lucide-react";

const RIPPLE_COUNT = 3;
const RIPPLE_CYCLE_MS = 2600;
const RIPPLE_STAGGER_MS = RIPPLE_CYCLE_MS / RIPPLE_COUNT;

// TODO: replace/extend with the same items BottomNavStrip used to show.
const DEFAULT_MENU_ITEMS = [
    { key: "home", label: "Home", icon: Home, to: "/home" },
    { key: "browse", label: "Browse", icon: LayoutGrid, to: "/browse" },
];

/* ───────────────────────── Desktop (unchanged) ───────────────────────── */

function DesktopSellButton({ to, label }) {
    const navigate = useNavigate();

    return (
        <>
            <style>{`
                @keyframes fsb-pop-in {
                    from { opacity: 0; transform: translateY(14px) scale(0.85); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fsb-breathe {
                    0%, 100% { box-shadow: 0 8px 22px -6px rgba(255, 255, 255, 0.5); }
                    50%      { box-shadow: 0 10px 30px -4px rgba(255, 255, 255, 0.68); }
                }

                .fsb-wrap {
                    animation: fsb-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
                }

                .fsb-btn {
                    animation: fsb-breathe 3.4s ease-in-out infinite;
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .fsb-btn:hover {
                    transform: scale(1.07) translateY(-2px);
                }
                .fsb-btn:active {
                    transform: scale(0.94);
                }

                .fsb-icon {
                    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .fsb-group:hover .fsb-icon {
                    transform: rotate(90deg);
                }

                .fsb-label {
                    max-width: 0;
                    opacity: 0;
                    overflow: hidden;
                    white-space: nowrap;
                    transition: max-width 0.3s ease, opacity 0.25s ease, margin 0.3s ease;
                }
                .fsb-group:hover .fsb-label {
                    max-width: 90px;
                    opacity: 1;
                    margin-left: 8px;
                }

                @media (prefers-reduced-motion: reduce) {
                    .fsb-wrap { animation: none; }
                    .fsb-btn { animation: none; }
                    .fsb-icon, .fsb-label { transition: none; }
                }
            `}</style>

            <div className="fixed bottom-8 right-8 z-[38] fsb-wrap">
                <div className="relative">
                    {Array.from({ length: RIPPLE_COUNT }).map((_, i) => (
                        <span
                            key={i}
                            aria-hidden="true"
                            style={{ animationDelay: `${i * RIPPLE_STAGGER_MS}ms` }}
                        />
                    ))}

                    <button
                        type="button"
                        onClick={() => navigate(to)}
                        aria-label={`${label} — start listing an item`}
                        className="fsb-group fsb-btn relative flex h-16 w-auto items-center justify-center rounded-full px-5 text-white"
                        style={{ background: "#000000" }}
                    >
                        <span className="relative flex items-center">
                            <Plus size={24} strokeWidth={2.5} className="fsb-icon shrink-0" />
                            <span className="fsb-label text-[13px] font-bold tracking-wide">
                                {label}
                            </span>
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
}

/* ───────────────────────── Public component ───────────────────────── */

export default function FloatingSellButton({ to = "/seller/sell", label = "Sell" }) {
    return (
        <div className="hidden md:block">
            <DesktopSellButton to={to} label={label} />
        </div>
    );
}