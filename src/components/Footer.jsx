//Footer.jsx

import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram } from "react-icons/fa";
import { TAGLINE } from "../../data/content";
import SmartLink from "./SmartLink.jsx";

const FOOTER_COLUMNS = [
  { title: "Marketplace", links: ["Explore Products", "Verified Suppliers", "Post RFQ", "Categories"] },
  { title: "Company", links: ["About BBM", "Careers", "Press", "Contact Us"] },
  { title: "Support", links: ["Help Center", "How it Works", "Trust & Safety", "FAQs"] },
];

const SOCIALS = [
  { icon: FaFacebookF, href: "#" },
  { icon: FaTwitter, href: "#" },
  { icon: FaLinkedinIn, href: "#" },
  { icon: FaInstagram, href: "#" },
];

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5 }}
      className="relative border-t border-slate-200/70 bg-[#0f2530] text-slate-300"
    >
      <div
        className="h-[2px] w-full"
        style={{
          background: "linear-gradient(90deg, #c71f11 0%, #e08775 25%, #f1d1c8 50%, #7fb3bd 75%, #047084 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "radial-gradient(circle at 15% 0%, rgba(4,112,132,0.25) 0%, transparent 55%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SmartLink to="/" className="flex items-center gap-2">
              <img src="./Logo.png" alt="BBM" className="h-6 w-auto object-contain" />
              <h1
                className="text-lg font-extrabold tracking-tight text-white"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
              >
                BBM
              </h1>
            </SmartLink>
            <p className="mt-2 text-sm font-bold text-[#7fb3bd]">{TAGLINE}</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
              India&apos;s trusted B2B marketplace connecting buyers and verified
              suppliers across every industry.
            </p>

            <div className="mt-3 space-y-1.5 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#7fb3bd]" />
                <span>support@bbmpvtltd.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#7fb3bd]" />
                <span>+91 98765 43210</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#7fb3bd]" />
                <span>Rajkot, Gujarat, India</span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {SOCIALS.map(({ icon: Icon }, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-[#d2462b] hover:bg-[#d2462b]/15 hover:text-[#e08775]"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-white">{col.title}</h4>
              <ul className="mt-2.5 space-y-1.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-slate-400 transition-colors hover:text-[#7fb3bd]">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-4 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} BBM. All rights reserved.
          </p>
          <div className="flex gap-5 text-xs text-slate-500">
            <a href="#" className="hover:text-[#7fb3bd]">Privacy Policy</a>
            <a href="#" className="hover:text-[#7fb3bd]">Terms of Service</a>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}