// Footer.jsx

import { motion } from "framer-motion";
import { Mail, Phone, MapPin, ArrowUpRight } from "lucide-react";
import { TAGLINE } from "../../data/content";
import SmartLink from "./SmartLink.jsx";

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative overflow-hidden bg-[#0b1c24] text-slate-300"
    >
      {/* Top accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#7fb3bd]/60 to-transparent" />

      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[#047084]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-[#d2462b]/5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-10 lg:py-12">
        {/* Main footer */}
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          {/* Brand */}
          <div className="max-w-xl">
            <SmartLink
              to="/"
              className="group inline-flex items-center gap-3"
              aria-label="BBM Home"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl p-0.5 shadow-lg shadow-black/10 transition-all duration-300 group-hover:border-[#7fb3bd]/30 group-hover:bg-white/[0.09]"
              >
                <img
                  src="/Logo.png"
                  alt="BBM"
                  className="h-full w-full object-contain"
                />
              </div>

              <div>
                <h2
                  className="text-xl font-extrabold tracking-tight text-white"
                  style={{
                    fontFamily: "'Bricolage Grotesque', sans-serif",
                  }}
                >
                  BBM
                </h2>

                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  B2B Marketplace
                </p>
              </div>
            </SmartLink>

            <p className="mt-6 text-base font-semibold leading-relaxed text-[#9bc4cc]">
              {TAGLINE}
            </p>

            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
              India&apos;s trusted B2B marketplace connecting buyers with
              verified suppliers across every industry.
            </p>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
            <a
              href="mailto:communication@bbmpvtltd.com"
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 px-3.5 transition-all duration-300 hover:border-[#7fb3bd]/20 hover:bg-white/[0.06]"
            >
              <Mail className="h-4 w-4 text-[#7fb3bd] transition-transform duration-300 group-hover:-translate-y-0.5" />

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Email
              </p>

              <p className="mt-1 break-all text-xs font-medium text-slate-300">
                communication@bbmpvtltd.com
              </p>
            </a>

            <a
              href="tel:+919537284774"
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 transition-all duration-300 hover:border-[#7fb3bd]/20 hover:bg-white/[0.06]"
            >
              <Phone className="h-4 w-4 text-[#7fb3bd] transition-transform duration-300 group-hover:-translate-y-0.5" />

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Phone
              </p>

              <p className="mt-1 text-xs font-medium text-slate-300">
                +91 95372 84774
              </p>
            </a>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
              <MapPin className="h-4 w-4 text-[#7fb3bd]" />

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Location
              </p>

              <p className="mt-1 text-xs font-medium text-slate-300">
                Rajkot, Gujarat
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Bottom row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} BBM. All rights reserved.
          </p>

          {/* Only legal navigation */}
          <div className="flex items-center gap-5 text-xs">
            <a
              href="/privacy-policy"
              className="text-slate-500 transition-colors duration-200 hover:text-[#9bc4cc]"
            >
              Privacy Policy
            </a>

            <span className="h-3 w-px bg-white/10" />

            <a
              href="/terms"
              className="text-slate-500 transition-colors duration-200 hover:text-[#9bc4cc]"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}