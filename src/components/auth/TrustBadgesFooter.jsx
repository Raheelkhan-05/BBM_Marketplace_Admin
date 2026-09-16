// components/auth/TrustBadgesFooter.jsx

import { ShieldCheck, Lock, BadgeCheck } from "lucide-react";

const BADGES = [
  { icon: ShieldCheck, label: "GST-verified sellers" },
  { icon: Lock, label: "256-bit encrypted" },
  { icon: BadgeCheck, label: "Escrow-backed payments" },
];

export default function TrustBadgesFooter() {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 px-2 sm:mt-6">
      {BADGES.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="flex items-center gap-1.5 rounded-full border border-[#047084]/12 bg-white/70 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-slate-600 shadow-[0_1px_2px_rgba(4,55,64,0.04)] sm:text-[11.5px]"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-[#047084]" />
          {label}
        </span>
      ))}
    </div>
  );
}