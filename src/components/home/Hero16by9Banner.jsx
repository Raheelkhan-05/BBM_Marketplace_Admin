import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Link } from "lucide-react";
import { promoSlides } from "../../../data/homeData";
import { useNavigate } from "react-router-dom";

/* ------------------------------------------------------------------
   DESIGN NOTES — v6, light theme, extra-bold (Linear/Vercel logic,
   kept on a light canvas)
   ------------------------------------------------------------------
   Same bones as the dark pass — restraint, one glow, one accent, a
   status-chip action, a glass image panel, mono slide index — just
   re-lit for a white canvas, since that's what reads "cleanly
   integrated" next to the rest of a light product.

     1. Canvas: near-white (#FBFCFD), not flat #FFF — sits better next
        to real content. One soft accent glow (teal, 6% opacity) top-
        left, same as the dark version's signature move, just quieter
        since light canvases can't hide a loud glow the way dark ones
        can. A hairline dot-grid at 4% opacity, masked to fade out.

     2. Type: EXTRA bold — headline sits at font-weight 800/900 with
        tight negative tracking, large scale. This is where "premium"
        actually shows up on a light theme: weight and confidence in
        the type does the job gradients/glows did on dark. Second
        line in flat primary color, same logic as before.

     3. Still no buttons — same pill status-chip pattern, just
        light-theme colored: white chip, hairline border, dark text,
        pulsing accent dot.

     4. Image panel: gradient hairline border + real shadow, exactly
        like the dark version, just recolored — the panel itself
        stays dark (brand teal backdrop) so the product photography
        still pops with contrast against the light page around it.
        Height constrained identically: 220/300/420.

     5. Mono "01 / 03" index + accent progress line, unchanged logic.

   Palette: canvas #FBFCFD, ink #0B1116, muted #667077, accent
   primary #D2462B (flat, headline + progress + chip dot), accent
   secondary #006F83 (glow + panel backdrop only), hairline
   rgba(11,17,22,0.08).
   ------------------------------------------------------------------ */

const C = {
    canvas: "#FBFCFD",
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
    secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)",
};

function Hero16by9Banner({ onOpenRfq }) {
    const total = promoSlides.length;
    const [active, setActive] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const t = setInterval(() => setActive((i) => (i + 1) % total), 5200);
        return () => clearInterval(t);
    }, [total]);

    const slide = promoSlides[active];

    return (
        <section
            className="relative w-full overflow-hidden rounded-[28px] border"
            style={{ background: C.canvas, borderColor: C.hair }}
        >
            {/* signature atmosphere: one quiet glow + one faint dot grid */}
            <div
                aria-hidden
                className="pointer-events-none absolute -left-1/4 -top-1/3 h-[560px] w-[560px] rounded-full blur-[120px]"
                style={{ background: C.secondary, opacity: 0.07 }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.045]"
                style={{
                    backgroundImage: `radial-gradient(${C.ink} 1px, transparent 1px)`,
                    backgroundSize: "22px 22px",
                    maskImage: "radial-gradient(ellipse at 20% 15%, black 0%, transparent 62%)",
                    WebkitMaskImage: "radial-gradient(ellipse at 20% 15%, black 0%, transparent 62%)",
                }}
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] lg:items-center">
                {/* ---------------- TEXT ---------------- */}
                <div className="order-2 px-4 pb-8 pt-7 sm:px-10 sm:pb-10 sm:pt-9 lg:order-1 lg:px-14 lg:py-0">
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-2"
                    >
                        <span
                            className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em]"
                            style={{ color: C.muted }}
                        >
                            Verified B2B Marketplace
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-4 font-black font-extrabold leading-[0.95] tracking-[-0.01em] sm:mt-5"
                        style={{ color: C.ink, fontSize: "clamp(40px, 4.2vw, 58px)" }}
                    >
                        Industrial supply,
                        <br />
                        <span style={{ color: C.primary }}>sourced direct.</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-4 max-w-sm text-[13.5px] font-medium leading-relaxed sm:mt-5 sm:text-[15px]"
                        style={{ color: C.muted }}
                    >
                        Compare quotes from GST-verified sellers and order at bulk
                        pricing, with dispatch tracked from factory to site.
                    </motion.p>

                    {/* status-chip action, not a button */}
                    <motion.button
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => navigate('/browse-search')}
                        className="group mt-6 inline-flex w-fit items-center gap-2 rounded-full border bg-white py-1.5 pl-3 pr-2.5 shadow-[0_1px_2px_rgba(11,17,22,0.04)] transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(11,17,22,0.08)] sm:mt-8"
                        style={{ borderColor: C.hair }}
                    >
                        <span className="relative flex h-1.5 w-1.5">
                            <span
                                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                                style={{ background: C.primary }}
                            />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: C.primary }} />
                        </span>
                        <span className="text-[12.5px] font-bold" style={{ color: C.ink }}>
                            Explore the catalog
                        </span>
                        <ArrowUpRight
                            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            style={{ color: C.muted }}
                        />
                    </motion.button>
                </div>

                {/* ---------------- IMAGE: glass panel, height-constrained ---------------- */}
                <div className="relative order-1 px-0 pt-0 sm:px-8 sm:pt-8 lg:order-2 lg:px-8 lg:py-8">
                    <div
                        className="relative overflow-hidden rounded-[20px] p-[1px]"
                        style={{
                            background: `linear-gradient(155deg, rgba(11,17,22,0.14), rgba(11,17,22,0.02) 40%, rgba(210,70,43,0.16))`,
                        }}
                    >
                        <div
                            className="relative overflow-hidden rounded-[19px]"
                            style={{ boxShadow: "0 24px 48px -20px rgba(11,17,22,0.22), 0 4px 12px -4px rgba(11,17,22,0.08)" }}
                        >
                            <button
                                className="relative block h-[220px] w-full overflow-hidden sm:h-[300px] lg:h-[420px]"
                                style={{ background: C.secondary }}
                            >
                                <AnimatePresence mode="sync">
                                    <motion.img
                                        key={slide.id}
                                        src={slide.image}
                                        alt={slide.title}
                                        draggable={false}
                                        className="absolute inset-0 h-full w-full object-cover"
                                        initial={{ opacity: 0, scale: 1.04 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                                    />
                                </AnimatePresence>

                                <div
                                    className="absolute inset-0"
                                    style={{
                                        background:
                                            "linear-gradient(to top, rgba(4,20,24,0.78) 0%, rgba(4,20,24,0.16) 44%, rgba(4,20,24,0) 64%)",
                                    }}
                                />

                                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 sm:p-5 lg:p-6">
                                    <div className="text-left">
                                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-white/70">
                                            {slide.tag}
                                        </span>
                                        <h3
                                            className="mt-0.5 font-extrabold leading-tight text-white"
                                            style={{ fontSize: "clamp(15px, 1.5vw, 20px)" }}
                                        >
                                            {slide.title}
                                        </h3>
                                    </div>

                                    {slide.badge?.match(/\d+%/) && (
                                        <span className="shrink-0 rounded-full bg-white/14 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                                            {slide.badge.match(/\d+%/)?.[0]} off
                                        </span>
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default Hero16by9Banner;