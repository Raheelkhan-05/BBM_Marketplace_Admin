// components/catalog/SellerRowChoiceSheet.jsx
import { motion } from "framer-motion";
import { X, ShoppingBag, Eye, ChevronRight } from "lucide-react";
import { C, EASE } from "./tokens";

function ChoiceButton({ icon: Icon, tone, title, subtitle, onClick }) {
    return (
        <button
            onClick={onClick}
            className="group flex w-full items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition-all duration-150 hover:shadow-[0_10px_24px_-14px_rgba(11,17,22,0.25)] active:scale-[0.98]"
            style={{ borderColor: `${tone}30`, background: `${tone}08` }}
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: tone }}>
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-extrabold leading-tight" style={{ color: C.ink }}>{title}</p>
                <p className="mt-0.5 text-[12px] font-medium leading-snug" style={{ color: C.muted }}>{subtitle}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" style={{ color: tone }} />
        </button>
    );
}

export default function SellerRowChoiceSheet({ row, onClose, onBuy, onViewDetails }) {
    if (!row) return null;
    return (
        <motion.div
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[24px] sm:p-6"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto mb-3 h-1 w-9 rounded-full sm:hidden" style={{ background: C.hair }} />
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.secondary }}>{row.brand_name}</p>
                        <h2 className="mt-0.5 truncate text-[17px] font-extrabold leading-tight" style={{ color: C.ink }}>{row.display_name}</h2>
                        <p className="mt-1 text-[12px] font-bold" style={{ color: C.primary }}>₹{row.price}{row.unit ? `/${row.unit}` : ""}</p>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]" aria-label="Close">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="mt-4 flex flex-col gap-2.5">
                    <ChoiceButton icon={ShoppingBag} tone={C.secondary} title="Buy from this seller" subtitle={`MOQ ${row.moq} ${row.unit} · Lead time ${row.lead_time}`} onClick={onBuy} />
                    <ChoiceButton icon={Eye} tone={C.primary} title="View product details" subtitle="Full spec sheet — pricing, packaging, delivery & more" onClick={onViewDetails} />
                </div>
            </motion.div>
        </motion.div>
    );
}