import { motion } from "framer-motion";
import { Ic } from "../icons";

/* ─── Utility ────────────────────────────────────────────────── */
export function cls(...a) { return a.filter(Boolean).join(" "); }

/* ─── Detail row ─────────────────────────────────────────────── */
export function DRow({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">{label}</span>
      <span className={cls("text-right text-sm text-slate-700 break-all", mono ? "font-mono" : "")}>{value}</span>
    </div>
  );
}
