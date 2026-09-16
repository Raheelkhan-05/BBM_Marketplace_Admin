//CTASection.jsx

import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { trustBadges } from "../../../data/content";
import SmartLink from "../SmartLink";

export default function CTASection() {
  return (
    <div className="mt-4 flex flex-col items-center lg:mt-16">

      <SmartLink
        to="/home"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d2462b] py-4 text-[15px] font-semibold text-white shadow-md shadow-[#d2462b]/25 transition-colors hover:bg-[#d85a41] lg:w-auto lg:px-14"
      >
        Explore Marketplace
        <ArrowRight className="h-4 w-4" />
      </SmartLink>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500 sm:text-sm">
        <ShieldCheck className="h-4 w-4 text-[#057184]" />
        {trustBadges.map((badge, i) => (
          <span key={badge} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">•</span>}
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}