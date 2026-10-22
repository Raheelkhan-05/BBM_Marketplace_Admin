// components/chat/CustomPricingModal.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Percent, AlertTriangle, IndianRupee, Trash2, Check, Loader2, Tag, ChevronLeft, ArrowRight, Info, TrendingDown, TrendingUp, Minus, Plus } from "lucide-react";
import {
    fetchCustomPricing, saveCustomPricing, deleteCustomPricing as deleteCustomPricingApi, bulkClearCustomPricing,
} from "../../utils/api.js";
import { priceFromLevel, derivePriceBreakdown, percentFromCustomPrice, violatesMinUnitPrice, MIN_UNIT_PRICE, LEVEL_LABEL, LEVEL_FIELD, levelsFor } from "../../../shared/customPricing.js";
import ImageLightbox from "../ImageLightbox.jsx";
import { useWheelColumn, WheelColumn, ITEM_HEIGHT, InlineWheelField } from "../seller/listingForm/PriceWheelPicker.jsx";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)", ok: "#059669", okBg: "#EAF7F2",
    canvas: "#FFFFFF", warnBg: "#FDF3D8", warn: "#a16207", danger: "#D2462B", dangerBg: "#FDECEA",
};
const EASE = [0.16, 1, 0.3, 1];

function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }

function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }

// Shared label/color for a resulting percent change, everywhere it's shown.
// Positive percentValue (backend convention) = price decrease = discount.
// Negative percentValue = price increase.
function percentChangeLabel(pct) {
    const rounded = Math.round(Number(pct) * 10) / 10; // 1 decimal max, hides FP noise
    return rounded >= 0 ? `${rounded}% decrease` : `${Math.abs(rounded)}% increase`;
}

