// components/seller/listingForm/ProductBuyerPricing.jsx
//
// Product-centric counterpart to CustomPricingModal.jsx (buyer-centric:
// pick a buyer, see every product priced for them). This shows the
// reverse — for the product currently open in the listing form, which
// buyers have a custom price on THIS product, plus an inline editor to
// add one for a new buyer or change an existing one.
//
// Reuses the exact same pure pricing functions (derivePriceBreakdown /
// priceFromLevel / percentFromCustomPrice / violatesMinUnitPrice) and the
// exact same save/delete endpoints as CustomPricingModal, so a price set
// here and a price set from the chat page always resolve to the same
// stored number — this is just a different lens on the same
// buyer_seller_custom_prices rows.
//
// Buyer identity (name/logo) is resolved from the seller's own chat
// conversations (ChatContext) instead of a fresh network call — custom
// pricing only makes sense for a buyer the seller already talks to, and
// the conversation list is already loaded/cached, so this stays instant.
import { useCallback, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from "react";
import { Search, Plus, Trash2, Loader2, ChevronDown, ChevronUp, AlertTriangle, TrendingDown, TrendingUp, X, Percent, IndianRupee, Info } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { useChatContext } from "../../../context/ChatContext.jsx";
import { fetchCustomPricingForSubmission, saveCustomPricing, deleteCustomPricing as deleteCustomPricingApi } from "../../../utils/api.js";
import {
    derivePriceBreakdown, percentFromCustomPrice, priceFromLevel,
    violatesMinUnitPrice, MIN_UNIT_PRICE, LEVEL_LABEL, LEVEL_FIELD, levelsFor,
} from "../../../../shared/customPricing.js";
import { InlineWheelField } from "./PriceWheelPicker.jsx";
import { C } from "./FormPrimitives.jsx";

function inr(n) { return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }
function initials(name) { return (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join(""); }

function emptyDraft() {
    return { mode: "amount", gstMode: "incl", amounts: { unit: "", pack: "", master_pack: "" }, percentValue: "", percentDirection: "decrease", canonicalPrice: null };
}

function draftFromOverride(buyer, product) {
    const canonical = buyer.effectivePrice;
    const bd = buyer.effectiveBreakdown;
    const pct = percentFromCustomPrice(product.defaultPrice, canonical);
    return {
        mode: "amount", gstMode: "incl", canonicalPrice: canonical,
        percentValue: String(pct), percentDirection: pct < 0 ? "increase" : "decrease",
        amounts: {
            unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""),
            master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "",
        },
    };
}

function GstEntryToggle({ gstMode, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button type="button" onClick={() => onChange("incl")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[10.5px] font-bold tracking-wide transition-colors"
                style={gstMode === "incl" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                Price incl. GST
            </button>
            <button type="button" onClick={() => onChange("excl")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-1.5 text-[10.5px] font-bold tracking-wide transition-colors"
                style={{ borderColor: C.hair, background: gstMode === "excl" ? C.secondary : "transparent", color: gstMode === "excl" ? "#fff" : C.muted }}>
                Price excl. GST
            </button>
        </div>
    );
}

function ModeToggle({ mode, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button type="button" onClick={() => onChange("amount")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-bold tracking-wide transition-colors"
                style={mode === "amount" ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                <IndianRupee className="h-3 w-3 shrink-0" /> Amount
            </button>
            <button type="button" onClick={() => onChange("percent")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-1.5 text-[11px] font-bold tracking-wide transition-colors"
                style={{ borderColor: C.hair, background: mode === "percent" ? C.secondary : "transparent", color: mode === "percent" ? "#fff" : C.muted }}>
                <Percent className="h-3 w-3 shrink-0" /> Percent
            </button>
        </div>
    );
}

function DirectionToggle({ direction, onChange }) {
    return (
        <div className="flex w-full overflow-hidden rounded-lg border" style={{ borderColor: C.hair }}>
            <button type="button" onClick={() => onChange("decrease")}
                className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-bold tracking-wide transition-colors"
                style={direction === "decrease" ? { background: "#059669", color: "#fff" } : { color: C.muted }}>
                <TrendingDown className="h-3 w-3 shrink-0" /> Decrease
            </button>
            <button type="button" onClick={() => onChange("increase")}
                className="flex flex-1 items-center justify-center gap-1.5 border-l px-2 py-1.5 text-[11px] font-bold tracking-wide transition-colors"
                style={{ borderColor: C.hair, background: direction === "increase" ? "#a16207" : "transparent", color: direction === "increase" ? "#fff" : C.muted }}>
                <TrendingUp className="h-3 w-3 shrink-0" /> Increase
            </button>
        </div>
    );
}

// Math mirrors ProductEditCard in CustomPricingModal.jsx exactly (same
// shared helper functions) — a price entered here and one entered from
// the chat page always resolve to the identical stored number.
function BuyerPriceEditor({ product, draft, setDraft }) {
    const levels = levelsFor(product);
    const invalid = draft.canonicalPrice != null && violatesMinUnitPrice(draft.canonicalPrice, product.packSize, product.masterPackSize);
    const preview = draft.canonicalPrice != null ? derivePriceBreakdown(draft.canonicalPrice, product.packSize, product.masterPackSize) : null;
    const appliedPercent = draft.canonicalPrice != null ? percentFromCustomPrice(product.defaultPrice, draft.canonicalPrice) : null;

    const hasPercent = draft.percentValue !== "" && draft.percentValue != null;
    const direction = draft.percentDirection ?? (hasPercent && Number(draft.percentValue) < 0 ? "increase" : "decrease");
    const percentAbs = hasPercent ? Math.abs(Number(draft.percentValue)) : "";
    const gstMode = draft.gstMode || "incl";

    const toInclusive = (raw) => {
        const gst = Number(product.gstPercent) || 0;
        return gstMode === "excl" ? Number(raw) * (1 + gst / 100) : Number(raw);
    };
    const fromInclusive = (inclusiveVal) => {
        const gst = Number(product.gstPercent) || 0;
        return gstMode === "excl" ? inclusiveVal / (1 + gst / 100) : inclusiveVal;
    };

    // NEW — the actual toggle handler. Re-expresses the already-committed
    // canonical (GST-inclusive) price into the newly chosen mode by running
    // it back through derivePriceBreakdown ONCE and converting all three
    // levels off that single source of truth — never by re-converting each
    // field's own typed string independently, which compounds rounding
    // error and is exactly what made the three levels look "out of sync"
    // with each other after a toggle.
    const handleGstModeChange = (nextMode) => {
        setDraft((prev) => {
            if (prev.canonicalPrice == null) return { ...prev, gstMode: nextMode };
            const gst = Number(product.gstPercent) || 0;
            const bd = derivePriceBreakdown(prev.canonicalPrice, product.packSize, product.masterPackSize);
            const convert = (inclusiveVal) => (nextMode === "excl" ? inclusiveVal / (1 + gst / 100) : inclusiveVal);
            return {
                ...prev,
                gstMode: nextMode,
                amounts: {
                    unit: String(round2(convert(bd.perBaseUnit)) ?? ""),
                    pack: String(round2(convert(bd.perPack)) ?? ""),
                    master_pack: bd.perMasterPack != null ? String(round2(convert(bd.perMasterPack))) : "",
                },
            };
        });
    };

    const setFromAmount = (level, raw) => {
        setDraft((prev) => {
            const nextAmounts = { ...prev.amounts, [level]: raw };
            if (raw === "" || raw == null) return { ...prev, amounts: nextAmounts, canonicalPrice: null };
            const canonical = priceFromLevel(toInclusive(raw), level, product.packSize, product.masterPackSize);
            const bd = derivePriceBreakdown(canonical, product.packSize, product.masterPackSize);
            const pct = percentFromCustomPrice(product.defaultPrice, canonical);
            return {
                ...prev, canonicalPrice: canonical, percentValue: String(pct),
                percentDirection: pct < 0 ? "increase" : pct > 0 ? "decrease" : (prev.percentDirection ?? "decrease"),
                amounts: {
                    unit: level === "unit" ? raw : String(round2(fromInclusive(bd.perBaseUnit)) ?? ""),
                    pack: level === "pack" ? raw : String(round2(fromInclusive(bd.perPack)) ?? ""),
                    master_pack: level === "master_pack" ? raw : (bd.perMasterPack != null ? String(round2(fromInclusive(bd.perMasterPack))) : ""),
                },
            };
        });
    };

    const setFromDirectionAndAbs = (nextDirection, absRaw) => {
        setDraft((prev) => {
            if (absRaw === "" || absRaw == null) return { ...prev, percentDirection: nextDirection, percentValue: "", canonicalPrice: null };
            const signed = nextDirection === "increase" ? -Math.abs(Number(absRaw)) : Math.abs(Number(absRaw));
            const canonical = Math.round(product.defaultPrice * (1 - signed / 100) * 100) / 100;
            const bd = derivePriceBreakdown(canonical, product.packSize, product.masterPackSize);
            return {
                ...prev, percentDirection: nextDirection, percentValue: String(signed), canonicalPrice: canonical,
                amounts: { unit: String(bd.perBaseUnit ?? ""), pack: String(bd.perPack ?? ""), master_pack: bd.perMasterPack != null ? String(bd.perMasterPack) : "" },
            };
        });
    };

    const referenceForLevel = (level) => product.defaultBreakdown[LEVEL_FIELD[level]];

    return (
        <div className="flex flex-col gap-2.5">
            {/* NEW — matches CustomPricingModal's notice, so the two feel
                like the same feature reached from two different places. */}
            <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10.5px] font-semibold leading-snug tracking-wide" style={{ background: "#FDF3D8", color: "#a16207" }}>
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                <span>Setting a custom price switches off quantity discounts / price slabs on this product for this buyer — they'll pay exactly this price, however much they order.</span>
            </p>

            <ModeToggle mode={draft.mode} onChange={(m) => setDraft((prev) => ({ ...prev, mode: m }))} />

            {draft.mode === "amount" && (
                <GstEntryToggle gstMode={gstMode} onChange={handleGstModeChange} />
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
                            // key includes gstMode: forces a clean remount on toggle
                            // instead of relying on InlineWheelField's echo-vs-external
                            // grace-period heuristic to notice a same-field seed swap —
                            // same reasoning CustomPricingModal's ProductEditCard uses.
                            <div key={`${level}-${gstMode}`} className="flex min-w-0 flex-col gap-1">
                                <span className="truncate text-center text-[9px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                    {LEVEL_LABEL[level](product.unit)} <span className="normal-case font-medium">({gstMode === "excl" ? "excl. GST" : "incl. GST"})</span>
                                </span>
                                <InlineWheelField
                                    seed={currentVal} step={step} filterFn={(v) => v > 0}
                                    formatValue={(v) => `₹${v.toLocaleString("en-IN")}`}
                                    prefix="₹" suffix={null} rangeMessage="Enter a price greater than ₹0."
                                    gridAnchor={reference}
                                    onCommit={(v) => setFromAmount(level, String(v))}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    <DirectionToggle direction={direction} onChange={(d) => setFromDirectionAndAbs(d, percentAbs)} />
                    <InlineWheelField
                        key={direction}
                        seed={percentAbs !== "" ? Number(percentAbs) : 0}
                        step={1}
                        filterFn={(v) => v >= 0 && v <= (direction === "increase" ? Infinity : 99)}
                        formatValue={(v) => `${v}%`}
                        prefix={null} suffix="%"
                        rangeMessage={direction === "increase" ? "Enter a value of 0% or more." : "Enter a value between 0% and 99%."}
                        onCommit={(v) => setFromDirectionAndAbs(direction, String(v))}
                    />
                </div>
            )}

            {invalid && (
                <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10.5px] font-bold leading-snug tracking-wide" style={{ background: "#FDECEA", color: "#D2462B" }}>
                    <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                    That works out to below ₹{MIN_UNIT_PRICE} per {product.unit || "unit"}.
                </p>
            )}

            {preview && !invalid && (
                <div className="grid gap-2 rounded-lg px-2.5 py-2" style={{ background: C.hairSoft, gridTemplateColumns: `repeat(${levels.length}, 1fr)` }}>
                    {levels.map((level) => (
                        <div key={level} className="flex flex-col items-center gap-0.5 text-center">
                            <span className="text-[9px] font-semibold tracking-wide" style={{ color: C.muted }}>{LEVEL_LABEL[level](product.unit)}</span>
                            <span className="text-[9.5px] font-semibold tabular-nums" style={{ color: C.muted, textDecoration: "line-through" }}>
                                ₹{inr(product.defaultBreakdown[LEVEL_FIELD[level]])}
                            </span>
                            <span className="text-[12px] font-extrabold tabular-nums" style={{ color: appliedPercent >= 0 ? "#059669" : "#a16207" }}>
                                ₹{inr(preview[LEVEL_FIELD[level]])}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function BuyerRow({ buyer, product, buyerDirectory, isEditing, onToggleEdit, draft, setDraft, onDelete, deleting, isPending }) {
    const identity = buyerDirectory.get(buyer.buyerId);
    const name = identity?.name || "Buyer";
    const isDeleted = identity?.isDeleted;
    const pct = percentFromCustomPrice(product.defaultPrice, buyer.effectivePrice);

    return (
        <div className="rounded-xl border" style={{ borderColor: C.hair }}>
            <button type="button" onClick={onToggleEdit} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                <span className="relative h-8 w-8 shrink-0">
                    {identity?.logo ? (
                        <img src={identity.logo} alt="" className="h-8 w-8 rounded-full object-cover" style={{ border: `1px solid ${C.hair}` }} />
                    ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}>
                            {initials(name)}
                        </span>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                        {name} {isDeleted && <span className="text-[9px] font-bold uppercase" style={{ color: "#c71f11" }}>· deleted</span>}
                        {isPending && (
                            <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wide" style={{ background: "#FEF3C7", color: "#A16207" }}>
                                Unsaved
                            </span>
                        )}
                    </p>
                    <p className="truncate text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        ₹{inr(buyer.effectiveBreakdown.perPack)}/pack
                        <span className="ml-1" style={{ color: pct >= 0 ? "#059669" : "#a16207" }}>
                            ({pct >= 0 ? `${Math.round(pct)}% off` : `${Math.abs(Math.round(pct))}% up`})
                        </span>
                    </p>
                </div>
                {isEditing ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: C.muted }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: C.muted }} />}
            </button>

            {isEditing && (
                <div className="flex flex-col gap-2.5 border-t px-3 py-3" style={{ borderColor: C.hairSoft }}>
                    <BuyerPriceEditor product={product} draft={draft} setDraft={setDraft} />
                    {!buyer.isDraftOnly && (
                        <button type="button" onClick={onDelete} disabled={deleting}
                            className="flex items-center gap-1.5 self-start rounded-lg border px-3 py-2 text-[11px] font-bold tracking-wide disabled:opacity-60" style={{ borderColor: C.hair, color: "#c71f11" }}>
                            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
                        </button>
                    )}
                    <p className="text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        Saved when you press "Save" / "Update" at the bottom of the form.
                    </p>
                </div>
            )}
        </div>
    );
}

const ProductBuyerPricing = forwardRef(function ProductBuyerPricing({ submissionId }, ref) {
    const { token } = useAuth();
    const { conversations } = useChatContext();

    const [loading, setLoading] = useState(true);
    const [product, setProduct] = useState(null);
    const [buyers, setBuyers] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerQuery, setPickerQuery] = useState("");
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        if (!submissionId || !token) return;
        setLoading(true);
        fetchCustomPricingForSubmission(token, submissionId).then((res) => {
            if (res?.success) { setProduct(res.product); setBuyers(res.buyers); }
            else setError(res?.message || "Couldn't load custom pricing.");
            setLoading(false);
        });
    }, [submissionId, token]);

    useEffect(() => { load(); }, [load]);

    const buyerDirectory = useMemo(() => {
        const map = new Map();
        conversations.forEach((c) => { if (c.otherUserId) map.set(c.otherUserId, { name: c.otherShopName, logo: c.otherShopLogo, isDeleted: c.otherIsDeletedSeller }); });
        return map;
    }, [conversations]);

    const pricedIds = useMemo(() => new Set(buyers.map((b) => b.buyerId)), [buyers]);
    const pickerCandidates = useMemo(() => {
        const q = pickerQuery.trim().toLowerCase();
        return conversations
            .filter((c) => c.otherUserId && !pricedIds.has(c.otherUserId) && !c.otherIsDeletedSeller)
            .filter((c) => !q || (c.otherShopName || "").toLowerCase().includes(q))
            .sort((a, b) => (a.otherShopName || "").localeCompare(b.otherShopName || "", "en", { sensitivity: "base" }));
    }, [conversations, pricedIds, pickerQuery]);

    const openExisting = (buyerId) => {
        if (editingId === buyerId) { setEditingId(null); return; }
        const buyer = buyers.find((b) => b.buyerId === buyerId);
        setDrafts((d) => ({ ...d, [buyerId]: d[buyerId] || draftFromOverride(buyer, product) }));
        setEditingId(buyerId);
    };

    const startNew = (buyerId) => {
        setPickerOpen(false);
        setPickerQuery("");
        setBuyers((prev) => (prev.some((b) => b.buyerId === buyerId) ? prev : [
            { buyerId, effectivePrice: product.defaultPrice, effectiveBreakdown: product.defaultBreakdown, isDraftOnly: true },
            ...prev,
        ]));
        setDrafts((d) => ({ ...d, [buyerId]: emptyDraft() }));
        setEditingId(buyerId);
    };

    const setDraftFor = (buyerId, updater) => setDrafts((prev) => ({ ...prev, [buyerId]: updater(prev[buyerId]) }));

    const remove = async (buyerId) => {
        setDeletingId(buyerId);
        setBuyers((prev) => prev.filter((b) => b.buyerId !== buyerId)); // optimistic
        setDrafts((d) => { const next = { ...d }; delete next[buyerId]; return next; });
        await deleteCustomPricingApi(token, buyerId, submissionId);
        setDeletingId(null);
        setEditingId(null);
        load();
    };

    // Replaces the per-row Save. Called by whatever parent form embeds
    // this component, right before its own submit completes — same
    // pattern as BuyerAccessPricing's flushPendingChanges. Handles both
    // an edited EXISTING buyer's price and a brand-new draft-only buyer
    // added via "Set a price for another buyer".
    const flushPendingChanges = useCallback(async () => {
        const pendingIds = Object.keys(drafts).filter((buyerId) => {
            const draft = drafts[buyerId];
            if (!draft?.canonicalPrice) return false;
            const buyer = buyers.find((b) => b.buyerId === buyerId);
            return !buyer || buyer.isDraftOnly || buyer.effectivePrice !== draft.canonicalPrice;
        });
        if (!pendingIds.length) return { success: true };

        let allOk = true;
        for (const buyerId of pendingIds) {
            const draft = drafts[buyerId];
            const item = {
                submissionId,
                overrideType: draft.mode === "amount" ? "fixed" : "percent",
                value: draft.mode === "amount" ? draft.canonicalPrice : Number(draft.percentValue),
                inputMode: draft.mode === "amount" ? "fixed_price" : "percent",
            };
            const res = await saveCustomPricing(token, buyerId, [item]);
            if (res?.rejected?.length || (!res?.success && !res?.saved)) {
                allOk = false;
                setError(res?.rejected?.length
                    ? `That price would go below ₹${MIN_UNIT_PRICE}/unit for one or more buyers — nothing was saved for them.`
                    : (res?.message || "Couldn't save one or more buyer prices."));
            }
        }
        setEditingId(null);
        load();
        return { success: allOk };
    }, [drafts, buyers, submissionId, token, load]);

    useImperativeHandle(ref, () => ({ flushPendingChanges }), [flushPendingChanges]);

    if (!submissionId) return null;

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>
                Set a different price on this product for specific buyers you already chat with. Everyone else pays the price above.
            </p>

            {error && (
                <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-snug tracking-wide" style={{ background: "#FDECEA", color: "#D2462B" }}>
                    <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {error}
                </p>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} /></div>
            ) : (
                <div className="flex flex-col gap-2">
                    {buyers.length === 0 && (
                        <p className="rounded-lg px-3 py-2.5 text-[11.5px] font-medium" style={{ background: C.hairSoft, color: C.muted }}>
                            No buyer has a custom price on this product yet.
                        </p>
                    )}
                    {buyers.map((b) => (
                        <BuyerRow
                            key={b.buyerId} buyer={b} product={product} buyerDirectory={buyerDirectory}
                            isEditing={editingId === b.buyerId}
                            onToggleEdit={() => openExisting(b.buyerId)}
                            draft={drafts[b.buyerId] || emptyDraft()}
                            setDraft={(updater) => setDraftFor(b.buyerId, updater)}
                            onDelete={() => remove(b.buyerId)}
                            deleting={deletingId === b.buyerId}
                            isPending={!!(drafts[b.buyerId]?.canonicalPrice != null && (b.isDraftOnly || drafts[b.buyerId].canonicalPrice !== b.effectivePrice))}
                        />
                    ))}
                </div>
            )}

            {!loading && product && (!pickerOpen ? (
                <button type="button" onClick={() => setPickerOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-[11.5px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.secondary }}>
                    <Plus className="h-3.5 w-3.5" /> Set a price for another buyer
                </button>
            ) : (
                <div className="flex flex-col gap-2 rounded-xl border p-2.5" style={{ borderColor: C.hair }}>
                    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: C.hair }}>
                        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                        <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search buyers you chat with…" autoFocus
                            className="w-full min-w-0 bg-transparent text-[13px] font-medium tracking-wide outline-none" />
                        <button type="button" onClick={() => { setPickerOpen(false); setPickerQuery(""); }}><X className="h-3.5 w-3.5" style={{ color: C.muted }} /></button>
                    </div>
                    <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                        {pickerCandidates.length === 0 ? (
                            <p className="px-1 py-2 text-[11.5px] font-medium" style={{ color: C.muted }}>
                                {conversations.length === 0 ? "You don't have any buyer chats yet." : "No matches, or everyone you chat with already has a price set."}
                            </p>
                        ) : pickerCandidates.map((c) => (
                            <button key={c.otherUserId} type="button" onClick={() => startNew(c.otherUserId)}
                                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-black/[0.03]">
                                <span className="relative h-7 w-7 shrink-0">
                                    {c.otherShopLogo ? (
                                        <img src={c.otherShopLogo} alt="" className="h-7 w-7 rounded-full object-cover" style={{ border: `1px solid ${C.hair}` }} />
                                    ) : (
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[9.5px] font-extrabold text-white" style={{ background: "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}>
                                            {initials(c.otherShopName)}
                                        </span>
                                    )}
                                </span>
                                <span className="truncate text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>{c.otherShopName || "Buyer"}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
});

export default ProductBuyerPricing;