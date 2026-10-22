import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import {
    Search, Trash2, Loader2, ChevronDown, Info, ChevronUp, AlertTriangle, TrendingDown, TrendingUp, X, Percent, IndianRupee, UserPlus, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import {
    fetchListingAccess, setListingVisibilityMode, addListingVisibilityBuyer,
    removeListingVisibilityBuyer, searchEligibleBuyers, saveCustomPricingForBuyer,
    deleteCustomPricingForBuyer,
} from "../../../utils/sellerListingApi.js";
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

// Renders explicitly whenever mode === "amount" — this is the actual
// control that was missing before. gstMode itself was always computed
// and even used in the math (toInclusive/fromInclusive), but nothing
// ever rendered a way to change it, so it sat permanently at "incl".
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

// Identical math to ProductBuyerPricing's/CustomPricingModal's editor —
// same shared helpers — so a price set here resolves to the same stored
// number regardless of which surface set it.
function BuyerPriceEditor({ product, draft, setDraft }) {
    const levels = levelsFor(product);
    // const invalid = draft.canonicalPrice != null && violatesMinUnitPrice(draft.canonicalPrice, product.packSize, product.masterPackSize);
    const invalid = draft.canonicalPrice != null && !(draft.canonicalPrice > 0);
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

function BuyerRow({ buyer, product, mode, isEditing, onToggleEdit, draft, setDraft, onDelete, onRemoveAccess, onDiscard, deleting, removingAccess, isPending }) {
    const name = buyer.shopName || buyer.name || "Buyer";
    const pct = buyer.override ? percentFromCustomPrice(product.defaultPrice, buyer.effectivePrice) : null;

    return (
        <div className="rounded-xl border" style={{ borderColor: C.hair }}>
            <button type="button" onClick={onToggleEdit} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}>
                    {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                        {name}
                        {isPending && (
                            <span className="ml-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wide" style={{ background: "#FEF3C7", color: "#A16207" }}>
                                Unsaved
                            </span>
                        )}
                    </p>
                    <p className="truncate text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {buyer.phone || buyer.email || "—"}

                    </p>
                    <p className="truncate text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        {buyer.override && (
                            <span style={{ color: pct >= 0 ? "#059669" : "#a16207" }}>
                                ₹{inr(buyer.effectiveBreakdown?.perPack)}/pack ({pct >= 0 ? `${Math.round(pct)}% off` : `${Math.abs(Math.round(pct))}% up`})
                            </span>
                        )}
                    </p>
                </div>
                {mode === "restricted" && buyer.hasVisibilityGrant && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onRemoveAccess(); }}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold tracking-wide"
                        style={{ background: "rgba(199,31,17,0.08)", color: removingAccess ? C.muted : "#c71f11" }}
                    >
                        {removingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove access"}
                    </span>
                )}
                {isEditing ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: C.muted }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: C.muted }} />}
            </button>

            {isEditing && (
                <div className="flex flex-col gap-2.5 border-t px-3 py-3" style={{ borderColor: C.hairSoft }}>
                    <BuyerPriceEditor product={product} draft={draft} setDraft={setDraft} />
                    {buyer.override && (
                        <button type="button" onClick={onDelete} disabled={deleting}
                            className="flex items-center gap-1.5 self-start rounded-lg border px-3 py-2 text-[11px] font-bold tracking-wide disabled:opacity-60" style={{ borderColor: C.hair, color: "#c71f11" }}>
                            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove price
                        </button>
                    )}
                    {!buyer.override && mode === "public" && onDiscard && (
                        <button type="button" onClick={onDiscard}
                            className="flex items-center gap-1.5 self-start rounded-lg border px-3 py-2 text-[11px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.muted }}>
                            <X className="h-3.5 w-3.5" /> Remove buyer
                        </button>
                    )}

                </div>
            )}
        </div>
    );
}

