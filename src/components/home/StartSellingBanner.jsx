// components/home/StartSellingBanner.jsx
import { motion } from "framer-motion";
import { Store, ArrowRight, Clock3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function StartSellingBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const status = profile?.seller_status;

  if (status === "approved") return null;

  const CONFIG = {
    draft: { icon: Clock3, title: "Finish setting up your shop", sub: "A few steps left to go live.", cta: "Continue setup" },
    pending_review: { icon: Clock3, title: "Your shop is under review", sub: "Usually verified within 24–48 hours.", cta: "View status" },
    rejected: { icon: Clock3, title: "Action needed on your shop", sub: "A few details need updating.", cta: "Review & resubmit" },
  };
  const c = CONFIG[status] || {
    icon: Store,
    title: "Start selling on BBM",
    sub: "Set up your shop and reach verified buyers.",
    cta: "Start selling",
  };
  const Icon = c.icon;

  return (
    <motion.button
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: "instant",
        });
        navigate("/seller/onboarding");
      }}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.35 }}
      className="shimmer-banner mt-4 flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left sm:px-3.5 sm:py-3"
      style={{
        borderColor: "rgba(217,158,26,0.35)",
        background: "linear-gradient(120deg, rgba(250,204,21,0.14) 0%, rgba(250,204,21,0.04) 55%, #ffffff 100%)",
        boxShadow: "0 1px 2px rgba(217,158,26,0.08), 0 8px 18px -12px rgba(217,158,26,0.35)",
      }}
    >
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-white sm:h-9 sm:w-9"
        style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}
      >
        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-extrabold leading-tight text-slate-900 sm:text-[13.5px]">{c.title}</p>
        <p className="truncate text-[11px] font-medium leading-tight text-slate-500 sm:text-[12px]">{c.sub}</p>
      </div>

      <span
        className="hidden shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold text-white sm:flex"
        style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}
      >
        {c.cta} <ArrowRight className="h-3.5 w-3.5" />
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-amber-600 sm:hidden" />

      <style>{`
        .shimmer-banner {
          position: relative;
        }
        .shimmer-banner::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            transparent 20%,
            rgba(255, 255, 255, 0.55) 35%,
            rgba(255, 255, 255, 0.55) 45%,
            transparent 60%
          );
          background-size: 200% 100%;
          background-position: 150% 0;
          animation: shimmer-sweep 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes shimmer-sweep {
          0% { background-position: 150% 0; }
          55% { background-position: -50% 0; }
          100% { background-position: -50% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .shimmer-banner::after { animation: none; }
        }
      `}</style>
    </motion.button>
  );
}