function ModeToggle({ mode, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button
                type="button"
                onClick={() => onChange("amount")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[11.5px] font-bold tracking-wide transition-colors"
                style={mode === "amount" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
            >
                <IndianRupee className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Amount</span>
            </button>
            <button
                type="button"
                onClick={() => onChange("percent")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-2 text-[11.5px] font-bold tracking-wide transition-colors"
                style={{
                    borderColor: C.hair,
                    background: mode === "percent" ? C.secondary : "transparent",
                    color: mode === "percent" ? "#fff" : C.muted,
                }}
            >
                <Percent className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Percent</span>
            </button>
        </div>
    );
}

// Explicit Decrease / Increase toggle for percent mode — replaces the old
// signed (+/-) input so the seller never has to interpret a sign; they pick
// a direction in words, and type a plain positive number.
function DirectionToggle({ direction, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button
                type="button"
                onClick={() => onChange("decrease")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[11.5px] font-bold tracking-wide transition-colors"
                style={direction === "decrease" ? { background: C.ok, color: "#fff" } : { color: C.muted }}
            >
                <TrendingDown className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Decrease</span>
            </button>
            <button
                type="button"
                onClick={() => onChange("increase")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-2 text-[11.5px] font-bold tracking-wide transition-colors"
                style={{
                    borderColor: C.hair,
                    background: direction === "increase" ? C.warn : "transparent",
                    color: direction === "increase" ? "#fff" : C.muted,
                }}
            >
                <TrendingUp className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Increase</span>
            </button>
        </div>
    );
}

// Plain-language helper — replaces percentChangeLabel's use inside the
// preview box. Literacy-first: leads with what actually happens in
// concrete rupees/behavior, percent is a small supporting detail only.
function priceChangeSummary(pct) {
    const rounded = Math.round(Number(pct) * 10) / 10;
    if (rounded > 0) {
        return {
            isDecrease: true,
            headline: "This buyer will pay LESS",
            caption: `${rounded}% less than your usual price`,
        };
    }
    if (rounded < 0) {
        return {
            isDecrease: false,
            headline: "This buyer will pay MORE",
            caption: `${Math.abs(rounded)}% more than your usual price`,
        };
    }
    return {
        isDecrease: true,
        headline: "Price is unchanged",
        caption: "Same as your usual price",
    };
}

function GstEntryToggle({ gstMode, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button
                type="button"
                onClick={() => onChange("incl")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[10.5px] font-bold tracking-wide transition-colors"
                style={gstMode === "incl" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
            >
                Price incl. GST
            </button>
            <button
                type="button"
                onClick={() => onChange("excl")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-1.5 text-[10.5px] font-bold tracking-wide transition-colors"
                style={{
                    borderColor: C.hair,
                    background: gstMode === "excl" ? C.secondary : "transparent",
                    color: gstMode === "excl" ? "#fff" : C.muted,
                }}
            >
                Price excl. GST
            </button>
        </div>
    );
}

function InlineNudgeButton({ icon: Icon, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 active:scale-90"
            style={{ borderColor: C.hair, color: C.secondary }}
        >
            <Icon className="h-3.5 w-3.5" />
        </button>
    );
}

// ---------------------------------------------------------------------
// Screen 1 — List
// ---------------------------------------------------------------------
function ListScreen({ rows, loading, query, setQuery, tab, setTab, selected, toggleSelect, onToggleSelectAll, onEditSingle, onEditSelected, onClearSelected, onClearAll, customCount, saveWarning, onDismissWarning }) {
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
        if (tab === "custom" && !r.override) return false;
        if (q && !r.name?.toLowerCase().includes(q) && !r.brandName?.toLowerCase().includes(q)) return false;
        return true;
    });
    const filteredIds = filtered.map((r) => r.submissionId);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));


    return (
        <>
            <div className="flex shrink-0 flex-col gap-2.5 border-b px-4 py-3 sm:px-5" style={{ borderColor: C.hairSoft }}>
                <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: C.hair }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…"
                        className="w-full min-w-0 bg-transparent text-[13px] font-medium tracking-wide outline-none" />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto">
                    <div className="flex shrink-0 gap-1 rounded-full p-0.5" style={{ background: C.hairSoft }}>
                        {[["all", `All (${rows.length})`], ["custom", `Custom (${customCount})`]].map(([v, label]) => (
                            <button key={v} onClick={() => setTab(v)}
                                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors sm:text-[11.5px]"
                                style={tab === v ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {filteredIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onToggleSelectAll(filteredIds, !allFilteredSelected)}
                            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-bold tracking-wide sm:text-[11.5px]"
                            style={{ color: C.secondary }}
                        >
                            <input type="checkbox" readOnly checked={allFilteredSelected} className="h-3.5 w-3.5 accent-[#006F83]" />
                            {allFilteredSelected ? "Deselect all" : "Select all"}
                        </button>
                    )}
                    {customCount > 0 && (
                        <button onClick={onClearAll} className="ml-auto shrink-0 whitespace-nowrap text-[11px] font-bold tracking-wide underline underline-offset-2 sm:text-[11.5px]" style={{ color: C.primary }}>
                            Clear all
                        </button>
                    )}
                </div>
            </div>

            {saveWarning && (
                <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11.5px] font-bold leading-snug tracking-wide sm:mx-5" style={{ background: C.warnBg, color: C.warn }}>
                    <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{saveWarning}</span>
                    <button onClick={onDismissWarning} className="shrink-0 text-[11px] underline underline-offset-2">Dismiss</button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 sm:px-5">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                ) : filtered.length === 0 ? (
                    <p className="py-16 text-center text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>No products match.</p>
                ) : (
                    <div className="flex flex-col divide-y" style={{ borderColor: C.hairSoft }}>
                        {filtered.map((row) => {
                            const pct = row.override ? percentFromCustomPrice(row.defaultPrice, row.effectivePrice) : null;
                            return (
                                <div key={row.submissionId} className="flex items-center gap-3 py-2.5">
                                    <input type="checkbox" checked={selected.has(row.submissionId)} onChange={() => toggleSelect(row.submissionId)}
                                        className="h-4 w-4 shrink-0 accent-[#006F83]" />
                                    <button
                                        type="button"
                                        onClick={() => row.image && setLightboxSrc(row.image)}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
                                        style={{ borderColor: C.hair, background: "#F4F5F6" }}
                                    >
                                        {row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : null}
                                    </button>
                                    <button onClick={() => onEditSingle(row.submissionId)} className="min-w-0 flex-1 text-left">
                                        <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{row.name}</p>
                                        {row.override ? (
                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold tracking-wide">
                                                <span style={{ color: C.muted, textDecoration: "line-through" }}>₹{inr(row.defaultBreakdown.perPack)}/pack</span>
                                                <ArrowRight className="h-3 w-3 shrink-0" style={{ color: C.muted }} />
                                                <span className="text-[11px]" style={{ color: C.secondary }}>₹{inr(row.effectiveBreakdown.perPack)}/pack</span>
                                            </p>
                                        ) : (
                                            <p className="truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                                ₹{inr(row.defaultBreakdown.perPack)}/pack
                                                {row.hasMasterPack ? ` · ₹${inr(row.defaultBreakdown.perMasterPack)}/master pack` : ""}
                                            </p>
                                        )}
                                    </button>
                                    <button onClick={() => onEditSingle(row.submissionId)}
                                        className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.secondary }}>
                                        Edit
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selected.size > 0 && (
                    <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        className="shrink-0 border-t px-4 py-3 sm:px-5" style={{ borderColor: C.hairSoft, background: C.canvas }}>
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 text-[12px] font-extrabold tracking-wide text-white" style={{ background: C.secondary }}>
                                {selected.size}
                            </span>
                            <span className="flex-1 text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>selected</span>
                            <button onClick={onClearSelected} className="shrink-0 text-[11.5px] font-bold tracking-wide underline underline-offset-2" style={{ color: C.muted }}>
                                Clear pricing
                            </button>
                            <button onClick={onEditSelected}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-[12.5px] font-bold tracking-wide text-white" style={{ background: C.secondary }}>
                                Set price <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />}

        </>
    );
}

// ---------------------------------------------------------------------
// Screen 2 — Edit. Each product: Amount/Percent toggle, and an inline
// scroll-wheel per value (same wheel + tap-to-type as the old popup,
// just embedded) right where the field used to be. Amount wheels step
// by 2% of that field's own default (reference) price; the percent
// wheel steps by a flat 1 percentage point. No per-field "Use" button —
// scrolling/typing updates the draft immediately, and Review changes →
// Confirm & save (bottom of the sheet) is the only save action.
// ---------------------------------------------------------------------
function ProductEditCard({ row, draft, onDraftChange }) {
    const levels = levelsFor(row);
    const invalid = draft.canonicalPrice != null && violatesMinUnitPrice(draft.canonicalPrice, row.packSize, row.masterPackSize);
    const preview = draft.canonicalPrice != null ? derivePriceBreakdown(draft.canonicalPrice, row.packSize, row.masterPackSize) : null;
    const appliedPercent = draft.canonicalPrice != null ? percentFromCustomPrice(row.defaultPrice, draft.canonicalPrice) : null;

    const hasPercent = draft.percentValue !== "" && draft.percentValue != null;
    // Explicit direction wins. Falls back to the sign of the stored value
    // (backend convention: positive = decrease/discount, negative = increase)
    // for drafts that were initialised from an already-saved price.
    const direction = draft.percentDirection
        ?? (hasPercent && Number(draft.percentValue) < 0 ? "increase" : "decrease");
    const percentAbs = hasPercent ? Math.abs(Number(draft.percentValue)) : "";

    const gstMode = draft.gstMode || "incl"; // "incl" | "excl" — how the seller is typing amounts in

    // The system stores/derives everything off the GST-inclusive price (same
    // convention as the default price). If the seller is typing GST-exclusive
    // amounts, gross them up by row.gstPercent before running through the
    // normal pack/master-pack math — that math never needs to know which mode
    // was used to type the number in.
    const toInclusive = (raw) => {
        const gst = Number(row.gstPercent) || 0;
        return gstMode === "excl" ? Number(raw) * (1 + gst / 100) : Number(raw);
    };
    const fromInclusive = (inclusiveVal) => {
        const gst = Number(row.gstPercent) || 0;
        return gstMode === "excl" ? inclusiveVal / (1 + gst / 100) : inclusiveVal;
    };

    const setFromAmount = (level, raw) => {
        onDraftChange(row.submissionId, (prev) => {
            const nextAmounts = { ...prev.amounts, [level]: raw };
            if (raw === "" || raw == null) return { ...prev, amounts: nextAmounts, canonicalPrice: null };
            const canonical = priceFromLevel(toInclusive(raw), level, row.packSize, row.masterPackSize);

            const bd = derivePriceBreakdown(canonical, row.packSize, row.masterPackSize);
            const pct = percentFromCustomPrice(row.defaultPrice, canonical);
            return {
                ...prev,
                canonicalPrice: canonical,
                percentValue: String(pct),
                // Keep the direction in sync with the amount that was typed.
                percentDirection: pct < 0 ? "increase" : pct > 0 ? "decrease" : (prev.percentDirection ?? "decrease"),
                amounts: {
                    unit: level === "unit" ? raw : String(round2(fromInclusive(bd.perBaseUnit)) ?? ""),
                    pack: level === "pack" ? raw : String(round2(fromInclusive(bd.perPack)) ?? ""),
                    master_pack: level === "master_pack" ? raw : (bd.perMasterPack != null ? String(round2(fromInclusive(bd.perMasterPack))) : ""),
                },
            };
        });
    };

    // Takes a direction ("decrease" | "increase") and an always-positive
    // magnitude, and converts to the signed value the backend/preview math
    // expects (positive = decrease). The direction is always recorded on the
    // draft — even when no magnitude has been typed yet — so tapping
    // "Increase" on an empty field is remembered.
    const setFromDirectionAndAbs = (nextDirection, absRaw) => {
        onDraftChange(row.submissionId, (prev) => {
            if (absRaw === "" || absRaw == null) {
                return { ...prev, percentDirection: nextDirection, percentValue: "", canonicalPrice: null };
            }
            const signed = nextDirection === "increase" ? -Math.abs(Number(absRaw)) : Math.abs(Number(absRaw));
            const canonical = Math.round(row.defaultPrice * (1 - signed / 100) * 100) / 100;
            const bd = derivePriceBreakdown(canonical, row.packSize, row.masterPackSize);
            return {
                ...prev,
                percentDirection: nextDirection,
                percentValue: String(signed),
                canonicalPrice: canonical,
                amounts: {
                    unit: String(bd.perBaseUnit ?? ""),
                    pack: String(bd.perPack ?? ""),
                    master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "",
                },
            };
        });
    };

    const clear = () => onDraftChange(row.submissionId, () => ({
        mode: "amount", amounts: { unit: "", pack: "", master_pack: "" }, percentValue: "", percentDirection: "decrease", canonicalPrice: null,
    }));

    // Back-calculate the default price into whatever level/basis is being
    // dialed, so each amount wheel is centred/stepped around the right
    // reference — same pattern the seller-listing price wheel used.
    const referenceForLevel = (level) => row.defaultBreakdown[LEVEL_FIELD[level]];

    return (
        <div className="flex flex-col gap-3 rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: invalid ? C.danger : C.hair }}>
            {/* Product header — image, name, default price, clear button */}
            <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: C.hair, background: "#F4F5F6" }}>
                    {row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{row.name}</p>
                    <p className="truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                        Default ₹{inr(row.defaultBreakdown.perPack)}/pack
                        {row.hasMasterPack ? ` · ₹${inr(row.defaultBreakdown.perMasterPack)}/master pack` : ""}
                    </p>
                </div>
                {draft.canonicalPrice != null && (
                    <button type="button" onClick={clear} className="shrink-0 rounded-lg p-1.5 hover:bg-black/5">
                        <Trash2 className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    </button>
                )}
            </div>

            {/* Notice — sits on its own full-width row under the header so it
                never squeezes the product name/image */}
            <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold leading-snug tracking-wide" style={{ background: C.warnBg, color: C.warn }}>
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                <span>
                    Setting a custom price for this buyer switches off any quantity discounts or price slabs on this product for them — they'll pay exactly this price, however much they order.
                </span>
            </p>

            <ModeToggle mode={draft.mode} onChange={(m) => onDraftChange(row.submissionId, (prev) => ({ ...prev, mode: m }))} />

            {draft.mode === "amount" && (
                <GstEntryToggle
                    gstMode={gstMode}
                    onChange={(nextMode) => onDraftChange(row.submissionId, (prev) => {
                        if (prev.canonicalPrice == null) return { ...prev, gstMode: nextMode };
                        // Re-express the already-entered amounts in the newly
                        // chosen mode, without changing the underlying (canonical,
                        // GST-inclusive) price at all.
                        const gst = Number(row.gstPercent) || 0;
                        const convert = (v) => {
                            if (v === "" || v == null) return v;
                            const inclusive = prev.gstMode === "excl" ? Number(v) * (1 + gst / 100) : Number(v);
                            const out = nextMode === "excl" ? inclusive / (1 + gst / 100) : inclusive;
                            return String(round2(out));
                        };
                        return {
                            ...prev,
                            gstMode: nextMode,
                            amounts: {
                                unit: convert(prev.amounts.unit),
                                pack: convert(prev.amounts.pack),
                                master_pack: convert(prev.amounts.master_pack),
                            },
                        };
                    })}
                />
            )}

            {draft.mode === "amount" ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${levels.length}, 1fr)` }}>
                    {levels.map((level) => {
                        const referenceInclusive = referenceForLevel(level);
                        const reference = gstMode === "excl" ? fromInclusive(referenceInclusive) : referenceInclusive;
                        const currentRaw = draft.amounts[level];
                        const currentVal = currentRaw !== "" && currentRaw != null ? Number(currentRaw) : reference;
                        const step = round2(reference * 0.02) || 1;
                        return (
                            <div key={`${level}-${gstMode}`} className="flex min-w-0 flex-col gap-1">
                                <span className="truncate text-center text-[9px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                    {LEVEL_LABEL[level](row.unit)} <span className="normal-case font-medium">({gstMode === "excl" ? "excl. GST" : "incl. GST"})</span>
                                </span>
                                <InlineWheelField
                                    seed={currentVal}
                                    step={step}
                                    filterFn={(v) => v > 0}
                                    formatValue={(v) => `₹${v.toLocaleString("en-IN")}`}
                                    prefix="₹"
                                    suffix={null}
                                    rangeMessage="Enter a price greater than ₹0."
                                    gridAnchor={reference}
                                    onCommit={(v) => setFromAmount(level, String(v))}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <DirectionToggle
                        direction={direction}
                        onChange={(nextDirection) => setFromDirectionAndAbs(nextDirection, percentAbs)}
                    />
                    <InlineWheelField
                        key={direction}
                        seed={percentAbs !== "" ? Number(percentAbs) : 0}
                        step={1}
                        filterFn={(v) => v >= 0 && v <= (direction === "increase" ? Infinity : 99)}
                        formatValue={(v) => `${v}%`}
                        prefix={null}
                        suffix="%"
                        rangeMessage={direction === "increase" ? "Enter a value of 0% or more." : "Enter a value between 0% and 99%."}
                        onCommit={(v) => setFromDirectionAndAbs(direction, String(v))}
                    />
                    <p className="flex items-start gap-1 text-[11px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                        <Info className="mt-[1px] h-3 w-3 shrink-0" />
                        <span>
                            Pick <span className="font-bold" style={{ color: C.ok }}>Decrease</span> for a discount, or <span className="font-bold" style={{ color: C.warn }}>Increase</span> to charge this buyer more, then scroll or tap the value to type a percent.
                        </span>
                    </p>
                </div>
            )}

            {invalid && (
                <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-snug tracking-wide" style={{ background: C.dangerBg, color: C.danger }}>
                    <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                    <span>That works out to below ₹{MIN_UNIT_PRICE} per {row.unit || "unit"} — raise the price to continue.</span>
                </p>
            )}

            {preview && !invalid && (() => {
                const summary = priceChangeSummary(appliedPercent);
                const tone = summary.isDecrease
                    ? { bg: C.okBg, fg: C.ok, Icon: TrendingDown }
                    : { bg: C.warnBg, fg: C.warn, Icon: TrendingUp };

                return (
                    <div className="flex flex-col gap-2.5 rounded-xl px-3 py-3" style={{ background: tone.bg }}>
                        {/* Headline — plain words, not a percentage, so the outcome is
                unmistakable at a glance regardless of reading level. */}
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${tone.fg}22` }}>
                                <tone.Icon className="h-4 w-4" style={{ color: tone.fg }} />
                            </span>
                            <div className="flex min-w-0 flex-col">
                                <span className="text-[13px] font-extrabold tracking-wide" style={{ color: tone.fg }}>
                                    {summary.headline}
                                </span>
                                <span className="text-[10.5px] font-semibold tracking-wide" style={{ color: tone.fg, opacity: 0.85 }}>
                                    {summary.caption}
                                </span>
                            </div>
                        </div>

                        {/* Before → After, per unit/pack/master pack, all in one row
                so the whole comparison is scannable at a glance. */}
                        <div className="grid gap-2 rounded-lg bg-white/60 px-2.5 py-2" style={{ gridTemplateColumns: `repeat(${levels.length}, 1fr)` }}>
                            {levels.map((level) => (
                                <div key={level} className="flex flex-col items-center gap-1 text-center">
                                    <span className="text-[10px] font-semibold tracking-wide" style={{ color: C.ink }}>
                                        Per {LEVEL_LABEL[level](row.unit)}
                                    </span>
                                    <span className="text-[10.5px] font-semibold tabular-nums tracking-wide" style={{ color: C.muted, textDecoration: "line-through" }}>
                                        ₹{inr(row.defaultBreakdown[LEVEL_FIELD[level]])}
                                    </span>
                                    <ArrowRight className="h-3 w-3 shrink-0 rotate-90" style={{ color: C.muted }} />
                                    <span className="text-[13px] font-extrabold tabular-nums tracking-wide" style={{ color: tone.fg }}>
                                        ₹{inr(preview[LEVEL_FIELD[level]])}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

// EditScreen — the "Review changes" button is now blocked while ANY
// visible card is in a violating state, and the bulk-percent apply skips
// (rather than silently saves) any product it would push below the floor.
function EditScreen({ selectedRows, drafts, onDraftChange, onReview, bulkDirection, setBulkDirection, bulkPercent, setBulkPercent, onApplyBulkPercent, bulkSkippedCount }) {
    const anyInvalid = selectedRows.some((row) => {
        const d = drafts[row.submissionId];
        return d?.canonicalPrice != null && violatesMinUnitPrice(d.canonicalPrice, row.packSize, row.masterPackSize);
    });

    return (
        <>
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                {selectedRows.length > 1 && (
                    <div className="mb-3 flex flex-col gap-1.5">
                        <div className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5" style={{ borderColor: C.hair, background: C.canvas }}>
                            <div className="flex items-center gap-2">
                                <Percent className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                <span className="shrink-0 text-[11.5px] font-bold tracking-wide" style={{ color: C.ink }}>Apply % to all</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="shrink-0">
                                    <DirectionToggle direction={bulkDirection} onChange={setBulkDirection} />
                                </div>
                                <input type="number" min="0" value={bulkPercent} onChange={(e) => setBulkPercent(e.target.value)}
                                    placeholder="e.g. 10"
                                    className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-bold tabular-nums tracking-wide outline-none" style={{ borderColor: C.hair }} />
                                <button onClick={onApplyBulkPercent} disabled={!bulkPercent}
                                    className="shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-bold tracking-wide text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                    Apply
                                </button>
                            </div>
                        </div>
                        {bulkSkippedCount > 0 && (
                            <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-snug tracking-wide" style={{ background: C.warnBg, color: C.warn }}>
                                <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                                <span>Skipped {bulkSkippedCount} product{bulkSkippedCount === 1 ? "" : "s"} — that percentage would take it below ₹{MIN_UNIT_PRICE}/unit. Set those individually.</span>
                            </p>
                        )}
                    </div>
                )}
                <div className="flex flex-col gap-3">
                    {selectedRows.map((row) => (
                        <ProductEditCard key={row.submissionId} row={row} draft={drafts[row.submissionId]} onDraftChange={onDraftChange} />
                    ))}
                </div>
            </div>
            <div className="shrink-0 border-t px-4 py-3 sm:px-5" style={{ borderColor: C.hairSoft }}>
                <button onClick={onReview} disabled={anyInvalid}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold tracking-wide text-white disabled:opacity-50" style={{ background: C.secondary }}>
                    {anyInvalid ? "Fix prices below the minimum first" : "Review changes"} {!anyInvalid && <ArrowRight className="h-4 w-4" />}
                </button>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------
// Screen 3 — Review
// ---------------------------------------------------------------------
function ReviewRow({ row, canonicalPrice }) {
    const after = derivePriceBreakdown(canonicalPrice, row.packSize, row.masterPackSize);
    const before = row.effectiveBreakdown;
    const levels = levelsFor(row);
    const pct = percentFromCustomPrice(row.defaultPrice, canonicalPrice);

    return (
        <div className="rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: C.hair }}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{row.name}</p>
                <span className="shrink-0 rounded-full px-2 py-[2px] text-[10px] font-bold tracking-wider" style={{ background: pct >= 0 ? C.okBg : C.warnBg, color: pct >= 0 ? C.ok : C.warn }}>
                    {percentChangeLabel(pct)}
                </span>
            </div>
            <div className="flex flex-col gap-1.5">
                {levels.map((level) => {
                    const field = LEVEL_FIELD[level];
                    const beforeVal = before[field];
                    const afterVal = after[field];
                    if (beforeVal == null && afterVal == null) return null;
                    return (
                        <div key={level} className="flex items-center justify-between gap-2 text-[12px] tracking-wide">
                            <span className="font-semibold" style={{ color: C.muted }}>{LEVEL_LABEL[level](row.unit)}</span>
                            <span className="flex items-center gap-1.5 font-bold tabular-nums">
                                <span style={{ color: C.muted, textDecoration: "line-through" }}>₹{inr(beforeVal)}</span>
                                <ArrowRight className="h-3 w-3 shrink-0" style={{ color: C.muted }} />
                                <span style={{ color: C.secondary }}>₹{inr(afterVal)}</span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ReviewScreen({ selectedRows, drafts, onConfirm, saving }) {
    const changed = selectedRows.filter((r) => drafts[r.submissionId]?.canonicalPrice != null);
    return (
        <>
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
                {changed.length === 0 ? (
                    <p className="py-16 text-center text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                        No price entered yet — go back and set at least one price.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {changed.map((row) => (
                            <ReviewRow key={row.submissionId} row={row} canonicalPrice={drafts[row.submissionId].canonicalPrice} />
                        ))}
                    </div>
                )}
            </div>
            <div className="shrink-0 border-t px-4 py-3 sm:px-5" style={{ borderColor: C.hairSoft }}>
                <button onClick={onConfirm} disabled={saving || changed.length === 0}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold tracking-wide text-white disabled:opacity-50" style={{ background: C.ok }}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirm &amp; save {changed.length ? `${changed.length} ` : ""}change{changed.length === 1 ? "" : "s"}
                </button>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------
export default function CustomPricingModal({ open, onClose, buyerId, buyerLabel, token }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState("all");
    const [selected, setSelected] = useState(new Set());
    const [screen, setScreen] = useState("list");
    const [editingIds, setEditingIds] = useState([]);
    const [bulkSkippedCount, setBulkSkippedCount] = useState(0);
    const [drafts, setDrafts] = useState({});
    const [bulkDirection, setBulkDirection] = useState("decrease");
    const [bulkPercent, setBulkPercent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveWarning, setSaveWarning] = useState(null);

    const load = useCallback(async () => {
        if (!buyerId) return;
        setLoading(true);
        const res = await fetchCustomPricing(token, buyerId);
        if (res?.success) setRows(res.items);
        console.log("res", res);
        setLoading(false);
    }, [buyerId, token]);

    useEffect(() => {
        if (open) { load(); setSelected(new Set()); setQuery(""); setScreen("list"); setDrafts({}); setBulkDirection("decrease"); setBulkPercent(""); setSaveWarning(null); }
    }, [open, load]);

    const rowById = useMemo(() => Object.fromEntries(rows.map((r) => [r.submissionId, r])), [rows]);

    const initDraftFor = (row) => {
        if (row.override) {
            // Backward-compatible read for rows saved under the old
            // fixed/lock model — displayed as an equivalent amount, but
            // will be re-saved as percent going forward like everything else.
            const canonical = row.effectivePrice;
            const bd = row.effectiveBreakdown;
            const pct = percentFromCustomPrice(row.defaultPrice, canonical);
            return {
                mode: "amount",
                canonicalPrice: canonical,
                percentValue: String(pct),
                percentDirection: pct < 0 ? "increase" : "decrease",
                amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
            };
        }
        return { mode: "amount", canonicalPrice: null, percentValue: "", percentDirection: "decrease", amounts: { unit: "", pack: "", master_pack: "" } };
    };

    const openEditor = (ids) => {
        const next = {};
        ids.forEach((id) => { if (rowById[id]) next[id] = initDraftFor(rowById[id]); });
        setDrafts(next);
        setEditingIds(ids);
        setBulkSkippedCount(0);
        setBulkDirection("decrease");
        setBulkPercent("");
        setSaveWarning(null);
        setScreen("edit");
    };

    const toggleSelect = (id) => setSelected((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });

    const toggleSelectAll = (ids, shouldSelect) => setSelected((s) => {
        const next = new Set(s);
        ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
        return next;
    });

    const handleDraftChange = (submissionId, updater) => setDrafts((prev) => ({ ...prev, [submissionId]: updater(prev[submissionId]) }));

    const applyBulkPercent = () => {
        const abs = Number(bulkPercent);
        if (!Number.isFinite(abs)) return;
        const pct = bulkDirection === "increase" ? -Math.abs(abs) : Math.abs(abs);
        let skipped = 0;
        setDrafts((prev) => {
            const next = { ...prev };
            editingIds.forEach((id) => {
                const row = rowById[id];
                if (!row) return;
                const canonical = Math.round(row.defaultPrice * (1 - pct / 100) * 100) / 100;
                if (violatesMinUnitPrice(canonical, row.packSize, row.masterPackSize)) {
                    skipped += 1;
                    return; // leave this product's draft untouched — no silent bad write
                }
                const bd = derivePriceBreakdown(canonical, row.packSize, row.masterPackSize);
                next[id] = {
                    mode: "percent",
                    canonicalPrice: canonical,
                    percentValue: String(pct),
                    percentDirection: bulkDirection,
                    amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
                };
            });
            return next;
        });
        setBulkSkippedCount(skipped);
    };

    const confirmSave = async () => {
        const items = editingIds
            .map((id) => ({ id, row: rowById[id], draft: drafts[id] }))
            .filter((x) => x.draft?.canonicalPrice != null)
            .filter((x) => !violatesMinUnitPrice(x.draft.canonicalPrice, x.row.packSize, x.row.masterPackSize))
            .map(({ id, row, draft }) => ({
                submissionId: id,
                // Amount mode: the seller typed an exact number — send it as
                // "fixed" so it's stored and charged byte-for-byte as entered.
                // Percent mode: no absolute number was ever entered, so percent
                // IS the source of truth here — send it as "percent".
                overrideType: draft.mode === "amount" ? "fixed" : "percent",
                value: draft.mode === "amount" ? draft.canonicalPrice : Number(draft.percentValue),
                inputMode: draft.mode === "amount" ? "fixed_price" : "percent",
            }));

        if (!items.length) return;
        setSaving(true);
        const res = await saveCustomPricing(token, buyerId, items);
        setSaving(false);
        if (res?.rejected?.length) {
            setSaveWarning(`${res.rejected.length} product${res.rejected.length === 1 ? "" : "s"} couldn't be saved — price would go below ₹${MIN_UNIT_PRICE}/unit.`);
        } else {
            setSaveWarning(null);
        }
        await load();
        setSelected(new Set());
        setScreen("list");
    };

    const clearSelected = async () => {
        if (!selected.size) return;
        await bulkClearCustomPricing(token, buyerId, [...selected]);
        setSelected(new Set());
        await load();
    };

    const clearAll = async () => {
        await bulkClearCustomPricing(token, buyerId);
        setSelected(new Set());
        await load();
    };

    const customCount = rows.filter((r) => r.override).length;
    const editingRows = editingIds.map((id) => rowById[id]).filter(Boolean);
    const titleForScreen = { list: "Custom pricing", edit: "Set pricing", review: "Review & confirm" }[screen];

    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
                    <motion.div
                        className="flex h-[94vh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:h-[85vh] sm:max-w-2xl sm:rounded-[18px]"
                        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }} onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex shrink-0 justify-center pb-1 pt-2 sm:hidden">
                            <span className="h-1 w-9 rounded-full" style={{ background: C.hair }} />
                        </div>

                        <div className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3 sm:px-5" style={{ borderColor: C.hairSoft }}>
                            {screen !== "list" && (
                                <button onClick={() => setScreen(screen === "review" ? "edit" : "list")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5">
                                    <ChevronLeft className="h-4.5 w-4.5" style={{ color: C.ink }} />
                                </button>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider" style={{ color: C.secondary }}>
                                    <Tag className="h-3 w-3" /> {buyerLabel}
                                </p>
                                <h2 className="truncate text-[16px] font-bold tracking-wide sm:text-[17px]" style={{ color: C.ink }}>{titleForScreen}</h2>
                                {screen === "list" ? (
                                    <p className="text-[11px] font-medium tracking-wide sm:text-[11.5px]" style={{ color: C.muted }}>
                                        {customCount} of {rows.length} product{rows.length === 1 ? "" : "s"} custom priced
                                    </p>
                                ) : (
                                    <p className="text-[11px] font-medium tracking-wide sm:text-[11.5px]" style={{ color: C.muted }}>
                                        {editingIds.length} product{editingIds.length === 1 ? "" : "s"}
                                    </p>
                                )}
                            </div>
                            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5 sm:h-9 sm:w-9">
                                <X className="h-4 w-4 sm:h-4.5 sm:w-4.5" style={{ color: C.muted }} />
                            </button>
                        </div>

                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={screen}
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -12 }}
                                transition={{ duration: 0.18, ease: EASE }}
                                className="flex flex-1 flex-col overflow-hidden"
                            >
                                {screen === "list" && (
                                    <ListScreen
                                        rows={rows} loading={loading} query={query} setQuery={setQuery} tab={tab} setTab={setTab}
                                        selected={selected} toggleSelect={toggleSelect}
                                        onToggleSelectAll={toggleSelectAll}
                                        onEditSingle={(id) => openEditor([id])}
                                        onEditSelected={() => openEditor([...selected])}
                                        onClearSelected={clearSelected}
                                        onClearAll={clearAll}
                                        customCount={customCount}
                                        saveWarning={saveWarning}
                                        onDismissWarning={() => setSaveWarning(null)}
                                    />
                                )}
                                {screen === "edit" && (
                                    <EditScreen
                                        selectedRows={editingRows} drafts={drafts} onDraftChange={handleDraftChange}
                                        onReview={() => setScreen("review")}
                                        bulkDirection={bulkDirection} setBulkDirection={setBulkDirection}
                                        bulkPercent={bulkPercent} setBulkPercent={setBulkPercent} onApplyBulkPercent={applyBulkPercent}
                                        bulkSkippedCount={bulkSkippedCount}
                                    />
                                )}
                                {screen === "review" && (
                                    <ReviewScreen selectedRows={editingRows} drafts={drafts} onConfirm={confirmSave} saving={saving} />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}