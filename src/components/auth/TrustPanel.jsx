// src/components/auth/TrustPanel.jsx
import { motion } from "framer-motion";
import { ShieldCheck, Landmark, Truck, Users } from "lucide-react";

const STATS = [
  { icon: Landmark, label: "GST-verified sellers", value: "12,400+" },
  { icon: Truck, label: "Orders dispatched monthly", value: "38,000+" },
  { icon: Users, label: "Buyers on the network", value: "9,600+" },
];

// The signature element: a rotating registration ring around a solid ink
// stamp — echoes a customs-clearance seal on a trade document, so the
// metaphor of the whole product (verified, cleared, trustworthy trade)
// shows up here first, before the user ever sees the GSTIN check itself.
function VerifiedSeal() {
  return (
    <div className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 44, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="50" cy="50" r="47"
          fill="none" stroke="#7fb3bd" strokeWidth="1"
          strokeDasharray="1 5" strokeLinecap="round" opacity="0.55"
        />
        <circle
          cx="50" cy="50" r="41"
          fill="none" stroke="#d2462b" strokeWidth="0.75"
          strokeDasharray="0.5 7" strokeLinecap="round" opacity="0.4"
        />
      </motion.svg>
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-white ring-1 ring-white/15 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.55)]"
        style={{ background: "linear-gradient(135deg, #0a95ab 0%, #047084 55%, #053b46 100%)" }}
      >
        <ShieldCheck className="h-8 w-8" strokeWidth={2.25} />
      </div>
    </div>
  );
}

export default function TrustPanel() {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[28px] px-9 py-10 text-white xl:px-11"
      style={{ background: "linear-gradient(165deg, #052f38 0%, #04555f 55%, #047084 100%)" }}
    >
      {/* Faint ledger rules echoing the page background, kept inside the panel too */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 36px)",
        }}
      />
      {/* Soft vignette so the seal and copy read against the gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 15% 100%, rgba(4,25,29,0.35) 0%, transparent 55%)" }}
      />

      <div className="relative flex mb-5 items-center gap-2 text-[13px] font-bold tracking-wide text-[#a9cdd3]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#7fb3bd]" />
        Trusted trade network
      </div>

      <div className="relative mt-auto flex flex-col">
        <VerifiedSeal />
        <h2
          className="mt-7 text-[clamp(1.8rem,2.7vw,2.45rem)] font-semibold leading-[1.12] text-white"
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          Every account here
          <br />
          is a verified business.
        </h2>
        <p className="mt-3.5 max-w-[36ch] text-[14.5px] font-medium leading-relaxed text-[#cfe6ea]">
          We check GSTIN, phone, and email before anyone can buy or sell — so
          every deal on BBM starts with a business you can actually trust.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 border-t border-white/10 pt-6 sm:grid-cols-3 xl:gap-6">
          {STATS.map(({ icon: Icon, label, value }, i) => (
            <div
              key={label}
              className={`flex flex-col gap-1.5 ${i > 0 ? "sm:border-l sm:border-white/10 sm:pl-5 xl:pl-6" : ""}`}
            >
              <Icon className="h-4 w-4 text-[#7fb3bd]" />
              <span
                className="text-[20px] font-extrabold tracking-tight text-white"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
              >
                {value}
              </span>
              <span className="text-[11.5px] font-semibold leading-snug text-[#a9cdd3]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}