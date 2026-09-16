//HeroSection.jsx

import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { heroContent, TAGLINE } from "../../../data/content";
import SmartLink from "../SmartLink";

export default function HeroSection() {
  return (
    <div className="relative px-4 pt-4 sm:px-6 sm:pt-3 lg:px-0">
      {/* decorative accent shape tucked behind the heading */}
      <div
        className="pointer-events-none absolute -left-6 top-0 h-24 w-24 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(199,31,17,0.16) 0%, transparent 70%)" }}
      />

      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9.5px] md:text-[11px] font-bold uppercase tracking-wider"
        style={{ backgroundColor: "#f1d1c8", color: "#c71f11" }}
      >
        <Sparkles className="h-3 w-3" />
        {TAGLINE}
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-4 text-[3rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl xl:text-[4.75rem]"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        {heroContent.titleLine1}{" "}
        <span className="relative inline-block text-[#d2462b]">
          {heroContent.titleAccent1}
          <svg
            className="absolute -bottom-0.5 left-0 w-full"
            height="10"
            viewBox="0 0 200 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M2 7 Q 50 2 100 6 T 198 5" stroke="#f1d1c8" strokeWidth="6" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        <br />
        {heroContent.titleLine2}{" "}
        <span className="text-[#047084]">{heroContent.titleAccent2}</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.22 }}
        className="mt-4 max-w-md text-[15px] font-medium leading-relaxed text-slate-500"
      >
        Source components, materials, and equipment directly from verified
        industrial suppliers — no middlemen, no guesswork.
      </motion.p>

      <motion.ul
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.32 }}
        className="mt-5 flex flex-wrap gap-x-5 gap-y-2"
      >
        {heroContent.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e6ecee]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#047084]" />
            </span>
            {b}
          </li>
        ))}
      </motion.ul>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-7 flex flex-wrap items-center gap-3"
      >
        <SmartLink
          to="/home"
          className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(199,31,17,0.5)] transition-transform duration-200 hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
        >
          Explore Marketplace
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </SmartLink>
      </motion.div>
    </div>
  );
}