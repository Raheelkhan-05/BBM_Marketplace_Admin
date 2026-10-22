// pages/BrandItemSellersPage.jsx
//
// Step 3 of the drill-down: sellers listing THIS exact brand item
// (seller_product_submissions, via catalog_brand_item_sellers so it can
// never leak a different variant's sellers in).
//
// This page mirrors HomeProductFeed's inline SellerDropdown, which is the
// actively-maintained implementation. Everything below is intentionally an
// identical copy (not imported from a shared module yet) so the dropdown and
// this full page can never quietly disagree on "what does this seller
// actually charge" or "who can buy / edit what":
//
//   - Three sort tabs (Min MOQ / Best price / Fastest delivery). "Min MOQ"
//     and "Fastest delivery" are sorted SERVER-SIDE; "Best price" is sorted
//     client-side over the loaded pages (known, accepted limitation).
//     "Fastest delivery" only shows once the buyer's destination is known.
//   - GST with/without toggle, slab + quantity-discount price resolution.
//   - Price labels exactly like the feed ("/Pc", "/10 Pc", "/50 Pc"; the
//     pack row is skipped when a pack is 1 unit).
//   - Login-gated pricing (blurred prices + "Login to view").
//   - Mobile (< md): price + "Swipe to buy" slider; row taps are swallowed
//     so the slider is the only way to start a purchase. md+: "Buy now".
//   - Buying opens BuyNowModal straight away; BuyNowModal resolves the
//     shipping address + transport preference itself (same as the feed).
//   - Out-of-stock sellers sink to the bottom under an "Out of stock" label.
//   - Sellers that don't ship to the buyer's selected address show
//     "NOT DELIVERABLE" with no buy action (module-level 60s cache).
//   - Your OWN listing row: price/promotion editor (slide-to-confirm saves
//     price and/or promotion together) + "Edit listing".
//   - Realtime listing:update patches, reconcile, visibility resync and a
//     15s poll when the socket is down.
//   - Login redirect sends the FULL current URL back via state.from.
//
// If HomeProductFeed's pricing/seller helpers ever change, this file needs the
// matching update. Worth extracting them to a shared module the next time
// either one changes, rather than editing two copies.
//
// IMPORTANT: this file assumes `fetchBrandItemSellers` returns the richer
// commercial fields (price_slabs, quantity_discounts, stock_quantity,
// stock_type, dispatch_time_days, production_lead_time_days, gst_percent,
// pack_size, units_per_master_pack, is_own, is_custom_priced,
// marketing_commission_percent, total_delivery_days when a destination was
// passed, ...). Missing fields fall back to "no slabs / no extra terms".

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { ArrowLeft, MapPin, Truck, Boxes, Store, Lock, Zap, Ban, Pencil, X, ChevronRight, Loader2 } from "lucide-react";
import { fetchBrandItemSellers, updateSellerProductSubmission, fetchOrderConstraints } from "../utils/api";
import { useBuyerAddress } from "../context/BuyerAddressContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import useInfiniteScrollSentinel from "../hooks/useInfiniteScrollSentinel";
import BuyNowModal from "../components/BuyNowModal";
import SellThisItemModal from "../components/catalog/SellThisItemModal";
import PromotionPlanModal, { PromotionRow, savePromotionPlan, saveResultMessage } from "../components/seller/listingForm/PromotionPlanModal.jsx";
import { InlineWheelField } from "../components/seller/listingForm/PriceWheelPicker.jsx";
import EditListingModal from "../components/seller/listingForm/EditListingModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { deriveDisplayPrices, hasOuterPack, getSaleUnit, round2 } from "../shared/packUnits.js";
import { checkLocationServiceable } from "../shared/orderConstraints.js";
import { toBuyerSellerPayload } from "../utils/buyerSellerPayload";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#000000", secondary: "#000000",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];
const PAGE_SIZE = 24;
const MAX_RELOAD_SIZE = 96;
// After a realtime in-place patch, wait this long then silently re-sync with
// the server (picks up slabs/discounts the patch lacked).
const RECONCILE_DELAY_MS = 800;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (identical to HomeProductFeed)
// ─────────────────────────────────────────────────────────────────────────────

const SELLER_SORT_OPTIONS = [
    { value: "min_moq", label: "Min MOQ" },
    { value: "best_price", label: "Best price" },
    { value: "fastest_delivery", label: "Fastest delivery" },
];

function sortModeToApiSort(sortMode) {
    if (sortMode === "min_moq") return "moq_asc";
    if (sortMode === "fastest_delivery") return "fastest_delivery";
    return "price_asc";
}

function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const UNIT_SHORT = {
    pieces: "Pc", piece: "Pc", kg: "Kg", grams: "G", gram: "G",
    litres: "L", litre: "L", millilitres: "ml", millilitre: "ml",
    dozen: "doz", tons: "T", ton: "T",
};
function shortUnit(unit) {
    if (!unit) return "";
    return UNIT_SHORT[String(unit).trim().toLowerCase()] || String(unit);
}
function fmtQty(n) {
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function priceUnitLabel(masterPackSize) {
    return Number(masterPackSize) >= 1 ? "master pack" : "pack";
}

function resolveSlabUnitPrice(priceSlabs, quantity, fallbackPrice) {
    if (!Array.isArray(priceSlabs) || !priceSlabs.length) return fallbackPrice;
    const applicable = priceSlabs
        .filter((s) => Number(s.minQty) > 0 && quantity >= Number(s.minQty) && (!s.maxQty || quantity <= Number(s.maxQty)))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].price) : fallbackPrice;
}
function resolveDiscountPercent(quantityDiscounts, quantity) {
    if (!Array.isArray(quantityDiscounts) || !quantityDiscounts.length) return 0;
    const applicable = quantityDiscounts
        .filter((d) => Number(d.minQty) > 0 && quantity >= Number(d.minQty))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    return applicable.length ? Number(applicable[0].discountPercent) || 0 : 0;
}
function moqInSaleUnits(seller) {
    return Math.max(1, Number(seller.moq) || 1);
}

// Single definition of "out of stock" — list order, row styling and badge
// all use this so they can never disagree.
function isSellerOutOfStock(s) {
    return s.stock_type === "ready_stock" && Number(s.stock_quantity) < moqInSaleUnits(s);
}

