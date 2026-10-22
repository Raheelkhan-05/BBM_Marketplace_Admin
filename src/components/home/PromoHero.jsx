// components/home/PromoHero.jsx
//
// Promotional hero for logged-out visitors (ported from the HTML prototype's hero,
// restyled for the app's light palette).
//
// Responsive behaviour:
//  - < sm  : single column. Steps become a compact 3-up strip (descriptions hidden),
//            stats hidden, CTAs wrap gracefully. Keeps the banner short on phones.
//  - sm–md : roomier padding, stats row appears.
//  - lg+   : two columns. Left = pitch + CTAs, right = "How it works" timeline.
//
// The parent decides WHEN to show it (logged-out + not dismissed) and owns dismissal,
// so this component stays purely presentational. Exit animation collapses the height
// so the feed below slides up smoothly instead of jumping.

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, IndianRupee, KeyRound, Search, Store, X } from "lucide-react";

const C = {
    ink: "#0B1116", muted: "#667077",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
    brand: "#de3207", teal: "#006F83",
};
const EASE = [0.16, 1, 0.3, 1];

const STEPS = [
    { Icon: Search, title: "Browse products", text: "Explore brands and categories. No account needed.", tone: "#006F83" },
    { Icon: KeyRound, title: "Sign in with OTP", text: "Takes about 30 seconds. No password.", tone: "#1E78D6" },
    { Icon: IndianRupee, title: "Compare and buy", text: "See every seller's price, MOQ and delivery time.", tone: "#22A06B" },
];

// TODO: wire these to real numbers if you have them. Defaults match the prototype.
const DEFAULT_STATS = [
    { value: "23", label: "brands" },
    { value: "50+", label: "products" },
    { value: "0.25%", label: "fees from" },
];

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#006F83]";

export default function PromoHero({ needsOnboarding = false, onSignIn, onSell, onDismiss, stats = DEFAULT_STATS }) {
    const reduce = useReducedMotion();

    return (
        <motion.section
            aria-labelledby="promo-hero-title"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0, borderWidth: 0, transition: { duration: 0.24, ease: EASE } }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative isolate mb-3 overflow-hidden rounded-3xl border bg-white"
            style={{
                borderColor: C.hair,
                background:
                    "radial-gradient(520px 260px at 100% 0%, rgba(0,111,131,0.10), transparent 70%)," +
                    "radial-gradient(480px 240px at 0% 100%, rgba(222,50,7,0.09), transparent 70%), #fff",
                boxShadow: "0 24px 48px -34px rgba(11,17,22,0.35)",
            }}
        >
            {/* Dismiss */}
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss banner"
                className={`absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-white backdrop-blur transition-colors hover:bg-black/[0.05] active:scale-95 lg:right-4 lg:top-4 ${FOCUS}`}
                style={{ borderColor: C.hair }}
            >
                <X className="h-4 w-4" style={{ color: "#444" }} strokeWidth={2.4} />
            </button>

            <div className="grid gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:p-8">
                {/* LEFT: pitch + CTAs */}
                <div className="min-w-0">
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full px-0 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em]"
                        style={{ color: C.teal }}
                    >
                        Trusted B2B marketplace
                    </span>

                    <h1
                        id="promo-hero-title"
                        className="mt-1.5 text-[34px] font-black leading-[1.05] tracking-normal sm:text-[34px] lg:text-[44px]"
                        style={{ color: C.ink }}
                    >
                        Find Supply.{" "} <br />
                        <span className="whitespace-nowrap" style={{ color: C.brand }}>Build Demand.</span>
                    </h1>

                    <p className="mt-2.5 max-w-[34rem] text-[13.5px] tracking-wide font-medium leading-relaxed sm:text-[14.5px]" style={{ color: C.muted }}>
                        {needsOnboarding
                            ? "Finish setting up your account to see seller prices, compare offers and place orders."
                            : "Browse products from sellers across India. Sign in with an OTP to see prices, compare offers and buy."}
                    </p>

                    <div className="mt-4 flex w-full min-w-0 flex-nowrap items-stretch gap-2 sm:mt-5 sm:gap-3">
                        <button
                            type="button"
                            onClick={onSignIn}
                            className={`group flex h-14 min-w-0 flex-[1.25] items-center justify-center gap-1.5 rounded-full px-2 sm:px-4 text-center text-[14px] sm:text-[15px] tracking-wide font-extrabold text-black shadow-[0_12px_22px_-12px_rgba(255,255,255,0.8)] transition active:scale-[0.98] hover:bg-[#1b2630] ${FOCUS}`}
                            style={{ background: "#FFD60A" }}
                        >
                            <span className="truncate">
                                {needsOnboarding ? "Finish setting up" : "Sign in to see prices"}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={onSell}
                            className={`flex h-14 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border bg-white px-2 sm:px-4 text-center text-[14px] sm:text-[15px] tracking-wide font-extrabold transition hover:bg-black/[0.03] active:scale-[0.98] ${FOCUS}`}
                            style={{ borderColor: C.hair, color: C.ink }}
                        >
                            <span className="truncate">I want to sell</span>
                        </button>
                    </div>


                </div>

                {/* RIGHT: how it works */}
                <div
                    className="min-w-0 rounded-2xl border bg-white/70 p-3 backdrop-blur-sm sm:p-4 lg:mt-7"
                    style={{ borderColor: C.hair }}
                >
                    <p className="mb-3 hidden text-[10px] font-extrabold uppercase tracking-[0.14em] lg:block" style={{ color: C.muted }}>
                        How it works
                    </p>

                    <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-0">
                        {STEPS.map(({ Icon, title, text, tone }, i) => (
                            <li
                                key={title}
                                className="relative flex min-w-0 flex-col items-center gap-1.5 text-center lg:flex-row lg:items-start lg:gap-3 lg:pb-4 lg:text-left lg:last:pb-0"
                            >
                                {i < STEPS.length - 1 && (
                                    <span aria-hidden className="absolute bottom-1 left-[17.5px] top-10 hidden w-px lg:block" style={{ background: C.hair }} />
                                )}
                                <span
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                                    style={{ background: `color-mix(in srgb, ${tone} 13%, #fff)`, color: tone }}
                                >
                                    <Icon className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[10.5px] font-extrabold leading-tight tracking-wide lg:text-[13px]" style={{ color: C.ink }}>
                                        <span className="lg:hidden">{i + 1}. </span>{title}
                                    </span>
                                    <span className="mt-0.5 hidden text-[12px] font-medium leading-snug lg:block" style={{ color: C.muted }}>
                                        {text}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ol>

                    {stats?.length > 0 && (
                        <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 sm:flex" style={{ borderColor: C.hairSoft }}>
                            {stats.map((s) => (
                                <span key={s.label} className="text-[11.5px] font-semibold" style={{ color: C.muted }}>
                                    <b className="font-extrabold" style={{ color: C.ink }}>{s.value}</b> {s.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.section>
    );
}