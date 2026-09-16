import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, MapPin, ShieldCheck, ChevronRight } from "lucide-react";

export default function ShopResultCard({ shop }) {
  const navigate = useNavigate();
  return (
    <motion.button
      onClick={() => navigate(`/shop/${shop.shop_slug}`)}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.3 }}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 text-left shadow-[0_8px_20px_-16px_rgba(4,112,132,0.3)] transition hover:border-[#7fb3bd]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
        {shop.logo_url ? (
          <img src={shop.logo_url} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <Building2 className="h-5 w-5 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13.5px] font-extrabold text-slate-900">{shop.display_name}</p>
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] font-medium text-slate-500">
          {shop.business_type && <span>{shop.business_type} · </span>}
          <MapPin className="h-3 w-3 shrink-0" />{shop.city}, {shop.state}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </motion.button>
  );
}