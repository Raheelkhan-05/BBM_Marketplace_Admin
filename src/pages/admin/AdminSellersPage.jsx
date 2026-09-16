import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, ChevronRight, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminListSellers } from "../../utils/api.js";

const TABS = [
  { key: "pending_review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_TONE = {
  pending_review: { bg: "rgba(217,119,6,0.1)", fg: "#b45309", label: "Pending" },
  approved: { bg: "rgba(22,163,74,0.1)", fg: "#15803d", label: "Approved" },
  rejected: { bg: "rgba(199,31,17,0.1)", fg: "#c71f11", label: "Rejected" },
  draft: { bg: "rgba(100,116,139,0.1)", fg: "#475569", label: "Draft" },
};

export default function AdminSellersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending_review");
  const [q, setQ] = useState("");
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    adminListSellers(token, tab, q).then((res) => {
      if (active && res?.success) setSellers(res.sellers);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tab, q, token]);

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-[22px] font-extrabold text-slate-900">Seller Applications</h1>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors"
              style={{ background: tab === t.key ? "#047084" : "#f1f5f9", color: tab === t.key ? "white" : "#64748b" }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sellers…" className="w-40 bg-transparent text-[13px] font-medium focus:outline-none" />
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
        {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#047084]" /></div>}
        {!loading && sellers.length === 0 && <p className="py-10 text-center text-[13px] font-medium text-slate-400">No sellers found.</p>}
        {sellers.map((s) => {
          const tone = STATUS_TONE[s.status] || STATUS_TONE.draft;
          return (
            <motion.button key={s.id} onClick={() => navigate(`/sellers/${s.id}`)}
              whileHover={{ backgroundColor: "#f8fafc" }}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-slate-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-slate-900">{s.display_name || "Untitled shop"}</p>
                <p className="text-[12px] font-medium text-slate-400">{s.business_type} &middot; {s.city}, {s.state}</p>
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}