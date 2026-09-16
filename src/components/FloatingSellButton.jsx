// components/FloatingSellButton.jsx
//
// Fixed floating action button, bottom-right, navigates to /seller/sell.
// Deliberately uses a DIFFERENT motion language than MarketplaceSearchBar's
// comet-spin border: here the signature move is a slow "heartbeat" ripple —
// soft rings that bloom outward from the button on a loop, like a pin
// pulsing on a map, plus the plus-icon rotating open on hover. Same brand
// colors as the rest of the app (#D2462B / #006F83), new gesture.

import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

const RUST = "#D2462B";
const TEAL = "#006F83";

const RIPPLE_COUNT = 3;
const RIPPLE_CYCLE_MS = 2600;
const RIPPLE_STAGGER_MS = RIPPLE_CYCLE_MS / RIPPLE_COUNT;

export default function FloatingSellButton({ to = "/seller/sell", label = "Sell" }) {
    const navigate = useNavigate();

    return (
        <>
            <style>{`
                @keyframes fsb-pop-in {
                    from { opacity: 0; transform: translateY(14px) scale(0.85); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fsb-breathe {
                    0%, 100% { box-shadow: 0 8px 22px -6px rgba(210,70,43,0.5); }
                    50%      { box-shadow: 0 10px 30px -4px rgba(210,70,43,0.68); }
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

            <div className="fixed bottom-16 right-4 z-40 md:bottom-8 md:right-8 fsb-wrap">
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
                        className="fsb-group fsb-btn relative flex h-14 w-14 items-center justify-center rounded-full text-white sm:h-16 sm:w-16 sm:w-auto sm:px-5"
                        style={{ background: RUST }}
                    >
                        <span className="relative flex items-center">
                            <Plus size={24} strokeWidth={2.5} className="fsb-icon shrink-0" />
                            <span className="fsb-label hidden text-[13px] font-bold tracking-wide sm:inline">
                                {label}
                            </span>
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
}