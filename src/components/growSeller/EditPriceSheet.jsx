import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import PromotionPlanModal, { PromotionRow } from "../seller/listingForm/PromotionPlanModal.jsx";
import { InlineWheelField } from "../seller/listingForm/PriceWheelPicker.jsx";
import { round2, deriveDisplayPrices, hasOuterPack } from "../../shared/packUnits.js";
import { Sheet } from "./ui.jsx";
import { toTitleCase } from "./sellerHelpers.js";

function threeTierFromSaleUnit(perSaleUnit, packSize, masterPackSize, hasOuter) {
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterPackSize);
    return { unit: d.perBaseUnit, pack: d.perPack, master: hasOuter ? d.perMasterPack : null };
}
function saleUnitFromLevel(level, value, packSize, masterPackSize, hasOuter) {
    if (level === "unit") return hasOuter ? value * packSize * masterPackSize : value * packSize;
    if (level === "pack") return hasOuter ? value * masterPackSize : value;
    return value;
}

export default function EditPriceSheet({ it, includeGst, token, onApply, onClose }) {
    const packSize = Number(it.pack_size) > 0 ? Number(it.pack_size) : 1;
    const masterPackSize = Number(it.units_per_master_pack) > 0 ? Number(it.units_per_master_pack) : 1;
    const hasOuter = hasOuterPack(it.units_per_master_pack);
    const gst = Number(it.gst_percent) || 0;
    const saleUnitText = hasOuter ? "Master Pack" : "Pack";

    const canonicalInclusive = round2(Number(it.price) || 0);
    const canonicalPerSaleUnit = round2(includeGst ? canonicalInclusive : canonicalInclusive / (1 + gst / 100));

    const reference = useMemo(
        () => threeTierFromSaleUnit(canonicalPerSaleUnit, packSize, masterPackSize, hasOuter),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const rawPerSaleUnitRef = useRef(canonicalPerSaleUnit);
    const [values, setValues] = useState(reference);
    const [perSaleUnit, setPerSaleUnit] = useState(canonicalPerSaleUnit);
    const [promoOpen, setPromoOpen] = useState(false);
    const [pendingPromo, setPendingPromo] = useState(null); // { keys, percent } staged, saved with the price

    const commitLevel = (level) => (v) => {
        const rawNext = saleUnitFromLevel(level, v, packSize, masterPackSize, hasOuter);
        rawPerSaleUnitRef.current = rawNext;
        setPerSaleUnit(round2(rawNext));
        setValues({ ...threeTierFromSaleUnit(rawNext, packSize, masterPackSize, hasOuter), [level]: v });
    };

    const priceDirty = round2(perSaleUnit) !== canonicalPerSaleUnit;
    const dirty = priceDirty || !!pendingPromo;

    const handleConfirm = () => {
        const exact = rawPerSaleUnitRef.current;
        const finalInclusive = round2(includeGst ? exact : exact * (1 + gst / 100));
        const newBasePrice = round2(finalInclusive / (1 + gst / 100));
        onApply({
            basePrice: newBasePrice,
            priceBasis: hasOuter ? "per_master_pack" : "per_pack",
            finalInclusive,
            priceChanged: priceDirty,
            promotionServices: pendingPromo ? pendingPromo.keys : null,
        });
    };

    const fields = [
        it.unit ? { level: "unit", label: `Per ${it.unit}`, value: values.unit, refValue: reference.unit } : null,
        { level: "pack", label: "Per Pack", value: values.pack, refValue: reference.pack },
        hasOuter ? { level: "master", label: "Per Master Pack", value: values.master, refValue: reference.master } : null,
    ].filter(Boolean);

    return (
        <Sheet light title="Update price" sub={`MOQ ${it.moq} ${saleUnitText}${Number(it.moq) === 1 ? "" : "s"} · ${includeGst ? "GST included" : "GST excluded"}`} onClose={onClose}>
            <div className="pw" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}>
                {fields.map((f) => (
                    <div key={f.level} style={{ minWidth: 0 }}>
                        <span className="cap">{f.label}</span>
                        <InlineWheelField
                            seed={f.value}
                            step={round2((f.refValue || 1) * 0.02) || 1}
                            gridAnchor={f.refValue || 1}
                            filterFn={(v) => v > 0}
                            formatValue={(v) => `₹${v.toLocaleString("en-IN")}`}
                            prefix="₹" suffix={null}
                            rangeMessage="Enter a price greater than ₹0."
                            onCommit={commitLevel(f.level)}
                        />
                    </div>
                ))}
            </div>

            <PromotionRow currentPercent={it.marketing_commission_percent} pending={pendingPromo} onClick={() => setPromoOpen(true)} />

            <button type="button" className="bt go blk" style={{ marginTop: 18 }} disabled={!dirty} onClick={handleConfirm}>
                {dirty ? "Save changes" : "Change the price or promotion first"}
            </button>

            <AnimatePresence>
                {promoOpen && (
                    <PromotionPlanModal
                        submission={it}
                        token={token}
                        title={toTitleCase(it.brand?.name || it.product_name || "Product")}
                        stagedKeys={pendingPromo ? pendingPromo.keys : null}
                        onClose={() => setPromoOpen(false)}
                        onDone={(keys, percent) => { setPendingPromo(keys ? { keys, percent } : null); setPromoOpen(false); }}
                    />
                )}
            </AnimatePresence>
        </Sheet>
    );
}