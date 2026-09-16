import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext.jsx";

/* ------------------------------------------------------------------
   DESIGN NOTES — stripped to just the welcome, kept premium
   ------------------------------------------------------------------
   Everything but the welcome message is gone — no highlight cards,
   no CTA chip, no stats. What's left is deliberately restrained:

     - Mono eyebrow with the pulsing-primary-dot, same device the
       hero uses for "Verified B2B Marketplace" — establishes this
       is live/personal in one line, before the name even loads.
     - The name is the whole point, so it gets real scale (matches
       the hero's headline weight logic: bold Geist Sans, tight
       negative tracking) rather than sharing space with anything.
     - One quiet supporting line underneath, muted color, sets
       context without adding another call to action.
     - No card border/shadow chrome — sits directly on the page
       background, which reads calmer than boxing a single line of
       text in a bordered container.

   Palette: ink #0B1116, muted #667077, primary #D2462B (dot only).
   Typeface: font-sans (Geist Sans) for the heading/body, font-mono
   (Geist Mono) for the eyebrow — matches the rest of the page.

   `useAuth` assumed to be available from the same hooks module as
   before; adjust the import path if it lives elsewhere.
   ------------------------------------------------------------------ */

const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#D2462B",
};

function WelcomeBanner() {
    const { isLoggedIn } = useAuth();
    if (!isLoggedIn) return null;

    const { profile } = useAuth();
    const firstName = profile?.name?.trim().split(" ")[0] || "Procurement Director";

    return (
        <motion.section
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full px-1 pt-2 pb-0 font-sans sm:px-0"
        >
            <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                    <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                        style={{ background: C.primary }}
                    />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: C.primary }} />
                </span>
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.muted }}>
                    Buyer dashboard
                </span>
            </div>

            <h2 className="mt-2 text-2xl font-bold leading-tight tracking-[0.02em] sm:text-3xl" style={{ color: C.ink }}>
                Welcome back, {firstName}
            </h2>
            <p className="mt-1 text-[13px] font-medium leading-relaxed" style={{ color: C.muted }}>
                Here's what's happening across your account today.
            </p>
        </motion.section>
    );
}

export default WelcomeBanner;