// Single source of truth for "what does this seller actually charge at qty X".
function computeEffectivePricing(seller, saleQty, includeGst) {
    const gst = Number(seller.gst_percent) || 0;
    const pricePerSaleUnit = includeGst ? Number(seller.price) : Number(seller.price) / (1 + gst / 100);
    if (!(pricePerSaleUnit > 0)) return null;

    const slabPricePerSaleUnit = resolveSlabUnitPrice(seller.price_slabs, saleQty, pricePerSaleUnit);
    const discountPercent = resolveDiscountPercent(seller.quantity_discounts, saleQty);
    const finalPricePerSaleUnit = slabPricePerSaleUnit * (1 - discountPercent / 100);

    const orig = deriveDisplayPrices(slabPricePerSaleUnit, seller.pack_size, seller.units_per_master_pack);
    const fin = deriveDisplayPrices(finalPricePerSaleUnit, seller.pack_size, seller.units_per_master_pack);
    const outer = hasOuterPack(seller.units_per_master_pack);

    const packQty = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterQty = outer ? packQty * Number(seller.units_per_master_pack) : null;

    return {
        saleUnit: getSaleUnit(seller.units_per_master_pack), saleQty, discountPercent, hasMasterPack: outer,
        packQty, masterQty,
        unit: { original: orig.perBaseUnit, final: fin.perBaseUnit },
        pack: { original: orig.perPack, final: fin.perPack },
        masterPack: outer ? { original: orig.perMasterPack, final: fin.perMasterPack } : null,
    };
}

// "Best price" only: search every real breakpoint (MOQ + every slab/discount
// minQty at or above it) for the lowest achievable price.
function candidateSaleQuantities(seller) {
    const moq = moqInSaleUnits(seller);
    const quantities = new Set([moq]);
    (seller.price_slabs || []).forEach((s) => { const q = Number(s.minQty); if (q >= moq) quantities.add(q); });
    (seller.quantity_discounts || []).forEach((d) => { const q = Number(d.minQty); if (q >= moq) quantities.add(q); });
    return Array.from(quantities).sort((a, b) => a - b);
}
function bestAchievablePricing(seller, includeGst) {
    const quantities = candidateSaleQuantities(seller);
    let best = null;
    for (const qty of quantities) {
        const pricing = computeEffectivePricing(seller, qty, includeGst);
        if (!pricing) continue;
        if (!best || pricing.pack.final < best.pack.final) best = pricing;
    }
    return best || computeEffectivePricing(seller, moqInSaleUnits(seller), includeGst);
}
function sellerPricingForMode(seller, sortMode, includeGst) {
    if (sortMode === "min_moq") return computeEffectivePricing(seller, moqInSaleUnits(seller), includeGst);
    return bestAchievablePricing(seller, includeGst); // best_price + fastest_delivery
}

function isOwnSellerRow(sellerRow, currentUserId) {
    if (sellerRow?.is_own === true) return true;
    if (!currentUserId) return false;
    const ownerId = sellerRow?.shop_slug ?? null;
    return ownerId != null && String(ownerId) === String(currentUserId);
}

function mergeUniqueSellers(prev, incoming) {
    const seen = new Set(prev.map((s) => s.submission_id));
    const deduped = incoming.filter((s) => {
        if (seen.has(s.submission_id)) return false;
        seen.add(s.submission_id);
        return true;
    });
    return [...prev, ...deduped];
}