function SearchDropdown({ anchorRef, open, children }) {
    const [rect, setRect] = useState(null);

    useEffect(() => {
        if (!open) return;
        const update = () => {
            const el = anchorRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setRect({ top: r.bottom + 4, left: r.left, width: r.width });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open, anchorRef]);

    if (!open || !rect) return null;
    return createPortal(
        <div
            className="fixed z-[999] max-h-56 overflow-y-auto rounded-xl border bg-white shadow-lg"
            style={{ top: rect.top, left: rect.left, width: rect.width, borderColor: C.hair }}
        >
            {children}
        </div>,
        document.body
    );
}

function DraftBuyerAccessPricing({ product, value, onChange }) {
    const { token } = useAuth();
    const [editingId, setEditingId] = useState(null);
    const [drafts, setDrafts] = useState({}); // per-buyer BuyerPriceEditor working state

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const searchInputRef = useRef(null);
    const debounceRef = useRef(null);

    const mode = value.mode;
    const buyers = value.buyers || [];

    const setMode = (m) => onChange({ ...value, mode: m });

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length < 2) { setResults([]); setDropdownOpen(false); return; }
        setSearching(true);
        setDropdownOpen(true);
        debounceRef.current = setTimeout(async () => {
            // No submissionId to exclude-by yet — pass null; dedupe
            // against already-added buyers on the client instead.
            const res = await searchEligibleBuyers(token, query.trim(), null);
            const already = new Set(buyers.map((b) => b.buyerId));
            setResults(res?.success ? res.buyers.filter((b) => !already.has(b.buyer_id)) : []);
            setSearching(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, token, buyers]);

    const addBuyer = (candidate) => {
        setQuery(""); setDropdownOpen(false);
        onChange({
            ...value,
            buyers: [
                ...buyers,
                {
                    buyerId: candidate.buyer_id, name: candidate.name, phone: candidate.phone,
                    email: candidate.email, shopName: candidate.shop_name, override: null,
                },
            ].sort((a, b) => (a.shopName || a.name || "").localeCompare(b.shopName || b.name || "")),
        });
    };


    const addBuyerForPricing = (candidate) => {
        setQuery(""); setDropdownOpen(false);

        const existing = buyers.find((b) => b.buyerId === candidate.buyer_id);
        if (existing) {
            openExisting(candidate.buyer_id, existing);
            return;
        }

        const newBuyer = {
            buyerId: candidate.buyer_id, name: candidate.name, phone: candidate.phone,
            email: candidate.email, shopName: candidate.shop_name, override: null,
            pendingPricing: true,
        };


        onChange({
            ...value,
            buyers: [...buyers, newBuyer].sort((a, b) => (a.shopName || a.name || "").localeCompare(b.shopName || b.name || "")),
        });

        openExisting(candidate.buyer_id, newBuyer);
    };

    const removeBuyer = (buyerId) => {
        onChange({ ...value, buyers: buyers.filter((b) => b.buyerId !== buyerId) });
        setEditingId((id) => (id === buyerId ? null : id));
        setDrafts((d) => { const next = { ...d }; delete next[buyerId]; return next; });
    };

    const openExisting = (buyerId, buyerOverride) => {
        if (editingId === buyerId) { setEditingId(null); return; }
        const buyer = buyerOverride || buyers.find((b) => b.buyerId === buyerId);
        if (!buyer) return;
        setDrafts((d) => ({ ...d, [buyerId]: d[buyerId] || (buyer.override ? { ...emptyDraft(), ...buyer.override } : emptyDraft()) }));
        setEditingId(buyerId);
    };

    // Every price edit commits STRAIGHT into `value.buyers[].override` —
    // there's no server round trip in draft mode, so there's nothing to
    // "flush" later. The final Submit just reads this straight off form state.
    const setDraftFor = (buyerId, updater) => {
        setDrafts((prev) => {
            const nextDraft = updater(prev[buyerId] || emptyDraft());
            onChange({
                ...value,
                buyers: buyers.map((b) => (b.buyerId === buyerId ? { ...b, override: nextDraft.canonicalPrice != null ? nextDraft : null } : b)),
            });
            return { ...prev, [buyerId]: nextDraft };
        });
    };

    const clearPrice = (buyerId) => {
        onChange({ ...value, buyers: buyers.map((b) => (b.buyerId === buyerId ? { ...b, override: null } : b)) });
        setDrafts((d) => { const next = { ...d }; delete next[buyerId]; return next; });
    };

    const visibleList = mode === "restricted"
        ? buyers
        : buyers.filter((b) => b.override || b.pendingPricing);

    return (
        <div className="flex flex-col gap-3">
            <div className="text-[11.5px] text-justify font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>
                Choose who can see this listing, and set a different price for specific buyers. Everyone else pays the price above.
            </div>

            <div className="flex gap-1 rounded-full p-0.5 w-fit" style={{ background: C.hairSoft }}>
                {[{ value: "public", label: "Full Visibility" }, { value: "restricted", label: "Selected buyers only" }].map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setMode(opt.value)}
                        className="rounded-full px-3 py-1.5 text-[11.5px] font-bold tracking-wide"
                        style={mode === opt.value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}>
                        {opt.label}
                    </button>
                ))}
            </div>

            {mode === "restricted" && buyers.length === 0 && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-semibold tracking-wide" style={{ background: "rgba(199,31,17,0.06)", color: "#b91c1c" }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    No buyers added yet — this listing will be invisible to everyone until you add at least one below.
                </div>
            )}

            {(
                <div className="relative">
                    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: C.hair }}>
                        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                        <input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => query.trim().length >= 2 && setDropdownOpen(true)}
                            placeholder={mode === "restricted"
                                ? "Search buyers to grant access…"
                                : "Search a buyer to set a custom price…"}
                            className="w-full min-w-0 bg-transparent text-[12.5px] font-medium tracking-wide outline-none" />
                        {query && <button type="button" onClick={() => { setQuery(""); setDropdownOpen(false); }}><X className="h-3.5 w-3.5" style={{ color: C.muted }} /></button>}
                    </div>
                    <SearchDropdown anchorRef={searchInputRef} open={dropdownOpen}>
                        {searching ? (
                            <p className="flex items-center gap-2 px-3 py-2.5 text-[11.5px] font-semibold" style={{ color: C.muted }}><Loader2 className="h-3 w-3 animate-spin" /> Searching…</p>
                        ) : results.length === 0 ? (
                            <p className="px-3 py-2.5 text-[11.5px] font-semibold" style={{ color: C.muted }}>No matching buyers.</p>
                        ) : results.map((b) => (
                            <button key={b.buyer_id} type="button" onClick={() => (mode === "restricted" ? addBuyer(b) : addBuyerForPricing(b))}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-black/[0.03]">
                                <div className="min-w-0">
                                    <p className="truncate text-[12.5px] font-bold" style={{ color: C.ink }}>{b.shop_name || b.name || "Buyer"}</p>
                                    <p className="truncate text-[10.5px] font-medium" style={{ color: C.muted }}>{[b.phone, b.email].filter(Boolean).join(" · ") || "—"}</p>
                                </div>
                                <UserPlus className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                            </button>
                        ))}
                    </SearchDropdown>
                </div>
            )}

            {visibleList.length === 0 ? (
                <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                    {mode === "restricted" ? "Add a buyer above to grant access." : "No custom prices set for any buyer yet."}
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {visibleList.map((buyer) => (
                        <BuyerRow
                            key={buyer.buyerId}
                            buyer={{ ...buyer, effectivePrice: buyer.override?.canonicalPrice ?? product.defaultPrice, effectiveBreakdown: buyer.override ? derivePriceBreakdown(buyer.override.canonicalPrice, product.packSize, product.masterPackSize) : product.defaultBreakdown }}
                            product={product}
                            mode={mode}
                            isEditing={editingId === buyer.buyerId}
                            onToggleEdit={() => openExisting(buyer.buyerId)}
                            draft={drafts[buyer.buyerId] || emptyDraft()}
                            setDraft={(updater) => setDraftFor(buyer.buyerId, updater)}
                            onDelete={() => clearPrice(buyer.buyerId)}
                            onRemoveAccess={() => removeBuyer(buyer.buyerId)}
                            onDiscard={() => removeBuyer(buyer.buyerId)}
                            deleting={false}
                            removingAccess={false}
                            isPending={false}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const BuyerAccessPricing = forwardRef(function BuyerAccessPricing(
    { submissionId, draftMode = false, product, value, onChange },
    ref
) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null); // { submission, buyers }
    const [error, setError] = useState(null);
    const [savingMode, setSavingMode] = useState(false);
    const [deletingBuyerId, setDeletingBuyerId] = useState(null);
    const [removingAccessId, setRemovingAccessId] = useState(null);

    const [editingId, setEditingId] = useState(null);
    const [drafts, setDrafts] = useState({});

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const searchInputRef = useRef(null);
    const debounceRef = useRef(null);

    const load = useCallback((opts = {}) => {
        if (!opts.silent) setLoading(true);
        fetchListingAccess(token, submissionId).then((res) => {
            if (res?.success) { setData(res); setError(null); }
            else setError(res?.message || "Couldn't load buyer access.");
            if (!opts.silent) setLoading(false);
        });
    }, [token, submissionId]);

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [submissionId]);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length < 2) { setResults([]); setDropdownOpen(false); return; }
        setSearching(true);
        setDropdownOpen(true);
        debounceRef.current = setTimeout(async () => {
            const res = await searchEligibleBuyers(token, query.trim(), submissionId);
            setResults(res?.success ? res.buyers : []);
            setSearching(false);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, token, submissionId]);

    // ── DRAFT MODE: no submissionId exists yet — everything lives in
    // `value` (lifted into SellerListingForm's form state) and every
    // mutation goes through onChange instead of an API call.
    if (draftMode) {
        return (
            <DraftBuyerAccessPricing
                product={product}
                value={value || { mode: "public", buyers: [] }}
                onChange={onChange}
            />
        );
    }

    const handleModeChange = (mode) => {
        const prev = data;
        setData((d) => ({ ...d, submission: { ...d.submission, visibilityMode: mode } }));
        setSavingMode(true);
        setListingVisibilityMode(token, submissionId, mode).then((res) => {
            setSavingMode(false);
            if (res?.success) load({ silent: true });
            else setData(prev);
        });
    };

    const handleAddBuyer = (candidate) => {
        setResults((r) => r.filter((b) => b.buyer_id !== candidate.buyer_id));
        setQuery("");
        setDropdownOpen(false);
        const prev = data;
        setData((d) => {
            if (d.buyers.some((b) => b.buyerId === candidate.buyer_id)) return d;
            return {
                ...d,
                buyers: [
                    ...d.buyers,
                    {
                        buyerId: candidate.buyer_id, name: candidate.name, phone: candidate.phone,
                        email: candidate.email, shopName: candidate.shop_name,
                        hasVisibilityGrant: true, grantedAt: new Date().toISOString(),
                        override: null, effectivePrice: d.submission.defaultPrice,
                        effectiveBreakdown: d.submission.defaultBreakdown,
                    },
                ].sort((a, b) => (a.shopName || a.name || "").localeCompare(b.shopName || b.name || "")),
            };
        });
        addListingVisibilityBuyer(token, submissionId, candidate.buyer_id).then((res) => {
            if (res?.success) load({ silent: true });
            else setData(prev);
        });
    };

    // Public mode: the buyer can already see the listing — "adding" them
    // here just opens the price editor for them, with no visibility
    // grant call at all. If they don't already have a row in data.buyers,
    // synthesize one locally (no API call needed — nothing is granted or
    // changed on the backend until an actual price is saved).
    const handleAddBuyerForPricing = (candidate) => {
        setQuery("");
        setDropdownOpen(false);

        const existing = data.buyers.find((b) => b.buyerId === candidate.buyer_id);
        if (existing) {
            openExisting(candidate.buyer_id, existing);
            return;
        }

        const newBuyer = {
            buyerId: candidate.buyer_id, name: candidate.name, phone: candidate.phone,
            email: candidate.email, shopName: candidate.shop_name,
            hasVisibilityGrant: false, grantedAt: null,
            override: null, effectivePrice: data.submission.defaultPrice,
            effectiveBreakdown: data.submission.defaultBreakdown,
            // Marks this row as "explicitly added by the seller to set a
            // price for" — the only thing keeping it visible in public
            // mode before an override is actually saved. Without this,
            // the row's visibility depended on editingId matching, which
            // disappears the instant the seller collapses the row.
            pendingPricing: true,
        };


        setData((d) => ({
            ...d,
            buyers: [...d.buyers, newBuyer].sort((a, b) => (a.shopName || a.name || "").localeCompare(b.shopName || b.name || "")),
        }));

        // Pass newBuyer directly — data.buyers won't reflect it until the
        // next render, so looking it up from `data` here would find nothing.
        openExisting(candidate.buyer_id, newBuyer);
    };

    // FIX: removing access now does two things in one action — revokes
    // visibility AND clears any custom price the buyer had on this
    // listing. Previously it only ever called removeListingVisibilityBuyer
    // and left an override in place if one existed, which is exactly the
    // "orphaned negotiated price for someone who can no longer even see
    // the listing" state that made this feel broken. The optimistic
    // update now removes the row outright (rather than leaving a stale
    // copy around waiting on a silent reload to catch up), and both
    // network calls are awaited together so a partial failure rolls the
    // whole thing back instead of silently half-succeeding.
    const handleRemoveAccess = (buyerId) => {
        const prev = data;
        const buyer = data.buyers.find((b) => b.buyerId === buyerId);
        const hadOverride = !!buyer?.override;

        setRemovingAccessId(buyerId);
        setData((d) => ({ ...d, buyers: d.buyers.filter((b) => b.buyerId !== buyerId) }));
        setEditingId((id) => (id === buyerId ? null : id));
        setDrafts((d) => { const next = { ...d }; delete next[buyerId]; return next; });

        const calls = [removeListingVisibilityBuyer(token, submissionId, buyerId)];
        if (hadOverride) calls.push(deleteCustomPricingForBuyer(token, buyerId, submissionId));

        Promise.all(calls).then((results) => {
            setRemovingAccessId(null);
            const allOk = results.every((res) => res?.success);
            if (allOk) load({ silent: true });
            else { setData(prev); setError("Couldn't remove this buyer's access — please try again."); }
        });
    };

    const openExisting = (buyerId, buyerOverride) => {
        if (editingId === buyerId) { setEditingId(null); return; }
        const buyer = buyerOverride || data.buyers.find((b) => b.buyerId === buyerId);
        if (!buyer) return; // safety net — should never happen now, but never crash if it does
        setDrafts((d) => ({ ...d, [buyerId]: d[buyerId] || (buyer.override ? draftFromOverride(buyer, data.submission) : emptyDraft()) }));
        setEditingId(buyerId);
    };

    const setDraftFor = (buyerId, updater) => setDrafts((prev) => ({ ...prev, [buyerId]: updater(prev[buyerId]) }));

    const handleClearPrice = (buyerId) => {
        const prev = data;
        setDeletingBuyerId(buyerId);
        setData((d) => ({
            ...d,
            buyers: d.buyers
                .map((b) => (b.buyerId === buyerId ? { ...b, override: null, effectivePrice: d.submission.defaultPrice, effectiveBreakdown: d.submission.defaultBreakdown } : b))
                .filter((b) => b.buyerId !== buyerId || b.hasVisibilityGrant),
        }));
        deleteCustomPricingForBuyer(token, buyerId, submissionId).then((res) => {
            setDeletingBuyerId(null);
            if (res?.success) load({ silent: true });
            else setData(prev);
        });
    };

    // Discards a buyer that was added purely to set a price for, before
    // any price was actually saved. Nothing exists on the backend for
    // this buyer/listing pair yet (no visibility grant, no override), so
    // this is pure local cleanup — no API calls needed or made.
    const handleDiscardPendingBuyer = (buyerId) => {
        setData((d) => ({ ...d, buyers: d.buyers.filter((b) => b.buyerId !== buyerId) }));
        setEditingId((id) => (id === buyerId ? null : id));
        setDrafts((d) => { const next = { ...d }; delete next[buyerId]; return next; });
    };

    // Replaces the per-row Save. Called by SellerListingForm's own submit
    // button — this section has no Save of its own. Only pushes buyers
    // whose draft price actually differs from what's currently stored.
    const flushPendingChanges = useCallback(async () => {
        const pendingIds = Object.keys(drafts).filter((buyerId) => {
            const draft = drafts[buyerId];
            if (!draft?.canonicalPrice) return false;
            const buyer = data?.buyers.find((b) => b.buyerId === buyerId);
            return !buyer || buyer.effectivePrice !== draft.canonicalPrice;
        });
        if (!pendingIds.length) return { success: true };

        let allOk = true;
        for (const buyerId of pendingIds) {
            const draft = drafts[buyerId];
            // Direction comes from the actual price vs. the listing price, not from a signed string.
            const isIncrease = Number(draft.canonicalPrice) > Number(data.submission.defaultPrice);
            const asFixed = draft.mode === "amount" || isIncrease;
            const item = {
                submissionId,
                overrideType: asFixed ? "fixed" : "percent",
                value: asFixed ? draft.canonicalPrice : Number(draft.percentValue),
                inputMode: asFixed ? "fixed_price" : "percent",
            };
            console.log("FLUSH", { buyerId, mode: draft.mode, dir: draft.percentDirection, percentValue: draft.percentValue, canonical: draft.canonicalPrice, default: data.submission.defaultPrice, item });
            const res = await saveCustomPricingForBuyer(token, buyerId, [item]);
            if (res?.rejected?.length || (!res?.success && !res?.saved)) {
                allOk = false;
                setError(res?.rejected?.length
                    ? `That price would go below ₹${MIN_UNIT_PRICE}/unit for one or more buyers — nothing was saved for them.`
                    : (res?.message || "Couldn't save one or more buyer prices."));
            }
        }
        setEditingId(null);
        load({ silent: true });
        return { success: allOk };
    }, [drafts, data, submissionId, token, load]);

    useImperativeHandle(ref, () => ({ flushPendingChanges }), [flushPendingChanges]);

    if (loading) {
        return <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>Loading buyer access…</p>;
    }
    if (error && !data) {
        return <p className="text-[12px] font-semibold tracking-wide" style={{ color: "#c71f11" }}>{error}</p>;
    }

    const mode = data.submission.visibilityMode;
    const grantedBuyers = data.buyers.filter((b) => b.hasVisibilityGrant);
    const visibleList = mode === "restricted"
        ? data.buyers
        : data.buyers.filter((b) => b.override || b.pendingPricing);

    return (
        <div className="flex flex-col gap-3">
            <div className="text-[11.5px] text-justify font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>
                Choose who can see this listing, and set a different price for specific buyers. Everyone else pays the price above.
                <p className="flex items-start mt-2 gap-1.5 text-[11px] font-semibold leading-snug tracking-wide" style={{ color: "#b45309" }}>
                    <Info className="mt-0 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Setting a custom price for this buyer switches off any quantity discounts or price slabs on this product for them — they'll pay exactly this price, however much they order.
                    </span>
                </p>

            </div>

            <div className="flex gap-1 rounded-full p-0.5 w-fit" style={{ background: C.hairSoft }}>
                {[{ value: "public", label: "Full Visibility" }, { value: "restricted", label: "Partial Visibility" }].map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleModeChange(opt.value)}
                        className="rounded-full px-3 py-1.5 text-[11.5px] font-bold tracking-wide transition-colors duration-150"
                        style={mode === opt.value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {error && (
                <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold leading-snug tracking-wide" style={{ background: "#FDECEA", color: "#D2462B" }}>
                    <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" /> {error}
                </p>
            )}

            {mode === "restricted" && grantedBuyers.length === 0 && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11.5px] font-semibold tracking-wide" style={{ background: "rgba(199,31,17,0.06)", color: "#b91c1c" }}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    No buyers added yet — this listing is invisible to everyone until you add at least one below.
                </div>
            )}

            {(
                <div className="relative">
                    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: C.hair }}>
                        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                        <input
                            ref={searchInputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => query.trim().length >= 2 && setDropdownOpen(true)}
                            placeholder={mode === "restricted"
                                ? "Search buyers to grant access…"
                                : "Search a buyer to set a custom price…"}

                            className="w-full min-w-0 bg-transparent text-[12.5px] font-medium tracking-wide outline-none"
                        />
                        {query && (
                            <button type="button" onClick={() => { setQuery(""); setDropdownOpen(false); }}>
                                <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                            </button>
                        )}
                    </div>

                    <SearchDropdown anchorRef={searchInputRef} open={dropdownOpen}>
                        {searching ? (
                            <p className="flex items-center gap-2 px-3 py-2.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                            </p>
                        ) : results.length === 0 ? (
                            <p className="px-3 py-2.5 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>No matching buyers.</p>
                        ) : (
                            results.map((b) => (
                                <button
                                    key={b.buyer_id}
                                    type="button"
                                    onClick={() => (mode === "restricted" ? handleAddBuyer(b) : handleAddBuyerForPricing(b))}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-black/[0.03]"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{b.shop_name || b.name || "Buyer"}</p>
                                        <p className="truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                            {[b.phone, b.email].filter(Boolean).join(" · ") || "—"}
                                        </p>
                                    </div>
                                    <UserPlus className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                </button>
                            ))
                        )}
                    </SearchDropdown>
                </div>
            )}

            {visibleList.length === 0 ? (
                <p className="text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                    {mode === "restricted" ? "Add a buyer above to grant access." : "No custom prices set for any buyer yet."}
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {visibleList.map((buyer) => (
                        <BuyerRow
                            key={buyer.buyerId}
                            buyer={buyer}
                            product={data.submission}
                            mode={mode}
                            isEditing={editingId === buyer.buyerId}
                            onToggleEdit={() => openExisting(buyer.buyerId)}
                            draft={drafts[buyer.buyerId] || emptyDraft()}
                            setDraft={(updater) => setDraftFor(buyer.buyerId, updater)}
                            onDelete={() => handleClearPrice(buyer.buyerId)}
                            onRemoveAccess={() => handleRemoveAccess(buyer.buyerId)}
                            onDiscard={() => handleDiscardPendingBuyer(buyer.buyerId)}
                            deleting={deletingBuyerId === buyer.buyerId}
                            removingAccess={removingAccessId === buyer.buyerId}
                            isPending={!!(drafts[buyer.buyerId]?.canonicalPrice != null && drafts[buyer.buyerId].canonicalPrice !== buyer.effectivePrice)}
                        />
                    ))}
                </div>
            )}

            {mode === "public" && (
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                    <ShieldCheck className="h-3 w-3" /> Switch to "Only selected buyers" to hide this listing from everyone else.
                </p>
            )}
        </div>
    );
});

export default BuyerAccessPricing;