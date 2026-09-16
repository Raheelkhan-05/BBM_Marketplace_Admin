//src/components/search/ProductResultCard.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ShieldCheck, BadgeCheck, Truck, Info, Package, Lock, CheckCircle2, Users } from "lucide-react";
import Sparkline from "./Sparkline";
import { useAuth } from "../../context/AuthContext";
import { FONT_BODY } from "../../pages/ui";

const TAG_ICONS = {
  brand: ShieldCheck,
  original: BadgeCheck,
  delivery: Truck,
};

function timeAgo(ts) {
  const secs = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs} sec ago`;
  return `${Math.round(secs / 60)} min ago`;
}

export default function ProductResultCard({ product }) {
  const [liked, setLiked] = useState(false);
  const [activePack, setActivePack] = useState();
  const { pricing } = product;
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.div
      onClick={() => navigate(`/product/${product.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(`/product/${product.id}`);
      }}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.4 }}
      className="cursor-pointer overflow-hidden border-b border-slate-100 bg-white transition-colors hover:bg-slate-50/60 sm:rounded-2xl sm:border sm:border-slate-100 sm:shadow-[0_16px_40px_-24px_rgba(4,112,132,0.3)]"
    >

      {/* Product header block */}
      <div className="flex gap-4 sm:p-5">
        <div className="w-24 shrink-0 self-start overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100 sm:w-28" style={{ aspectRatio: "2 / 3" }}>
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ background: "rgba(5,113,132,0.10)", color: "#057184" }}
            >
              {product.badge}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLiked((v) => !v);
              }}
              aria-label="Save product"
              className="shrink-0 text-slate-300 transition-colors hover:text-[#d2462b]"
            >
              <Heart className="h-5 w-5" fill={liked ? "#d2462b" : "none"} stroke={liked ? "#d2462b" : "currentColor"} />
            </button>
          </div>

          <h3
            className="mt-1.5 truncate text-[15px] font-extrabold tracking-tight text-slate-900 sm:text-[17px]"
            style={{ fontFamily: FONT_BODY }}
          >
            {product.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] md:text-[12px] font-medium text-slate-500">{product.subtitle}</p>

          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
            {product.tags.map((tag) => {
              const Icon = TAG_ICONS[tag.icon] || ShieldCheck;
              return (
                <span key={tag.label} className="flex items-center gap-1 text-[10px] md:text-[11px] font-semibold text-slate-500">
                  <Icon className="h-3.5 w-3.5 text-[#047084]" />
                  {tag.label}
                </span>
              );
            })}
          </div>

          <p className="mb-1.5 mt-3 text-[10.5px] font-semibold text-slate-400">Available Pack Sizes</p>
          <div className="flex flex-wrap gap-1">
            {product.packSizes.map((size, i) => (
              <button
                key={size}
                onClick={(e) => {
                  e.stopPropagation();
                  setActivePack(i);
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${i === activePack
                  ? "border-[#047084] bg-[#047084]/10 text-[#047084]"
                  : "border-slate-200 text-slate-600 hover:border-[#7fb3bd]"
                  }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Market Price Snapshot */}
      <div className="mb-4 mt-2 rounded-xl bg-slate-50 py-3 px-1 sm:mx-5 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 ps-2">
            <h4 className="text-[12px] font-extrabold text-slate-900 sm:text-[13px]">Market Price Snapshot</h4>
            <Info className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <span className="hidden items-center gap-1 text-[10.5px] font-medium text-slate-400 sm:flex">
            Prices updated {timeAgo(pricing.updatedAt)}
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200">
          <SnapshotStat label="Lowest Price" value={`₹${pricing.lowest}`} unit="/Ltr*" sub="For highest quantity" color="#16a34a" trend={pricing.trend.lowest} />
          <SnapshotStat label="Average Price" value={`₹${pricing.average}`} unit="/Ltr" sub="Market Average" color="#2563eb" trend={pricing.trend.average} />
          <SnapshotStat label="Highest Price" value={`₹${pricing.highest}`} unit="/Ltr" sub="For lower quantity" color="#ea580c" trend={pricing.trend.highest} />
          <SnapshotStat
            label="Suppliers Quoting"
            value={pricing.suppliersQuoting}
            unit=""
            sub="Verified Suppliers"
            color="#7c3aed"
            icon={Users}
          />
        </div>

        <p className="mt-3 border-t border-slate-200 p-2 sm:s-0 pt-3 text-[10px] leading-relaxed text-slate-400 sm:text-[10.5px]">
          * Lowest price is for the highest quantity slab. <br></br> Final pricing depends on order quantity, location, payment terms and other commercial conditions.
        </p>
      </div>

      {/* MOQ / Delivery / Payment row */}
      <div className="mb-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-white sm:mx-5">
        <InfoCell icon={Package} label="MOQ Starts From" value={product.moq} fg="#16a34a" />
        <InfoCell icon={Truck} label="Delivery Starts In" value={product.deliveryDays} fg="#047084" />
        <InfoCell icon={CheckCircle2} label="Payment Terms" value={product.paymentTerms} fg="#d2462b" />
      </div>


      {!isLoggedIn && (
        <div
          className="mb-4 rounded-xl p-4 sm:mx-5 sm:p-5"
          style={{ background: "linear-gradient(135deg, rgba(4,112,132,0.06) 0%, rgba(210,70,43,0.06) 100%)", border: "1px solid rgba(4,112,132,0.14)" }}
        >
          <div className="flex items-center gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_18px_-6px_rgba(4,112,132,0.5)] sm:h-[72px] sm:w-[72px]"
              style={{ background: "linear-gradient(135deg, #047084 0%, #7fb3bd 100%)" }}
            >
              <Lock className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[13.5px] leading-[18px] p-0.5 font-extrabold text-slate-900">
                Compare live prices from {pricing.suppliersQuoting} verified suppliers
              </p>
              <ul className="mt-1.5 space-y-1">
                {["Get best quotes for your required quantity", "See supplier-wise prices, MOQ & discounts", "Save time and grow your business"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5 text-[11.5px] font-medium leading-[12px] p-0.5 text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#047084]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button
            onClick={(e) => e.stopPropagation()}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-bold text-white shadow-[0_10px_22px_-8px_rgba(199,31,17,0.5)] transition-transform hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}
          >
            <Lock className="h-4 w-4" />
            View Live Quotes
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-slate-400">Login / Sign up to see prices and contact suppliers</p>
        </div>
      )}
    </motion.div>
  );
}

function SnapshotStat({ label, value, unit, sub, color, trend, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.4 }}
      className="flex min-w-0 flex-col items-center px-1 md:px-3 text-center"
    >
      <p className="truncate text-[8px] tracking-wide font-bold sm:text-[8.5px] md:text-[10px]" style={{ color }}>
        {label}
      </p>
      <p className="mt-2 text-[14px] font-bold leading-none text-slate-900 md:text-[18px]" style={{ color }}>
        {value}
        {unit && <span className="ml-0.5 text-[8px] font-semibold text-slate-400 sm:text-[9px] md:text-[10px]">{unit}</span>}
      </p>
      <p className="mt-2.5 truncate text-[8px] font-medium leading-tight text-slate-400 sm:text-[9px] md:text-[10px]">{sub}</p>

      <div className="mt-2 px-0.5 flex w-full items-center justify-center sm:mt-2 md:mt-4">
        {Icon ? (
          <Icon className="h-7 w-7 sm:h-7 sm:w-7" style={{ color }} strokeWidth={1.6} />
        ) : (
          <Sparkline data={trend} color={color} />
        )}
      </div>
    </motion.div>
  );
}

function InfoCell({ icon: Icon, label, value, fg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-2 px-2.5 py-3 sm:gap-2.5 sm:px-1"
    >
      <Icon className="h-6 w-6 shrink-0 sm:h-[22px] sm:w-[22px]" style={{ color: fg }} strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold leading-tight text-slate-400 sm:text-[10px]">{label}</p>
        <p className="mt-0.5 text-[11px] font-extrabold leading-tight text-slate-900 sm:text-[13px]">{value}</p>
      </div>
    </motion.div>
  );
}