function threeTierFromSaleUnit(perSaleUnit, packSize, masterPackSize, hasOuter) {
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterPackSize);
    return { unit: d.perBaseUnit, pack: d.perPack, master: hasOuter ? d.perMasterPack : null };
}
function saleUnitFromLevel(level, value, packSize, masterPackSize, hasOuter) {
    if (level === "unit") return hasOuter ? value * packSize * masterPackSize : value * packSize;
    if (level === "pack") return hasOuter ? value * masterPackSize : value;
    return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERABILITY (identical to HomeProductFeed): which sellers can actually
// deliver to the buyer's selected address. While a seller's data is still
// loading we treat it as deliverable (no false blocks); checkout re-validates
// on the server regardless.
// ─────────────────────────────────────────────────────────────────────────────
const CONSTRAINTS_TTL_MS = 60000;
const constraintsCache = new Map();    // submissionId -> { t, locations } | { t, failed: true }
const constraintsInflight = new Map(); // submissionId -> Promise

function loadDispatchingLocations(submissionId) {
    const hit = constraintsCache.get(submissionId);
    if (hit && Date.now() - hit.t < CONSTRAINTS_TTL_MS) return Promise.resolve(hit);
    if (constraintsInflight.has(submissionId)) return constraintsInflight.get(submissionId);

    const p = Promise.resolve()
        .then(() => fetchOrderConstraints(submissionId))
        .then((res) => {
            const entry = res?.success ? { t: Date.now(), locations: res.dispatchingLocations } : { t: Date.now(), failed: true };
            constraintsCache.set(submissionId, entry);
            return entry;
        })
        .catch(() => {
            const entry = { t: Date.now(), failed: true };
            constraintsCache.set(submissionId, entry);
            return entry;
        })
        .finally(() => { constraintsInflight.delete(submissionId); });

    constraintsInflight.set(submissionId, p);
    return p;
}

const hasEmbeddedLocations = (s) => Object.prototype.hasOwnProperty.call(s, "dispatching_locations");

function useSellerDeliverability(sellers, address, enabled) {
    const [version, setVersion] = useState(0);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    const city = address?.city || "";
    const state = address?.state || "";
    const pincode = address?.pincode || "";
    const active = !!enabled && /^\d{6}$/.test(pincode) && !!city && !!state;

    const idsKey = active
        ? sellers.filter((s) => s.submission_id && !hasEmbeddedLocations(s)).map((s) => s.submission_id).join(",")
        : "";

    useEffect(() => {
        if (!active || !idsKey) return;
        const ids = idsKey.split(",").filter(Boolean);
        let cancelled = false;
        (async () => {
            for (let i = 0; i < ids.length; i += 6) {
                await Promise.all(ids.slice(i, i + 6).map(loadDispatchingLocations));
                if (cancelled || !aliveRef.current) return;
                setVersion((v) => v + 1);
            }
        })();
        return () => { cancelled = true; };
    }, [active, idsKey]);

    // Returns null when deliverable/unknown, or the { serviceable:false, message } status.
    const check = (s) => {
        if (!active) return null;
        let locations;
        if (hasEmbeddedLocations(s)) {
            locations = s.dispatching_locations;
        } else {
            const hit = constraintsCache.get(s.submission_id);
            if (!hit || hit.failed) return null;
            locations = hit.locations;
        }
        const status = checkLocationServiceable(locations, { state, city });
        return status && status.serviceable === false ? status : null;
    };

    return { check, version };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small visual pieces (identical to HomeProductFeed)
// ─────────────────────────────────────────────────────────────────────────────

function GstToggle({ includeGst, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={includeGst}
            aria-label={`GST ${includeGst ? "included" : "excluded"}`}
            onClick={() => onChange(!includeGst)}
            className="group inline-flex items-center gap-2.5 rounded-full transition-all duration-200 focus:outline-none cursor-pointer"
        >
            <span
                className="relative flex h-5 w-10 shrink-0 items-center rounded-full p-0.5 transition-all duration-200"
                style={{ backgroundColor: includeGst ? C.secondary : "#D9DEE2" }}
            >
                <span
                    className="h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200"
                    style={{ transform: includeGst ? "translateX(20px)" : "translateX(0px)" }}
                />
            </span>
            <span className="flex min-w-[60px] flex-col items-start leading-none">
                <span className="text-[11px] font-bold tracking-[0.02em]" style={{ color: C.ink }}>GST</span>
                <span className="mt-0.5 text-[10px] font-medium tracking-wide" style={{ color: includeGst ? C.secondary : "#7B858C" }}>
                    {includeGst ? "With GST" : "Without GST"}
                </span>
            </span>
        </button>
    );
}

function SellerSortToggle({ value, onChange, options }) {
    return (
        <div className="inline-flex w-fit gap-1 rounded-full p-0.5" style={{ background: C.hairSoft }}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className="rounded-full px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition-colors duration-150"
                    style={value === opt.value ? { background: C.secondary, color: "#fff" } : { color: C.muted }}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function FreightPill({ included }) {
    return (
        <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide whitespace-nowrap"
            style={included ? { background: "#006F8314", color: "#006F83" } : { background: C.hairSoft, color: C.muted }}
        >
            <Truck className="h-2.5 w-2.5" strokeWidth={2.5} />
            {included ? "Freight included" : "Freight extra"}
        </span>
    );
}
function FastestBadge() {
    return (
        <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-wide whitespace-nowrap" style={{ background: "#00000010", color: C.ink }}>
            <Zap className="h-2.5 w-2.5" strokeWidth={2.5} /> Fastest
        </span>
    );
}

// Same labelling rules as the product header's PriceBreakdown: with a unit,
// every price is labelled by how many base units it covers ("/Pc", "/10 Pc",
// "/50 Pc"); without one it falls back to Pack / M Pack. A pack of exactly 1
// unit would repeat the unit row, so that row is skipped.
function SellerPriceBlock({ pricing, unit }) {
    if (!pricing) return null;
    const { discountPercent, hasMasterPack, unit: u, pack, masterPack, packQty, masterQty } = pricing;
    const hasDiscount = discountPercent > 0;

    const short = shortUnit(unit);
    const packDuplicatesUnit = !!unit && Number(packQty) === 1;

    const rows = [
        unit ? { label: short, ...u } : null,
        !packDuplicatesUnit ? { label: unit ? `${fmtQty(packQty)} ${short}` : "Pack", ...pack } : null,
        hasMasterPack && masterPack ? { label: unit ? `${fmtQty(masterQty)} ${short}` : "M Pack", ...masterPack } : null,
    ].filter(Boolean);

    if (!rows.length) return null;

    return (
        <div className="grid shrink-0 items-baseline gap-x-1.5 gap-y-0.5" style={{ gridTemplateColumns: "auto auto auto" }}>
            {rows.map((r) => (
                <div key={r.label} className="contents">
                    {hasDiscount && (
                        <span className="text-right text-[9.5px] font-semibold tabular-nums line-through" style={{ color: C.muted }}>
                            ₹{inr(r.original)}
                        </span>
                    )}
                    <span
                        className="whitespace-nowrap text-right text-[13.5px] font-extrabold tabular-nums"
                        style={{ color: hasDiscount ? C.secondary : C.ink, gridColumn: hasDiscount ? "auto" : "1 / span 2" }}
                    >
                        ₹{inr(r.final)}
                    </span>
                    <span className="whitespace-nowrap text-left text-[9.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        /{r.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Blurred/locked pricing block shown to logged-out visitors, same as the feed.
function dummyPriceFor(seed) {
    const str = String(seed || "x");
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return 199 + (h % 4300);
}
function LockedPriceBlock({ seed, unit, onClick }) {
    const rows = [unit ? { label: unit, value: dummyPriceFor(seed + "u") } : null, { label: "Pack", value: dummyPriceFor(seed + "p") }].filter(Boolean);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onClick?.(); } }}
            aria-label="Login to view price"
            className="group flex min-w-[112px] cursor-pointer select-none flex-col items-end gap-1.5"
        >
            <div className="rounded-md px-2 py-1.5 transition-all duration-150 group-hover:bg-black/[0.018]">
                <div className="flex flex-col gap-1">
                    {rows.map((r) => (
                        <div key={r.label} className="grid items-baseline gap-x-1 leading-none" style={{ gridTemplateColumns: "10px minmax(42px, auto) 38px" }}>
                            <span className="text-[12px] font-extrabold" style={{ color: C.ink }}>₹</span>
                            <span className="min-w-0 whitespace-nowrap text-right text-[12px] font-extrabold tabular-nums" style={{ color: C.ink, filter: "blur(4.5px)", opacity: 0.55, userSelect: "none", pointerEvents: "none" }}>
                                {inr(r.value)}
                            </span>
                            <span className="whitespace-nowrap text-[9px] font-semibold tracking-[0.01em]" style={{ color: C.muted }}>/{r.label}</span>
                        </div>
                    ))}
                </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-[4px] text-[9.5px] font-extrabold leading-none tracking-wide whitespace-nowrap transition-all duration-150 group-hover:-translate-y-[1px]" style={{ color: "#000000", background: "#0000000D", border: "1px solid #00000028" }}>
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full">
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.6} />
                </span>
                Login to view
            </span>
        </div>
    );
}

function LoginPromptModal({ open, message, onConfirm, onCancel }) {
    if (!open) return null;
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
            onClick={onCancel}
        >
            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[320px] rounded-2xl bg-white p-5 shadow-xl"
            >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "#00000014" }}>
                    <Lock className="h-5 w-5" style={{ color: C.primary }} strokeWidth={2.5} />
                </div>
                <p className="text-center text-[14.5px] font-extrabold" style={{ color: C.ink }}>Login required</p>
                <p className="mt-1.5 text-center text-[12.5px] font-medium leading-snug" style={{ color: C.muted }}>
                    {message || "You need to login to view seller pricing and place an order."}
                </p>
                <div className="mt-5 flex gap-2">
                    <button onClick={onCancel} className="flex-1 rounded-xl border py-2.5 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Cancel</button>
                    <button onClick={onConfirm} className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold text-white" style={{ background: C.primary }}>Login</button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide to confirm (identical to HomeProductFeed). Used for "Swipe to buy" on
// mobile and for confirming own-listing price/promotion changes.
// ─────────────────────────────────────────────────────────────────────────────
const SLIDE_KNOB = 40;
const SLIDE_KNOB_COMPACT = 32;
const SLIDE_PAD = 4;

function SlideToConfirm({
    label, onConfirm, busy, resetKey, disabled = false,
    compact = false, busyLabel = "Updating…", doneLabel = "Updated",
}) {
    const knob = compact ? SLIDE_KNOB_COMPACT : SLIDE_KNOB;
    const trackRef = useRef(null);
    const x = useMotionValue(0);
    const [maxX, setMaxX] = useState(0);
    const [confirmed, setConfirmed] = useState(false);

    // ResizeObserver instead of a one-time measure: inside a `md:hidden`
    // block the track measures 0 while hidden and gets its real width the
    // moment the breakpoint flips.
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const measure = () => setMaxX(Math.max(0, el.offsetWidth - knob - SLIDE_PAD * 2));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [knob]);

    useEffect(() => {
        setConfirmed(false);
        animate(x, 0, { duration: 0.2 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const fillWidth = useTransform(x, (v) => v + knob + SLIDE_PAD * 2);
    const labelOpacity = useTransform(x, [0, Math.max(maxX * 0.6, 1)], [1, 0]);

    return (
        <div
            ref={trackRef}
            className={`relative ${compact ? "h-10" : "h-12"} w-full overflow-hidden rounded-full select-none`}
            style={{ background: C.hairSoft, opacity: disabled ? 0.5 : 1 }}
        >
            <motion.div
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
                style={{ width: fillWidth, background: `${C.primary}14` }}
            />
            <motion.p
                className={`pointer-events-none absolute inset-0 flex items-center justify-center text-center ${compact ? "text-[10px] whitespace-nowrap" : "text-[11px]"} font-bold tracking-wide`}
                style={{
                    color: C.muted,
                    paddingLeft: knob + SLIDE_PAD * 2,
                    paddingRight: compact ? SLIDE_PAD * 2 : knob + SLIDE_PAD * 2,
                    opacity: busy || confirmed ? 1 : labelOpacity,
                }}
            >
                {busy ? busyLabel : confirmed ? doneLabel : label}
            </motion.p>
            <motion.div
                drag={busy || confirmed || disabled ? false : "x"}
                dragConstraints={{ left: 0, right: maxX }}
                dragElastic={0}
                dragMomentum={false}
                onDragEnd={() => {
                    if (maxX > 0 && x.get() >= maxX * 0.85) {
                        animate(x, maxX, { duration: 0.12 });
                        setConfirmed(true);
                        onConfirm();
                    } else {
                        animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
                    }
                }}
                className="absolute flex items-center justify-center rounded-full text-white"
                style={{
                    x,
                    top: SLIDE_PAD,
                    left: SLIDE_PAD,
                    width: knob,
                    height: knob,
                    background: C.primary,
                    cursor: disabled ? "not-allowed" : "grab",
                    touchAction: "pan-y",
                }}
                whileTap={disabled ? undefined : { cursor: "grabbing" }}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            </motion.div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Own-listing price + promotion editor (identical to HomeProductFeed).
// Edits price AND can stage a promotion-services change via the picker
// (PromotionPlanModal). The single slide-to-confirm saves whatever is pending.
// ─────────────────────────────────────────────────────────────────────────────
function OwnListingPriceModal({ seller, includeGst, submitting, token, onApply, onClose }) {
    const packSize = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterPackSize = Number(seller.units_per_master_pack) > 0 ? Number(seller.units_per_master_pack) : 1;
    const hasOuter = hasOuterPack(seller.units_per_master_pack);
    const gst = Number(seller.gst_percent) || 0;
    const saleUnitLabelText = hasOuter ? "Master Pack" : "Pack";

    const canonicalInclusive = round2(Number(seller.price) || 0);
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
    const [pendingPromo, setPendingPromo] = useState(null); // { keys, percent } — staged, not saved yet

    const commitLevel = (level) => (v) => {
        const rawNext = saleUnitFromLevel(level, v, packSize, masterPackSize, hasOuter);
        rawPerSaleUnitRef.current = rawNext;
        const rounded = round2(rawNext);
        setPerSaleUnit(rounded);
        setValues((prev) => ({ ...threeTierFromSaleUnit(rawNext, packSize, masterPackSize, hasOuter), [level]: v }));
    };

    const priceDirty = round2(perSaleUnit) !== canonicalPerSaleUnit;
    const dirty = priceDirty || !!pendingPromo;
    const resetKey = `${perSaleUnit}|${pendingPromo ? pendingPromo.keys.join(",") : ""}`;

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prevOverflow; };
    }, []);

    const handleConfirm = () => {
        const exactPerSaleUnit = rawPerSaleUnitRef.current;
        const finalInclusive = round2(includeGst ? exactPerSaleUnit : exactPerSaleUnit * (1 + gst / 100));
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
        seller.unit ? { level: "unit", label: `Per ${seller.unit}`, value: values.unit, refValue: reference.unit } : null,
        { level: "pack", label: "Per Pack", value: values.pack, refValue: reference.pack },
        hasOuter ? { level: "master", label: "Per Master Pack", value: values.master, refValue: reference.master } : null,
    ].filter(Boolean);

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={submitting ? undefined : onClose}
        >
            <motion.div
                initial={{ y: 24, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 16, opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={(e) => e.stopPropagation()}
                className="my-auto w-full max-w-sm rounded-[22px] bg-white p-5"
            >
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Update your listing</p>
                    <button onClick={onClose} disabled={submitting} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/[0.05] disabled:opacity-40">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>
                <p className="mt-1 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                    MOQ {seller.moq} {saleUnitLabelText}{Number(seller.moq) === 1 ? "" : "s"} · {includeGst ? "GST included" : "GST excluded"}
                </p>

                <div className="mt-4">
                    <div className={`grid gap-2.5 ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {fields.map((f) => (
                            <div key={f.level} className="flex flex-col gap-1">
                                <span className="truncate text-center text-[9.5px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                    {f.label}
                                </span>
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
                </div>

                <PromotionRow
                    currentPercent={seller.marketing_commission_percent}
                    pending={pendingPromo}
                    disabled={submitting}
                    onClick={() => setPromoOpen(true)}
                />

                <div className="mt-5">
                    <SlideToConfirm
                        resetKey={resetKey}
                        busy={submitting}
                        disabled={!dirty}
                        label={dirty ? "Slide to confirm changes" : "Change the price or promotion first"}
                        onConfirm={handleConfirm}
                    />
                </div>
            </motion.div>

            <AnimatePresence>
                {promoOpen && (
                    <PromotionPlanModal
                        submission={{
                            id: seller.submission_id,
                            ...(Object.prototype.hasOwnProperty.call(seller, "marketing_services") ? { marketing_services: seller.marketing_services } : {}),
                            marketing_commission_percent: seller.marketing_commission_percent,
                            marketing_legacy_percent: seller.marketing_legacy_percent,
                        }}
                        token={token}
                        title={seller.display_name}
                        stagedKeys={pendingPromo ? pendingPromo.keys : null}
                        onClose={() => setPromoOpen(false)}
                        onDone={(keys, percent) => {
                            setPendingPromo(keys ? { keys, percent } : null);
                            setPromoOpen(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </motion.div>,
        document.body
    );
}

// Compact trigger shown in the seller row for YOUR OWN listing — price
// breakdown + current promo %. Clicking opens OwnListingPriceModal.
function OwnListingPriceCell({ seller, includeGst, submitting, token, onApply }) {
    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(false);
    const packSize = Number(seller.pack_size) > 0 ? Number(seller.pack_size) : 1;
    const masterPackSize = Number(seller.units_per_master_pack) > 0 ? Number(seller.units_per_master_pack) : 1;
    const hasOuter = hasOuterPack(seller.units_per_master_pack);
    const gst = Number(seller.gst_percent) || 0;

    const canonicalInclusive = round2(Number(seller.price) || 0);
    const canonicalDisplayed = round2(includeGst ? canonicalInclusive : canonicalInclusive / (1 + gst / 100));
    const derived = deriveDisplayPrices(canonicalDisplayed, packSize, masterPackSize);
    const commissionPercent = Number(seller.marketing_commission_percent) || 0.25;

    const short = shortUnit(seller.unit);
    const masterQty = hasOuter ? packSize * masterPackSize : null;
    const packDuplicatesUnit = !!seller.unit && packSize === 1;

    const priceRows = [
        seller.unit ? { label: short, value: `₹${inr(derived.perBaseUnit)}` } : null,
        !packDuplicatesUnit
            ? { label: seller.unit ? `${fmtQty(packSize)} ${short}` : "Pack", value: `₹${inr(derived.perPack)}` }
            : null,
        hasOuter
            ? { label: seller.unit ? `${fmtQty(masterQty)} ${short}` : "M Pack", value: `₹${inr(derived.perMasterPack)}` }
            : null,
    ].filter(Boolean);

    return (
        <>
            <button
                type="button"
                data-price-editor=""
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                onMouseDown={() => setPressed(true)}
                onMouseUp={() => setPressed(false)}
                onMouseLeave={() => setPressed(false)}
                className="group relative z-10 flex flex-col items-end gap-1 rounded-xl border px-2.5 py-2 text-left transition-all duration-150"
                style={{
                    borderColor: C.hair,
                    background: pressed ? C.hairSoft : "#fff",
                    transform: pressed ? "scale(0.98)" : "scale(1)",
                }}
            >
                <div className="grid items-baseline gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: "auto auto" }}>
                    {priceRows.map((r) => (
                        <div key={r.label} className="contents">
                            <span className="whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                {r.value}
                            </span>
                            <span className="whitespace-nowrap text-left text-[9px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                /{r.label}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="flex w-full items-center gap-1.5 border-t pt-1" style={{ borderColor: C.hairSoft }}>
                    <span className="text-[9.5px] font-bold tracking-wide" style={{ color: C.muted }}>Promo</span>
                    <span className="text-[10.5px] font-extrabold tabular-nums" style={{ color: C.ink }}>{commissionPercent}%</span>
                </div>

                <span
                    className="mt-0.5 flex items-center gap-1 self-stretch justify-center rounded-lg px-2 py-1 text-[9.5px] font-bold tracking-wide transition-colors duration-150"
                    style={{ background: pressed ? `${C.secondary}14` : C.hairSoft, color: C.secondary }}
                >
                    <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Edit
                </span>
            </button>

            <AnimatePresence>
                {open && (
                    <OwnListingPriceModal
                        seller={seller}
                        includeGst={includeGst}
                        submitting={submitting}
                        token={token}
                        onClose={() => setOpen(false)}
                        onApply={(payload) => { onApply(payload); setOpen(false); }}
                    />
                )}
            </AnimatePresence>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────

function SellerRow({
    s, idx, sortMode, includeGst, isFastest, isOwn, isLoggedIn, notDeliverable, buyerAddress,
    showOutOfStockLabel, token, savingOwn, slideTick,
    onBuy, onRequireLogin, onOwnApply, onEditOwn,
}) {
    const pricing = sellerPricingForMode(s, sortMode, includeGst);
    const outOfStock = isSellerOutOfStock(s);
    const blocked = outOfStock || !!notDeliverable;
    const totalDeliveryDays = s.total_delivery_days;

    return (
        <Fragment>
            {showOutOfStockLabel && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-wider sm:px-4" style={{ color: C.muted }}>
                    Out of stock
                </p>
            )}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(idx * 0.02, 0.2), ease: EASE }}
                layout="position"
                role="button"
                tabIndex={blocked || isOwn ? -1 : 0}
                onClick={() => !blocked && !isOwn && onBuy()}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !blocked && !isOwn) { e.preventDefault(); onBuy(); } }}
                aria-disabled={blocked || isOwn}
                className={`relative flex w-full items-start gap-3 border-b px-3 py-3.5 text-left transition-colors duration-150 max-md:cursor-default sm:px-4 ${notDeliverable ? "cursor-not-allowed" : isOwn ? "cursor-default" : "cursor-pointer hover:bg-black/[0.02]"}`}
                style={{
                    borderColor: C.hairSoft,
                    ...(outOfStock
                        ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }
                        : notDeliverable ? { opacity: 0.62 } : null),
                }}
            >
                {/* Mobile only: swallow row taps so the slider is the only way to buy */}
                <div className="absolute inset-0 md:hidden" onClick={(e) => e.stopPropagation()} />

                {/* LEFT COL — seller info */}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold leading-tight tracking-wide" style={{ color: C.ink }}>
                        {s.display_name}{isOwn ? " (You)" : ""}
                    </p>
                    {(s.city || s.state) && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                            <MapPin className="h-3 w-3 shrink-0" /> {[s.city, s.state].filter(Boolean).join(", ")}
                        </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>
                        <span className="flex items-center gap-1" style={{ color: C.secondary }}>
                            <Boxes className="h-3 w-3" />
                            {s.moq ? `MOQ ${s.moq} ${priceUnitLabel(s.units_per_master_pack)}` : priceUnitLabel(s.units_per_master_pack)}
                        </span>
                        {!notDeliverable && totalDeliveryDays != null && <span>· ~{totalDeliveryDays}d delivery</span>}
                        {!notDeliverable && !s.is_custom_priced && pricing?.discountPercent > 0 && (
                            <span>· {pricing.saleQty}+ {pricing.saleUnit}{pricing.saleQty === 1 ? "" : "s"}: {pricing.discountPercent}% off</span>
                        )}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <FreightPill included={s.freight_included} />
                        {isFastest && <FastestBadge />}
                    </div>
                    {!notDeliverable && s.delivery_timeline && (
                        <p className="mt-1.5 truncate text-[10.5px] font-medium" style={{ color: C.muted }}>Delivery: {s.delivery_timeline}</p>
                    )}
                    {isOwn && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEditOwn(s.submission_id); }}
                            className="relative z-10 mt-2.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold tracking-wide text-white"
                            style={{ background: C.primary }}
                        >
                            Edit listing
                        </button>
                    )}
                </div>

                {/* RIGHT COL — price + buy action (or the reason there is none) */}
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5 text-right">
                    {outOfStock ? (
                        <span className="rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide" style={{ background: "#f1f1f1", color: C.muted }}>OUT OF STOCK</span>
                    ) : notDeliverable ? (
                        <div className="relative z-10 flex max-w-[9.5rem] flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide" style={{ background: "#FDECEC", color: "#B3261E" }}>
                                <Ban className="h-2.5 w-2.5" strokeWidth={2.8} /> NOT DELIVERABLE
                            </span>
                            <span className="text-[10.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                                Doesn't ship to {buyerAddress?.city}{buyerAddress?.state ? `, ${buyerAddress.state}` : ""}
                            </span>
                        </div>
                    ) : !isLoggedIn ? (
                        <div className="relative z-10">
                            <LockedPriceBlock seed={s.submission_id} unit={s.unit} onClick={onRequireLogin} />
                        </div>
                    ) : isOwn ? (
                        <OwnListingPriceCell
                            seller={s}
                            includeGst={includeGst}
                            token={token}
                            submitting={savingOwn}
                            onApply={onOwnApply}
                        />
                    ) : (
                        <>
                            {/* Mobile: price + swipe to buy, full width of the right column */}
                            <div className="relative z-10 flex w-[9.5rem] flex-col items-end gap-1.5 md:hidden">
                                <SellerPriceBlock pricing={pricing} unit={s.unit} />
                                <div data-swipe-buy="" className="w-full" onClick={(e) => e.stopPropagation()}>
                                    <SlideToConfirm
                                        compact
                                        label="Swipe to buy"
                                        busyLabel="Opening…"
                                        doneLabel="Opening…"
                                        resetKey={`${s.submission_id}:${slideTick}`}
                                        onConfirm={onBuy}
                                    />
                                </div>
                            </div>

                            {/* md and up: price + Buy now button */}
                            <div className="hidden flex-col items-end gap-1.5 md:flex">
                                <SellerPriceBlock pricing={pricing} unit={s.unit} />
                                <span className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold tracking-wide text-white" style={{ background: C.primary }}>
                                    Buy now
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </Fragment>
    );
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 border-b px-3 py-3.5 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-1/3 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
            <div className="h-4 w-14 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BrandItemSellersPage() {
    const { idOrSlug } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const brandItemHint = location.state?.brandItem;
    // A navigation that built the URL from a missing id/slug produces the literal
    // string "undefined" — never treat that as a real id.
    const routeId = idOrSlug && idOrSlug !== "undefined" && idOrSlug !== "null" ? idOrSlug : null;
    const brandItemId = brandItemHint?.id || brandItemHint?.brand_item_id || routeId;

    const { profile, token, effectiveLoggedIn, needsOnboarding } = useAuth();
    const currentUserId = profile?.shop_slug ?? null;
    const isLoggedIn = effectiveLoggedIn;

    // Delivery address comes from the shared context (same one shown at the
    // top of Home), so changing it there updates delivery estimates here too.
    const { selectedAddress: buyerAddress } = useBuyerAddress();

    const [sortMode, setSortMode] = useState("best_price");
    const [includeGst, setIncludeGst] = useState(true);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(null);

    const [buySeller, setBuySeller] = useState(null);
    const [sellOpen, setSellOpen] = useState(false);
    const [loginPrompt, setLoginPrompt] = useState(null);
    const [editingSubmissionId, setEditingSubmissionId] = useState(null);
    const [savingOwnPriceId, setSavingOwnPriceId] = useState(null);
    const [toast, setToast] = useState(null); // { message }
    const [slideTick, setSlideTick] = useState(0); // bump to reset every "Swipe to buy" slider

    const abortRef = useRef(null);
    const reqSeqRef = useRef(0);
    const toastTimerRef = useRef(null);
    const reconcileTimerRef = useRef(null);
    const lastTsRef = useRef(new Map());
    const itemsRef = useRef([]);
    const runQueryRef = useRef(null);
    itemsRef.current = items;

    const showToast = useCallback((message, ms = 2200) => {
        clearTimeout(toastTimerRef.current);
        setToast({ message });
        toastTimerRef.current = setTimeout(() => setToast(null), ms);
    }, []);

    // If the buyer's address becomes unavailable while "Fastest delivery" was
    // selected, fall back to a mode that still makes sense.
    useEffect(() => {
        if (sortMode === "fastest_delivery" && !(buyerAddress?.city && buyerAddress?.state)) {
            setSortMode("best_price");
        }
    }, [buyerAddress, sortMode]);

    // Single fetch function. A sequence number makes sure only the LATEST
    // request ever touches state (an aborted/superseded request is ignored,
    // including its `finally`).
    const runQuery = useCallback((offset, { append = false, silent = false, limit = PAGE_SIZE } = {}) => {
        if (!brandItemId) {
            reqSeqRef.current += 1;
            setError("Couldn't open this product. Please go back and try again.");
            setLoading(false);
            setIsRefreshing(false);
            setLoadingMore(false);
            setHasMore(false);
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const seq = ++reqSeqRef.current;

        if (append) setLoadingMore(true);
        else { setLoadingMore(false); (silent ? setIsRefreshing : setLoading)(true); }

        fetchBrandItemSellers(brandItemId, {
            sort: sortModeToApiSort(sortMode),
            limit,
            offset,
            destPincode: buyerAddress?.pincode || undefined,
            destState: buyerAddress?.state || undefined,
            signal: controller.signal,
            token,
        })
            .then((res) => {
                if (seq !== reqSeqRef.current) return;
                if (!res?.success) {
                    if (!append) setError("Couldn't load sellers.");
                    else setHasMore(false);
                    return;
                }
                setError(null);
                const incoming = res.items || [];
                setItems((prev) => (append ? mergeUniqueSellers(prev, incoming) : incoming));
                setTotal(res.total ?? incoming.length);
                setHasMore(!!res.hasMore);
            })
            .catch((err) => {
                if (seq !== reqSeqRef.current || err?.name === "AbortError") return;
                if (append) setHasMore(false);
                else setError("Couldn't load sellers.");
            })
            .finally(() => {
                if (seq !== reqSeqRef.current) return;
                setLoading(false);
                setIsRefreshing(false);
                setLoadingMore(false);
            });
    }, [brandItemId, sortMode, buyerAddress, token]);
    runQueryRef.current = runQuery;

    // Fresh load on brand item change.
    useEffect(() => {
        setItems([]);
        setTotal(null);
        setError(null);
        setHasMore(true);
        runQuery(0, { append: false, silent: false });
    }, [brandItemId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Silent re-sort/re-fetch (rows stay visible) on tab switch or once the
    // buyer's address resolves — this is the ONLY thing (besides realtime
    // reconcile) that re-fetches, so nothing reshuffles under the reader.
    const isFirstSortRun = useRef(true);
    useEffect(() => {
        if (isFirstSortRun.current) { isFirstSortRun.current = false; return; }
        runQuery(0, { append: false, silent: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortMode, buyerAddress]);

    useEffect(() => () => {
        abortRef.current?.abort();
        clearTimeout(toastTimerRef.current);
        clearTimeout(reconcileTimerRef.current);
    }, []);

    const sentinelRef = useInfiniteScrollSentinel(
        () => !loadingMore && !isRefreshing && hasMore && runQuery(itemsRef.current.length, { append: true }),
        { lookahead: 600, disabled: loading || loadingMore || isRefreshing || !hasMore }
    );

    // ── REALTIME ────────────────────────────────────────────────────────
    const { socket, connected } = useSocket() || {};

    // Quietly re-sync the whole loaded list (keeps as many rows as are loaded).
    const silentReload = useCallback(() => {
        const limit = Math.min(Math.max(itemsRef.current.length, PAGE_SIZE), MAX_RELOAD_SIZE);
        runQueryRef.current?.(0, { append: false, silent: true, limit });
    }, []);

    const scheduleReconcile = useCallback(() => {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = setTimeout(silentReload, RECONCILE_DELAY_MS);
    }, [silentReload]);

    useEffect(() => {
        if (!socket) return;
        const onConnect = () => lastTsRef.current.clear(); // a server restart resets timestamps
        const onUpdate = (evt) => {
            const { brandItemId: evtItemId, submissionId, patch, available, ts } = evt || {};
            if (!evtItemId || !submissionId) return;
            const known = itemsRef.current.some((r) => r.submission_id === submissionId);
            const sameProduct =
                String(evtItemId) === String(brandItemId) ||
                (brandItemHint?.id != null && String(evtItemId) === String(brandItemHint.id));
            if (!known && !sameProduct) return;

            if ((lastTsRef.current.get(submissionId) || 0) > (ts || 0)) return;
            lastTsRef.current.set(submissionId, ts || 0);

            if (known) {
                if (available) {
                    setItems((prev) => prev.map((r) => (r.submission_id === submissionId ? { ...r, ...patch } : r)));
                } else {
                    setItems((prev) => prev.filter((r) => r.submission_id !== submissionId));
                    setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
                }
                scheduleReconcile();
            } else if (available) {
                silentReload();
            }
        };
        socket.on("connect", onConnect);
        socket.on("listing:update", onUpdate);
        return () => {
            socket.off("connect", onConnect);
            socket.off("listing:update", onUpdate);
        };
    }, [socket, brandItemId, brandItemHint?.id, scheduleReconcile, silentReload]);

    // Safety net: poll while the socket is down, and resync when the tab
    // becomes visible again (we may have missed events).
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === "visible") silentReload(); };
        document.addEventListener("visibilitychange", onVisible);
        const poll = !connected ? setInterval(silentReload, 15000) : null;
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            if (poll) clearInterval(poll);
        };
    }, [connected, silentReload]);

    // ── DERIVED LIST ────────────────────────────────────────────────────
    const { check: checkDeliverable, version: deliverabilityVersion } = useSellerDeliverability(items, buyerAddress, isLoggedIn);

    const hasKnownDestination = !!(buyerAddress?.city && buyerAddress?.state);
    const availableSortOptions = useMemo(
        () => (hasKnownDestination ? SELLER_SORT_OPTIONS : SELLER_SORT_OPTIONS.filter((o) => o.value !== "fastest_delivery")),
        [hasKnownDestination]
    );

    // "Best price" is sorted client-side over the loaded pages (see header).
    // Then a stable split: in-stock sellers keep their order on top,
    // out-of-stock sellers keep theirs at the bottom.
    const sortedItems = useMemo(() => {
        if (!items.length) return items;
        let list = items;
        if (sortMode === "best_price") {
            const withMeta = items.map((s) => ({ s, pricing: bestAchievablePricing(s, includeGst) }));
            withMeta.sort((a, b) => (a.pricing?.pack?.final ?? Infinity) - (b.pricing?.pack?.final ?? Infinity));
            list = withMeta.map((x) => x.s);
        }
        const inStock = [];
        const outOfStock = [];
        list.forEach((s) => (isSellerOutOfStock(s) ? outOfStock : inStock).push(s));
        return outOfStock.length ? [...inStock, ...outOfStock] : list;
    }, [items, sortMode, includeGst]);

    // "Fastest" badge must never land on an out-of-stock or non-deliverable seller.
    const fastestSubmissionId = useMemo(() => {
        if (sortMode !== "fastest_delivery" || !hasKnownDestination) return null;
        return sortedItems.find((s) => !isSellerOutOfStock(s) && !checkDeliverable(s))?.submission_id ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortMode, hasKnownDestination, sortedItems, deliverabilityVersion]);

    const firstOutOfStockId = useMemo(
        () => sortedItems.find(isSellerOutOfStock)?.submission_id ?? null,
        [sortedItems]
    );

    // ── LOGIN ───────────────────────────────────────────────────────────
    const requireLogin = useCallback(
        (message) => setLoginPrompt({
            message: message || (needsOnboarding
                ? "Finish setting up your account to view seller pricing and place orders."
                : "You need to login to view seller pricing and place an order."),
        }),
        [needsOnboarding]
    );
    // Send the FULL current URL so AuthPage can bring the person back here.
    const confirmLogin = useCallback(() => {
        setLoginPrompt(null);
        navigate("/login", {
            state: { from: `${location.pathname}${location.search}${location.hash || ""}` },
        });
    }, [navigate, location.pathname, location.search, location.hash]);
    const cancelLogin = useCallback(() => setLoginPrompt(null), []);

    // ── BUY ─────────────────────────────────────────────────────────────
    // Opens BuyNowModal in the same tick as the click. BuyNowModal resolves
    // the shipping address and transport preference itself once its own
    // "shipping" phase mounts — same as HomeProductFeed.handleBuySeller.
    const handleBuySeller = (seller) => {
        if (!effectiveLoggedIn) { setSlideTick((t) => t + 1); requireLogin(); return; }
        if (!token) { setSlideTick((t) => t + 1); requireLogin("You need to login to place an order with this seller."); return; }
        setBuySeller(seller);
    };

    const closeBuyModal = () => {
        setBuySeller(null);
        setSlideTick((t) => t + 1); // slider snaps back to the start
    };

    const buyerSellerPayload = buySeller ? toBuyerSellerPayload(buySeller) : null;

    // ── OWN LISTING ─────────────────────────────────────────────────────
    const patchOwnListing = useCallback((submissionId, patch) => {
        setItems((prev) => prev.map((row) => (row.submission_id === submissionId ? { ...row, ...patch } : row)));
    }, []);

    // Runs when the own-listing modal's slide-to-confirm completes. Saves the
    // price, the staged promotion plan, or both, then always re-syncs from the
    // server (which also repairs the optimistic price after a failure).
    const handleOwnPriceSave = async (submissionId, { basePrice, priceBasis, finalInclusive, priceChanged, promotionServices }) => {
        setSavingOwnPriceId(submissionId);
        let priceOk = null;
        let promoOk = null;
        let failMsg = null;

        if (priceChanged) {
            patchOwnListing(submissionId, { price: finalInclusive });
            const payload = { basePrice: String(basePrice), priceBasis, gstInclusive: false };
            let res = null;
            try { res = await updateSellerProductSubmission(token, submissionId, payload); } catch { res = null; }
            priceOk = !!res?.success;
            if (!priceOk) failMsg = res?.message || "Couldn't update the price. Try again.";
        }

        if (promotionServices) {
            const r = await savePromotionPlan(token, submissionId, promotionServices);
            promoOk = r.ok;
            if (r.ok) patchOwnListing(submissionId, r.patch);
            else failMsg = failMsg || r.message || "Couldn't update the promotion. Try again.";
        }

        setSavingOwnPriceId(null);
        const message = saveResultMessage({ priceOk, promoOk, failMsg });
        if (message) showToast(message);
        silentReload();
    };

    // Hide "Sell this product" if you already sell it (hint from the feed row,
    // or your own row is in the loaded list).
    const alreadySelling = brandItemHint?.has_own_listing === true || items.some((s) => isOwnSellerRow(s, currentUserId));
    const showFullSkeleton = loading && items.length === 0;

    return (
        <div className="min-h-screen bg-white">
            {/* Sticky header: back, product identity (only this product), sort + GST */}
            <div className="sticky top-0 z-20 border-b bg-white" style={{ borderColor: C.hair }}>
                <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-4">
                    <div className="flex items-start gap-2.5 pb-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
                            aria-label="Back"
                        >
                            <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
                        </button>

                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-[15.5px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>
                                {brandItemHint?.name || "Sellers"}
                            </h1>
                            <p className="truncate text-[11px] font-bold uppercase tracking-wider" style={{ color: "#006F83" }}>
                                {brandItemHint?.brand_name}{brandItemHint?.brand_name ? " · " : ""}
                                {showFullSkeleton ? "Loading…" : total != null ? `${total} seller${total === 1 ? "" : "s"} listing this` : ""}
                            </p>
                        </div>
                    </div>

                    {items.length > 1 && (
                        <div className="flex items-center justify-between gap-2 pb-3">
                            <div className="min-w-0 overflow-x-auto">
                                <SellerSortToggle value={sortMode} onChange={setSortMode} options={availableSortOptions} />
                            </div>
                            <GstToggle includeGst={includeGst} onChange={setIncludeGst} />
                        </div>
                    )}
                </div>
            </div>

            <div className="mx-auto max-w-3xl bg-white sm:my-3 sm:rounded-2xl sm:border" style={{ borderColor: C.hair, opacity: isRefreshing ? 0.7 : 1, transition: "opacity 0.15s ease" }}>
                {showFullSkeleton ? (
                    Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
                ) : error && items.length === 0 ? (
                    <p className="px-6 py-14 text-center text-[13px] font-semibold" style={{ color: C.muted }}>{error}</p>
                ) : sortedItems.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                        <Store className="h-6 w-6" style={{ color: C.hair }} />
                        <p className="text-[13px] font-bold" style={{ color: C.ink }}>No sellers listing this right now</p>
                    </div>
                ) : (
                    <>
                        {sortedItems.map((s, i) => {
                            const isOwn = isOwnSellerRow(s, currentUserId);
                            const outOfStock = isSellerOutOfStock(s);
                            // Seller doesn't ship to the buyer's selected address -> no buy action at all.
                            const notDeliverable = !isOwn && !outOfStock && isLoggedIn ? checkDeliverable(s) : null;
                            return (
                                <SellerRow
                                    key={s.submission_id}
                                    s={s}
                                    idx={i}
                                    sortMode={sortMode}
                                    includeGst={includeGst}
                                    isFastest={fastestSubmissionId != null && s.submission_id === fastestSubmissionId}
                                    isOwn={isOwn}
                                    isLoggedIn={isLoggedIn}
                                    notDeliverable={notDeliverable}
                                    buyerAddress={buyerAddress}
                                    showOutOfStockLabel={s.submission_id === firstOutOfStockId}
                                    token={token}
                                    savingOwn={savingOwnPriceId === s.submission_id}
                                    slideTick={slideTick}
                                    onBuy={() => handleBuySeller(s)}
                                    onRequireLogin={() => requireLogin("Login to view real seller pricing.")}
                                    onOwnApply={(payload) => handleOwnPriceSave(s.submission_id, payload)}
                                    onEditOwn={setEditingSubmissionId}
                                />
                            );
                        })}
                        {loadingMore && <RowSkeleton />}
                    </>
                )}
                {hasMore && !loading && <div ref={sentinelRef} className="h-1" />}

                {!showFullSkeleton && !alreadySelling && (
                    <div className="p-3.5">
                        <button
                            onClick={() => (effectiveLoggedIn ? setSellOpen(true) : requireLogin("Login to list your own offer for this product."))}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-2.5 text-[12.5px] font-bold tracking-wide text-white transition-colors duration-150 hover:bg-black/90"
                        >
                            <Store className="h-3.5 w-3.5" /> Sell this product
                        </button>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {loginPrompt && (
                    <LoginPromptModal open message={loginPrompt.message} onConfirm={confirmLogin} onCancel={cancelLogin} />
                )}
                {sellOpen && (
                    <SellThisItemModal brand={brandItemHint} onClose={() => setSellOpen(false)} />
                )}
                {buySeller && buyerSellerPayload && (
                    <BuyNowModal
                        seller={buyerSellerPayload}
                        product={{
                            id: brandItemHint?.id || brandItemId,
                            name: brandItemHint?.name,
                            brand_name: brandItemHint?.brand_name,
                            brand_image: brandItemHint?.brand_image,
                            image: brandItemHint?.image,
                            model_no: brandItemHint?.model_no,
                            category_name: brandItemHint?.category_name,
                            subcategory_name: brandItemHint?.subcategory_name,
                        }}
                        onClose={closeBuyModal}
                    />
                )}
            </AnimatePresence>

            {editingSubmissionId && createPortal(
                <EditListingModal
                    token={token}
                    submissionId={editingSubmissionId}
                    focusSection={null}
                    onClose={() => setEditingSubmissionId(null)}
                    onSaved={() => {
                        setEditingSubmissionId(null);
                        silentReload();
                    }}
                />,
                document.body
            )}

            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-[80] flex justify-center px-4 md:bottom-6">
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            role="status"
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.96 }}
                            transition={{ duration: 0.18, ease: EASE }}
                            className="pointer-events-auto flex items-center rounded-full bg-black px-3.5 py-2 text-[12px] font-bold text-white shadow-lg"
                        >
                            <span className="whitespace-nowrap">{toast.message}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}