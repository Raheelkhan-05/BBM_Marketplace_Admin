// components/catalog/ChooseBrandToSellModal.jsx
//
// Opened when a seller taps "Sell" on a Generic Product tile — unlike
// the old brand-item flow, we don't yet know WHICH brand they sell.
// Step 1: show approved brands already under this product ("is one of
// these yours?"). If they pick one, we hand off straight to the
// existing, unmodified SellThisItemModal (full reuse — identity stays
// read-only, exactly like tapping Sell from a specific brand item).
// If none match, "It's a different brand" opens ListNewBrandModal,
// which lets them declare a brand-new product identity.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, ChevronRight, PlusCircle } from "lucide-react";
import { fetchApprovedBrandsForGenericProduct } from "../../utils/api";
import SellThisItemModal from "./SellThisItemModal.jsx";
import ListNewBrandModal from "./ListNewBrandModal.jsx";
import { C, EASE } from "./tokens";

export default function ChooseBrandToSellModal({ genericProduct, onClose }) {
    const [loading, setLoading] = useState(true);
    const [brands, setBrands] = useState([]);
    const [picked, setPicked] = useState(null);       // existing brand chosen -> SellThisItemModal
    const [creatingNew, setCreatingNew] = useState(false); // -> ListNewBrandModal

    useEffect(() => {
        let cancelled = false;
        fetchApprovedBrandsForGenericProduct(genericProduct.id).then((res) => {
            if (!cancelled) { setBrands(res?.success ? res.items : []); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [genericProduct.id]);

    if (picked) return <SellThisItemModal brand={picked} onClose={onClose} />;
    if (creatingNew) return <ListNewBrandModal genericProduct={genericProduct} onClose={onClose} />;

    return (
        <motion.div
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 sm:rounded-[24px] sm:p-6"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.secondary }}>Sell this product</p>
                        <h2 className="mt-0.5 truncate text-[17px] font-extrabold" style={{ color: C.ink }}>{genericProduct.name}</h2>
                        <p className="mt-1 text-[12px] font-medium" style={{ color: C.muted }}>Which brand are you selling?</p>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                    ) : (
                        <>
                            {brands.map((b) => (
                                <button
                                    key={b.id}
                                    onClick={() => setPicked(b)}
                                    className="flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                                    style={{ borderColor: C.hair }}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white" style={{ borderColor: C.hair }}>
                                        {b.image ? <img src={b.image} alt="" className="h-full w-full object-cover" /> : null}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-extrabold" style={{ color: C.ink }}>{b.brand_name}</p>
                                        <p className="truncate text-[11px] font-semibold" style={{ color: C.muted }}>{b.name}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.muted }} />
                                </button>
                            ))}
                            <button
                                onClick={() => setCreatingNew(true)}
                                className="mt-1 flex items-center gap-3 rounded-2xl border-2 border-dashed p-3 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                                style={{ borderColor: C.hair }}
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.primary}12`, color: C.primary }}>
                                    <PlusCircle className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-extrabold" style={{ color: C.ink }}>It's a different brand</p>
                                    <p className="text-[11px] font-semibold" style={{ color: C.muted }}>List a brand not shown above</p>
                                </div>
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}