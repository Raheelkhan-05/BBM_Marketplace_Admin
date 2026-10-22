// src/pages/SellerManageListingsPage.jsx
//
// REDESIGN (earlier revision):
// - Each listing row now mirrors HomeProductFeed's ProductRow header:
//   [image | title + brand/model + category + packaging | price breakdown].
//   The price block is the same unit / pack / master-pack breakdown the
//   buyer sees, and is a tappable "Edit price" chip that opens the same
//   wheel-picker price modal (+ promo row + slide-to-confirm) that the
//   seller's own row uses in the feed. Saves via updateSellerProductSubmission.
// - Below the header, an owner info strip shows what only the seller cares
//   about: Stock, MOQ, Dispatch / Production lead time, Promo budget
//   (marketing commission %) and Visibility (Full / Partial).
// - Under the strip: Share, "Edit details" (opens the full inline edit form
//   as a dropdown, exactly like before) and the Live / Paused switch.
//   Tapping anywhere on the header also toggles the inline edit form.
// - KEPT: search, "Needs restock" filter, wallet card, realtime + resync,
//   toasts, onboarding gate, floating Sell button.
// - GST toggle (same as the feed) switches the row prices and the price
//   editor between GST-inclusive and GST-exclusive.
// - On lg+ screens rows are laid out in two independent columns (round-robin,
//   same idea as the feed) so an opened editor never reflows the other column.
//
// PROMOTION FLOW (earlier revision):
// - In the price modal, "Promotion → Manage" opens PromotionPlanModal, a
//   PICKER only (existing services pre-ticked). Done returns to the price
//   modal and stages the selection. The price modal's single slide-to-confirm
//   then saves price and/or promotion together.
//
// RENEW FLOW (this revision):
// - Renewing is now ONE TAP. The old "Renew" toggle + RefreshPanel drawer
//   (duration chips + second confirm button, which popped in with no
//   animation) is gone. The "Renew" button renews immediately using the
//   validity the seller already saved on that listing (it.validity_hours).
//   The button appears ONLY once the listing has expired, right in the
//   expired banner. While a listing is live, only the countdown shows.
// - Changing the duration is done only from the edit module (the form's
//   "Listing validity" section, prefilled with the saved value).
// - The button shows the duration it will use ("Renew · 7 days") and a
//   spinner while the request is in flight, so there's no guessing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import Toast from "../components/Toast.jsx";
import {
    Search, Package, Boxes, Clock, Megaphone, Eye, Share2, X, Loader2,
    ChevronRight, ChevronDown, ImageIcon, Wallet, Zap, RefreshCw, Check,
} from "lucide-react";
import { fetchWalletStatus } from "../utils/walletApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { shareProductLink } from "../utils/share.js";
// Only the hook is needed: main.jsx already provides the single global
// SmoothScrollProvider (a second local one would create a decoy Lenis).
import { useLenis } from "../providers/SmoothScrollProvider.jsx";
import {
    fetchMySellerSubmissions, updateSellerProductSubmission, setSellerSubmissionActive, refreshSellerSubmission,
} from "../utils/api.js";
import ImageLightbox from "../components/ImageLightbox.jsx";
import { SellerOnboardingForm } from "./SellerOnboardingPage.jsx";
import FloatingSellButton from "../components/FloatingSellButton.jsx";
import EditListingModal from "../components/seller/listingForm/EditListingModal.jsx";
import {
    DEFAULT_VALIDITY_HOURS, validityLabel, getListingExpiry, formatTimeLeft, formatExpiryDate,
} from "../shared/listingValidity.js";
import PromotionPlanModal, { PromotionRow, savePromotionPlan, saveResultMessage } from "../components/seller/listingForm/PromotionPlanModal.jsx";
import { InlineWheelField } from "../components/seller/listingForm/PriceWheelPicker.jsx";
import { saleUnitLabel, round2, deriveDisplayPrices, hasOuterPack } from "../shared/packUnits.js";
import { resizedImageUrl } from "../utils/imageUrl.js";
import { useListings } from "../context/ListingsContext.jsx";

const C = {
    ink: "#0B1116",
    muted: "#667077",
    primary: "#000000",
    secondary: "#000000",
    hair: "rgba(11,17,22,0.09)",
    hairSoft: "rgba(11,17,22,0.05)",
    imgBg: "#F4F5F6",
    teal: "#006F83",
    surface: "#FCFBF9",
};

const EASE = [0.16, 1, 0.3, 1];
const LOW_STOCK_THRESHOLD = 10;

// Attribute marking "this element may scroll while the modal scroll-lock is active".
const SCROLL_LOCK_ALLOW_SELECTOR = "[data-lenis-prevent], [data-scroll-lock-allow]";

/* ============================== helpers ============================== */

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
function inr(n) {
    return (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function toTitleCase(str = "") {
    return String(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function isHiddenLabel(name) {
    return typeof name === "string" && name.trim().toLowerCase() === "pending";
}

function stockState(stock, moq) {
    if (stock == null) return "unknown";
    const moqNum = Number(moq) || 0;
    if (moqNum > 0 ? Number(stock) < moqNum : Number(stock) <= 0) return "out";
    if (Number(stock) <= LOW_STOCK_THRESHOLD) return "low";
    return "ok";
}

// Same wording the feed's header uses under the product name.
function packagingLabel(packSize, masterPackSize, unit) {
    const pack = Number(packSize) || 0;
    const master = Number(masterPackSize) || 0;
    if (!pack || !unit) return "Packaging not set";
    if (master > 1) return `1 Master Pack = ${master} Packs = ${master * pack} ${unit}`;
    return `1 Pack = ${pack} ${unit}`;
}

// "Pack" | "M Pack" — compact sale-unit name for the info strip.
function compactSaleUnit(saleUnit) {
    return /master/i.test(saleUnit) ? "M Pack" : saleUnit;
}

// Unit / pack / master-pack rows, labelled exactly like the feed's PriceBreakdown.
// `it.price` is the stored GST-inclusive price per sale unit.
function priceRowsFor(it, includeGst) {
    const src = Number(it.price);
    if (!(src > 0)) return [];
    const gst = Number(it.gst_percent) || 0;
    const perSaleUnit = includeGst ? src : src / (1 + gst / 100);
    const packSize = Number(it.pack_size) > 0 ? Number(it.pack_size) : 1;
    const masterSize = Number(it.units_per_master_pack) > 0 ? Number(it.units_per_master_pack) : 1;
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterSize);
    const outer = hasOuterPack(it.units_per_master_pack);
    const short = shortUnit(it.unit);
    const packDuplicatesUnit = !!it.unit && packSize === 1;

    return [
        it.unit ? { label: short, value: d.perBaseUnit } : null,
        !packDuplicatesUnit ? { label: it.unit ? `${fmtQty(packSize)} ${short}` : "Pack", value: d.perPack } : null,
        outer ? { label: it.unit ? `${fmtQty(packSize * masterSize)} ${short}` : "M Pack", value: d.perMasterPack } : null,
    ].filter(Boolean);
}

// One badge at most, so status never reads as two conflicting signals.
function getListingStatus(it, isActive, sState, isExpired = false) {
    if (isExpired) return { label: "Expired", bg: "#fee2e2", fg: "#c71f11" };
    if (!isActive) return { label: "Paused", bg: C.hairSoft, fg: C.muted };
    if (it.review_status === "rejected") return { label: "Rejected", bg: "#fee2e2", fg: "#c71f11" };
    if (sState === "out") return { label: "Out of stock", bg: "#fee2e2", fg: "#c71f11" };
    if (sState === "low") return { label: "Low stock", bg: "#fef3c7", fg: "#b45309" };
    return null;
}

// The validity a one-tap renewal will use: whatever the seller saved on this
// listing. Only legacy rows with nothing saved fall back to the default.
function renewalHoursFor(it) {
    const saved = Number(it.validity_hours);
    return saved > 0 ? saved : DEFAULT_VALIDITY_HOURS;
}

// Two columns from lg up, one below. Manual bucketing (like the feed) so an
// opened editor only pushes down its own column.
function useResponsiveColumnCount() {
    const getCount = () => (typeof window !== "undefined" && window.innerWidth >= 1024 ? 2 : 1);
    const [count, setCount] = useState(getCount);
    useEffect(() => {
        const onResize = () => setCount(getCount());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return count;
}
function bucketItemsByColumn(items, numCols) {
    const cols = Array.from({ length: numCols }, () => []);
    items.forEach((item, i) => cols[i % numCols].push(item));
    return cols;
}

/* ---------------- price-editor math (same as the feed's own-row editor) ---------------- */

function threeTierFromSaleUnit(perSaleUnit, packSize, masterPackSize, hasOuter) {
    const d = deriveDisplayPrices(perSaleUnit, packSize, masterPackSize);
    return { unit: d.perBaseUnit, pack: d.perPack, master: hasOuter ? d.perMasterPack : null };
}
function saleUnitFromLevel(level, value, packSize, masterPackSize, hasOuter) {
    if (level === "unit") return hasOuter ? value * packSize * masterPackSize : value * packSize;
    if (level === "pack") return hasOuter ? value * masterPackSize : value;
    return value;
}

/* ---------------- scroll lock (for the price modal) ---------------- */

function useLenisScrollLock() {
    const lenis = useLenis();
    useEffect(() => {
        if (lenis && typeof lenis.stop === "function") lenis.stop();
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const inside = (e) => !!e.target?.closest?.(SCROLL_LOCK_ALLOW_SELECTOR);
        const block = (e) => { if (!inside(e)) e.preventDefault(); };
        const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
        const blockKeys = (e) => {
            if (!SCROLL_KEYS.includes(e.key) || inside(e)) return;
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
            e.preventDefault();
        };
        window.addEventListener("wheel", block, { passive: false, capture: true });
        window.addEventListener("touchmove", block, { passive: false, capture: true });
        window.addEventListener("keydown", blockKeys, { passive: false, capture: true });
        return () => {
            document.body.style.overflow = prevOverflow;
            if (lenis && typeof lenis.start === "function") lenis.start();
            window.removeEventListener("wheel", block, { capture: true });
            window.removeEventListener("touchmove", block, { capture: true });
            window.removeEventListener("keydown", blockKeys, { capture: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lenis]);
}

/* ============================ small pieces ============================ */

function WalletSummaryCard({ wallet, onClick }) {
    const isBlocked = wallet?.is_blocked;
    const balance = wallet
        ? `₹${(Number(wallet.balance_due) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
        : "—";
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full max-w-[150px] min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-150 hover:opacity-95 active:scale-[0.98] sm:max-w-[190px] sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
            style={{
                background: isBlocked
                    ? "linear-gradient(135deg, #c71f11, #a11a10)"
                    : "linear-gradient(135deg, #047084, #0B7285)",
            }}
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 sm:h-9 sm:w-9">
                <Wallet className="h-[15px] w-[15px] text-white sm:h-[17px] sm:w-[17px]" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-white/70 sm:text-[10px]">
                    {isBlocked ? "Orders paused" : "Wallet balance"}
                </span>
                <span className="mt-1 flex items-center gap-1">
                    <span className="truncate text-[18px] font-black leading-none tracking-tight text-white sm:text-[20px]">{balance}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/65 sm:h-[17px] sm:w-[17px]" strokeWidth={2.2} />
                </span>
            </span>
        </button>
    );
}

function FilterChip({ label, active, onClick, count }) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.96 }}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors duration-150"
            style={{
                background: active ? C.primary : "#fff",
                color: active ? "#fff" : C.ink,
                border: `1.5px solid ${active ? C.primary : C.hair}`,
            }}
        >
            {label}
            {count != null && (
                <span
                    className="rounded-full px-1.5 py-[1px] text-[10px] font-extrabold tabular-nums"
                    style={{ background: active ? "rgba(255,255,255,0.25)" : C.hairSoft, color: active ? "#fff" : C.muted }}
                >
                    {count}
                </span>
            )}
        </motion.button>
    );
}

// Same switch the feed uses for GST-inclusive / exclusive prices.
function GstToggle({ includeGst, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={includeGst}
            aria-label={`GST ${includeGst ? "included" : "excluded"}`}
            onClick={() => onChange(!includeGst)}
            className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full focus:outline-none"
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
            <span className="flex min-w-[44px] flex-col items-start leading-none">
                <span className="text-[9.5px] font-medium tracking-wider" style={{ color: C.ink }}>{includeGst ? "With" : "Without"}</span>
                <span className="mt-0 text-[11.5px] font-bold tracking-[0.02em] " style={{ color: includeGst ? C.secondary : "#7B858C" }}>
                    GST
                </span>
            </span>
        </button>
    );
}

function ActiveToggle({ isActive, busy, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label={`Listing ${isActive ? "live" : "paused"}`}
            onClick={() => !busy && onChange(!isActive)}
            disabled={busy}
            className="group inline-flex h-9 items-center gap-2 rounded-full transition-all duration-200 focus:outline-none disabled:opacity-60"
        >
            <span className="min-w-[44px] text-right text-[11px] font-bold tracking-[0.02em]" style={{ color: isActive ? C.secondary : "#7B858C" }}>
                {isActive ? "Live" : "Paused"}
            </span>
            <span
                className="relative flex h-5 w-10 shrink-0 items-center rounded-full p-0.5 transition-all duration-200"
                style={{ backgroundColor: isActive ? C.secondary : "#D9DEE2" }}
            >
                {busy ? (
                    <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                ) : (
                    <span
                        className="h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200"
                        style={{ transform: isActive ? "translateX(20px)" : "translateX(0px)" }}
                    />
                )}
            </span>
        </button>
    );
}

/* ---------------- slide to confirm (same gesture as the feed) ---------------- */

const SLIDE_KNOB = 40;
const SLIDE_PAD = 4;

function SlideToConfirm({ label, onConfirm, resetKey, disabled = false }) {
    const trackRef = useRef(null);
    const x = useMotionValue(0);
    const [maxX, setMaxX] = useState(0);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const measure = () => setMaxX(Math.max(0, el.offsetWidth - SLIDE_KNOB - SLIDE_PAD * 2));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        setConfirmed(false);
        animate(x, 0, { duration: 0.2 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const fillWidth = useTransform(x, (v) => v + SLIDE_KNOB + SLIDE_PAD * 2);
    const labelOpacity = useTransform(x, [0, Math.max(maxX * 0.6, 1)], [1, 0]);

    return (
        <div
            ref={trackRef}
            className="relative h-12 w-full select-none overflow-hidden rounded-full"
            style={{ background: C.hairSoft, opacity: disabled ? 0.5 : 1 }}
        >
            <motion.div
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
                style={{ width: fillWidth, background: `${C.primary}14` }}
            />
            <motion.p
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[11px] font-bold tracking-wide"
                style={{
                    color: C.muted,
                    paddingLeft: SLIDE_KNOB + SLIDE_PAD * 2,
                    paddingRight: SLIDE_KNOB + SLIDE_PAD * 2,
                    opacity: confirmed ? 1 : labelOpacity,
                }}
            >
                {confirmed ? "Saving…" : label}
            </motion.p>
            <motion.div
                drag={confirmed || disabled ? false : "x"}
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
                    x, top: SLIDE_PAD, left: SLIDE_PAD, width: SLIDE_KNOB, height: SLIDE_KNOB,
                    background: C.primary, cursor: disabled ? "not-allowed" : "grab", touchAction: "pan-y",
                }}
            >
                <ChevronRight className="h-4 w-4" />
            </motion.div>
        </div>
    );
}

/* ---------------- price editor modal ---------------- */

// Edits price AND (optionally) stages a promotion-services change. The single
// slide-to-confirm at the bottom saves whatever is pending.
function EditPriceModal({ it, includeGst, token, onApply, onClose }) {
    useLenisScrollLock();

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
    const [pendingPromo, setPendingPromo] = useState(null); // { keys, percent } — staged, not saved yet


    const commitLevel = (level) => (v) => {
        const rawNext = saleUnitFromLevel(level, v, packSize, masterPackSize, hasOuter);
        rawPerSaleUnitRef.current = rawNext;
        setPerSaleUnit(round2(rawNext));
        setValues({ ...threeTierFromSaleUnit(rawNext, packSize, masterPackSize, hasOuter), [level]: v });
    };

    const priceDirty = round2(perSaleUnit) !== canonicalPerSaleUnit;
    const dirty = priceDirty || !!pendingPromo;
    const resetKey = `${perSaleUnit}|${pendingPromo ? pendingPromo.keys.join(",") : ""}`;


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
        it.unit ? { level: "unit", label: `Per ${it.unit}`, value: values.unit, refValue: reference.unit } : null,
        { level: "pack", label: "Per Pack", value: values.pack, refValue: reference.pack },
        hasOuter ? { level: "master", label: "Per Master Pack", value: values.master, refValue: reference.master } : null,
    ].filter(Boolean);

    return createPortal(
        <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm"
            data-scroll-lock-allow=""
            data-lenis-prevent=""
            style={{ overscrollBehavior: "contain" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
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
                    <p className="text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>Update price</p>
                    <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>
                <p className="mt-1 text-[11.5px] font-semibold leading-snug tracking-wide" style={{ color: C.muted }}>
                    MOQ {it.moq} {saleUnitText}{Number(it.moq) === 1 ? "" : "s"} · {includeGst ? "GST included" : "GST excluded"}
                </p>

                <div className={`mt-4 grid gap-2.5 ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
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

                <PromotionRow
                    currentPercent={it.marketing_commission_percent}
                    pending={pendingPromo}
                    onClick={() => setPromoOpen(true)}
                />

                <div className="mt-5">
                    <SlideToConfirm
                        resetKey={resetKey}
                        disabled={!dirty}
                        label={dirty ? "Slide to confirm changes" : "Change the price or promotion first"}
                        onConfirm={handleConfirm}
                    />
                </div>
            </motion.div>

            <AnimatePresence>
                {promoOpen && (
                    <PromotionPlanModal
                        submission={it}
                        token={token}
                        title={toTitleCase(it.brand?.name || it.product_name || "Product")}
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

/* ============================== list row ============================== */

function BrandBadge({ name, image }) {
    if (!name) return null;
    const initials = name.trim().slice(0, 2).toUpperCase();
    return image ? (
        <img src={resizedImageUrl(image, { width: 128 })} alt="" loading="lazy" decoding="async" className="h-5 w-auto shrink-0 rounded-full object-cover" />
    ) : (
        <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold leading-none"
            style={{ background: `${C.secondary}18`, color: C.secondary }}
        >
            {initials}
        </span>
    );
}

// Price breakdown (same look as the feed's seller-row own-listing chip).
// Tapping it opens the price editor; pending listings render it read-only.
function PriceChip({ rows, onEdit, saving }) {
    const [pressed, setPressed] = useState(false);
    const interactive = !!onEdit;
    const Tag = interactive ? "button" : "div";

    return (
        <Tag
            {...(interactive
                ? {
                    type: "button",
                    "aria-label": "Edit price",
                    onClick: (e) => { e.stopPropagation(); onEdit(); },
                    onMouseDown: () => setPressed(true),
                    onMouseUp: () => setPressed(false),
                    onMouseLeave: () => setPressed(false),
                    disabled: saving,
                }
                : {})}
            className="flex flex-col items-end gap-1 rounded-xl border px-2 py-1.5 text-left transition-all duration-150 disabled:opacity-70 sm:px-2.5 sm:py-2"
            style={{
                borderColor: C.hair,
                background: pressed ? C.hairSoft : "#fff",
                transform: pressed ? "scale(0.98)" : "scale(1)",
                cursor: interactive ? "pointer" : "default",
            }}
        >
            {rows.length ? (
                <div className="grid items-baseline gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: "auto auto" }}>
                    {rows.map((r) => (
                        <div key={r.label} className="contents">
                            <span className="whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                ₹{inr(r.value)}
                            </span>
                            <span className="whitespace-nowrap text-left text-[9px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                /{r.label}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <span className="text-[13px] font-extrabold" style={{ color: C.muted }}>—</span>
            )}
            {interactive && (
                <span
                    className="mt-0.5 flex w-full items-center justify-center rounded-md px-2 py-1 text-[9.5px] font-bold tracking-wide"
                    style={{ background: pressed ? `${C.secondary}14` : C.hairSoft, color: C.secondary }}
                >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Edit price"}
                </span>
            )}
        </Tag>
    );
}

// Owner-only facts: stock, MOQ, lead time, promo budget, visibility.
// Mobile: 3 cells on the first line, 2 wider cells on the second.
// sm and up: all 5 in one line. Hairlines come from the 1px grid gap.
function OwnerInfoStrip({ cells, activeSection, onSelect }) {
    return (
        <div
            className="grid min-w-0 grid-cols-6 gap-px overflow-hidden rounded-xl border sm:grid-cols-5"
            style={{ borderColor: C.hair, background: C.hair }}
        >
            {cells.map(({ key, label, Icon, value, tone, section }, i) => {
                const isActive = !!activeSection && activeSection === section;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onSelect?.(section)}
                        aria-label={`Edit ${label}`}
                        aria-pressed={isActive}
                        className={`flex min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-2 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${isActive ? "" : "hover:bg-white active:bg-white"} ${i < 3 ? "col-span-2" : "col-span-3"} sm:col-span-1`}
                        style={{
                            background: isActive ? C.primary : C.surface,
                            ["--tw-ring-color"]: `${C.primary}55`,
                        }}
                    >
                        <span
                            className="flex max-w-full items-center gap-1 text-[8.5px] font-bold uppercase leading-none tracking-wider transition-colors duration-150"
                            style={{ color: isActive ? "rgba(255,255,255,0.65)" : C.muted }}
                        >
                            <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
                            <span className="truncate">{label}</span>
                        </span>
                        <span
                            className="w-full truncate text-[12px] font-extrabold leading-tight tracking-wide transition-colors duration-150"
                            style={{ color: isActive ? "#fff" : tone || C.ink }}
                        >
                            {value}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// One-tap renewal. Uses the validity the seller already saved on the listing;
// the duration it will apply is shown on the button itself.
// Same height / shape language as the "Edit details" and "Share" pills.
function RenewButton({ hours, busy, onClick, productName = "listing" }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            aria-busy={busy}
            aria-label={`Reactivate ${productName} for ${validityLabel(hours)}`}
            className="inline-flex h-9 min-w-[112px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-bold tracking-wide text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-80"
            style={{ background: C.primary }}
        >
            {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            <span>{busy ? "Reactivating..." : "Reactivate"}</span>
            {!busy && <span className="font-semibold text-white/65">· for {validityLabel(hours)}</span>}
        </button>
    );
}

// Inline notice shown between the product header and the info strip once a
// listing has expired. It never blurs or locks the row, so the seller can still
// read and edit everything; it just gives one clear, obvious action.
function ExpiredBanner({ expiresAt, hours, busy, productName, onRenew, reduceMotion }) {
    return (
        <motion.div
            key="expired-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
            style={{ overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="pt-3">
                <div
                    role="group"
                    aria-label="Listing expired"
                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                    style={{ background: "#FFF8E6", borderColor: "rgba(180,83,9,0.2)" }}
                >
                    <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "#fef3c7", color: "#b45309" }}
                    >
                        <Clock className="h-4 w-4" strokeWidth={2.3} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold leading-tight tracking-wide" style={{ color: "#92400E" }}>
                            Listing expired
                        </p>
                        <p className="mt-0.5 text-[10.5px] font-medium leading-snug tracking-wide" style={{ color: "#92400E" }}>
                            {expiresAt ? `Hidden from buyers since ${formatExpiryDate(expiresAt)}` : "Hidden from buyers"}
                        </p>
                    </div>
                    <RenewButton productName={productName} hours={hours} busy={busy} onClick={onRenew} />
                </div>
            </div>
        </motion.div>
    );
}

function ListingRow({
    it, idx, includeGst, isHighlighted, isEditing, editingSection, editor, token,
    togglingId, savingPriceId, nowMs, refreshingId, onRefresh,
    onToggleEdit, onActivate, onDeactivate, onOpenImage, onShare, onSavePrice,
}) {
    const rowRef = useRef(null);
    const [priceOpen, setPriceOpen] = useState(false);
    const reduceMotion = useReducedMotion();

    // Bring the opened editor into view after the expand animation starts.
    useEffect(() => {
        if (!isEditing) return;
        const t = setTimeout(() => rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 220);
        return () => clearTimeout(t);
    }, [isEditing]);

    const name = it.brand?.name || it.product_name || "Product";
    const brandName = it.brand?.brand_name || it.brand_name;
    const modelNo = it.model_no || it.brand?.model_no;
    const subLabel = [brandName, modelNo].filter(Boolean).join(" · ");
    const categoryName = isHiddenLabel(it.category_name) ? null : it.category_name;
    const subcategoryName = isHiddenLabel(it.subcategory_name) ? null : it.subcategory_name;
    const categoryLine = [categoryName, subcategoryName].filter(Boolean).join(" · ");

    const image = it.image || it.brand?.image;
    const gallery = it.images?.length ? it.images : it.brand?.images?.length ? it.brand.images : image ? [image] : [];

    const expiry = getListingExpiry(it, nowMs);
    const isExpired = expiry.expired;
    const isActive = it.is_active !== false && !isExpired;
    const isPending = it.review_status === "pending_review";
    const stock = it.stock_quantity;
    const sState = stockState(stock, it.moq);
    const isMTO = it.stock_type === "made_to_order";
    const saleUnit = saleUnitLabel(it.units_per_master_pack);
    const compact = compactSaleUnit(saleUnit);
    const rows = useMemo(() => priceRowsFor(it, includeGst), [it, includeGst]);

    // Renewal: only approved listings, and only once the listing has expired.
    // While it's still live the row just shows the countdown, no button.
    const renewHours = renewalHoursFor(it);
    const canRenew = it.review_status === "approved" && isExpired;
    const renewing = refreshingId === it.id;

    // The banner already says "expired", so the header badge would be a duplicate.
    const status = canRenew ? null : getListingStatus(it, isActive, sState, isExpired);

    // Brief "Renewed" confirmation on the validity line after a successful renewal.
    const [renewedFlash, setRenewedFlash] = useState(false);
    const wasExpired = useRef(isExpired);
    useEffect(() => {
        if (wasExpired.current && !isExpired) {
            setRenewedFlash(true);
            wasExpired.current = isExpired;
            const t = setTimeout(() => setRenewedFlash(false), 3500);
            return () => clearTimeout(t);
        }
        wasExpired.current = isExpired;
    }, [isExpired]);

    const showValidityRow = expiry.tracked && !isExpired;

    const leadRaw = isMTO
        ? (it.production_lead_time_days ?? it.lead_time)
        : (it.dispatch_time_days ?? it.lead_time);
    const leadNum = leadRaw != null && leadRaw !== "" && Number.isFinite(Number(leadRaw)) ? Number(leadRaw) : null;
    const daysText = (n) => `${n} ${n === 1 ? "day" : "days"}`;

    // Ready stock ships from what's on the shelf, so "0 days" is really
    // "ships right away". Only a real number above 0 is shown as days.
    // Made-to-order always shows its production time.
    const leadCell = isMTO
        ? { label: "Production", Icon: Clock, value: leadNum != null ? daysText(leadNum) : "—" }
        : sState === "out"
            ? { label: "Dispatch", Icon: Clock, value: "Restock first", tone: "#c71f11" }
            : leadNum > 0
                ? { label: "Dispatch", Icon: Clock, value: daysText(leadNum) }
                : { label: "Dispatch", Icon: Zap, value: "Ready to ship", tone: "#15803d" };
    const promo = it.marketing_commission_percent;
    const promoLegacy = !Array.isArray(it.marketing_services) || !it.marketing_services.length;

    const partial = it.visibility_mode === "restricted";

    const stockCell = isMTO
        ? { value: "Made to order", tone: C.ink }
        : stock == null
            ? { value: "Not set", tone: C.muted }
            : sState === "out"
                ? { value: "Out of stock", tone: "#c71f11" }
                : { value: `${fmtQty(stock)} ${compact}`, tone: sState === "low" ? "#b45309" : C.ink };

    const cells = [
        { key: "stock", section: "fulfilment", label: "Stock", Icon: Boxes, ...stockCell },
        { key: "moq", section: "packaging", label: "MOQ", Icon: Package, value: it.moq != null ? `${fmtQty(it.moq)} ${compact}` : "—" },
        { key: "lead", section: "fulfilment", ...leadCell },
        {
            key: "vis", section: "customPricing", label: "Visibility", Icon: Eye,
            value: partial ? "Partial" : "Full", tone: partial ? "#b45309" : "#15803d",
        },
        {
            key: "promo", section: "marketing", label: "Promo budget", Icon: Megaphone,
            value: promo != null && promo !== "" ? `${promo}%${promoLegacy ? " · legacy" : ""}` : "—",
            tone: promoLegacy ? "#b45309" : undefined,
        },
    ];

    const stop = (e) => e.stopPropagation();

    return (
        <motion.div
            ref={rowRef}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: Math.min(idx * 0.012, 0.12), ease: EASE }}
        >
            <motion.div
                animate={{ backgroundColor: isHighlighted ? "rgba(253,243,216,1)" : "rgba(253,243,216,0)" }}
                transition={{ duration: isHighlighted ? 0.18 : 1.2, ease: "easeOut" }}
            >
                <motion.div
                    className="relative overflow-hidden px-3 pb-3 pt-3 sm:px-4"
                    initial={false}
                    animate={{ backgroundColor: isEditing ? "rgba(11,17,22,0.05)" : "rgba(11,17,22,0)" }}
                    transition={{ duration: 0.4, ease: EASE }}
                >
                    {/* HEADER — image | product info | price (mirrors the feed's ProductRow) */}
                    <div className="transition-opacity duration-500" style={{ opacity: isActive ? 1 : 0.6 }}>
                        <div
                            role="button"
                            tabIndex={0}
                            aria-expanded={isEditing}
                            aria-label={isEditing ? "Close editor" : "Edit listing"}
                            onClick={() => onToggleEdit(it.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleEdit(it.id); } }}
                            className="grid w-full cursor-pointer grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 text-left"
                        >
                            {/* COL 1 — IMAGE */}
                            <div
                                className="relative flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                                style={{ background: C.imgBg }}
                                onClick={(e) => { e.stopPropagation(); if (gallery.length) onOpenImage({ images: gallery, index: 0, alt: name }); }}
                            >
                                {image ? (
                                    <img
                                        src={resizedImageUrl(image, { width: 256 })}
                                        alt=""
                                        loading={idx < 3 ? "eager" : "lazy"}
                                        decoding="async"
                                        className="h-full w-full cursor-zoom-in object-cover"
                                    />
                                ) : (
                                    <ImageIcon className="h-4 w-4" style={{ color: C.muted }} />
                                )}
                                {gallery.length > 1 && (
                                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/60 px-1 py-0.5 text-[8px] font-bold tracking-wide text-white">
                                        +{gallery.length - 1}
                                    </span>
                                )}
                            </div>

                            {/* COL 2 — PRODUCT INFO */}
                            <div className="flex min-h-[5rem] min-w-0 flex-col justify-center">
                                <p className="min-w-0 text-[14px] font-bold leading-tight tracking-wide sm:line-clamp-3 md:line-clamp-2" style={{ color: C.ink }}>
                                    {toTitleCase(name)}
                                </p>
                                {subLabel && (
                                    <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11.5px] font-bold uppercase tracking-wider" style={{ color: C.teal }}>
                                        <BrandBadge name={brandName} image={it.brand?.brand_image || it.brand_image} />
                                        <span className="truncate">{subLabel}</span>
                                    </p>
                                )}
                                {categoryLine && (
                                    <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                        {categoryLine}
                                    </p>
                                )}
                                <p className="mt-1 text-[10px] font-semibold leading-tight tracking-wide sm:text-[11px] md:text-[11.5px]" style={{ color: C.secondary }}>
                                    {packagingLabel(it.pack_size, it.units_per_master_pack, it.unit)}
                                </p>
                                {status && (
                                    <span
                                        className="mt-1.5 w-fit rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-wider"
                                        style={{ background: status.bg, color: status.fg }}
                                    >
                                        {status.label}
                                    </span>
                                )}
                            </div>

                            {/* COL 3 — PRICE (tap to edit) */}
                            <div className="flex shrink-0 items-center justify-end" onClick={stop}>
                                <PriceChip
                                    rows={rows}
                                    saving={savingPriceId === it.id}
                                    onEdit={!isPending && rows.length && it.gst_percent != null ? () => setPriceOpen(true) : undefined}
                                />
                            </div>
                        </div>
                    </div>

                    {/* EXPIRED BANNER — inline, never blocks the row. One tap renews. */}
                    <AnimatePresence initial={false}>
                        {canRenew && (
                            <ExpiredBanner
                                expiresAt={it.expires_at}
                                hours={renewHours}
                                busy={renewing}
                                reduceMotion={reduceMotion}
                                productName={toTitleCase(name)}
                                onRenew={() => onRefresh(it, renewHours)}
                            />
                        )}
                    </AnimatePresence>

                    {/* OWNER INFO STRIP */}
                    <div className="transition-opacity duration-500" style={{ opacity: isActive ? 1 : 0.6 }}>
                        <div className="mt-3" onClick={stop}>
                            <OwnerInfoStrip
                                cells={cells}
                                activeSection={isEditing ? editingSection : null}
                                onSelect={(section) => onToggleEdit(it.id, section)}
                            />
                        </div>
                    </div>

                    {it.rejection_reason && it.review_status === "rejected" && (
                        <p className="mt-2 text-[11px] font-semibold leading-snug tracking-wide" style={{ color: "#c71f11" }}>
                            {it.rejection_reason}
                        </p>
                    )}

                    {/* VALIDITY — countdown while live; briefly confirms a fresh renewal */}
                    {showValidityRow && (
                        <p
                            className="mt-2 flex min-w-0 items-center gap-1 text-[11px] font-semibold tracking-wide transition-colors duration-500"
                            style={{ color: renewedFlash ? "#15803d" : expiry.expiringSoon ? "#b45309" : C.muted }}
                            onClick={stop}
                            aria-live="polite"
                        >
                            {renewedFlash
                                ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.8} />
                                : <Clock className="h-3 w-3 shrink-0" strokeWidth={2.4} />}
                            <span className="truncate">
                                {renewedFlash ? "Renewed · " : ""}Live until {formatExpiryDate(it.expires_at)} · {formatTimeLeft(expiry.msLeft)} left
                            </span>
                        </p>
                    )}

                    {/* ACTIONS — share, edit details (dropdown), live switch */}
                    <div className="mt-2 flex items-center justify-between gap-2" onClick={stop}>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => onShare?.(it)}
                                aria-label="Share listing"
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 text-[11.5px] font-bold tracking-wide transition-colors duration-150 hover:bg-black/[0.03] active:scale-[0.98]"
                                style={{ borderColor: C.hair, color: C.ink }}
                            >
                                <Share2 className="h-3.5 w-3.5" strokeWidth={2.3} />
                                Share
                            </button>
                            <button
                                type="button"
                                onClick={() => onToggleEdit(it.id)}
                                aria-expanded={isEditing}
                                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[11.5px] font-bold tracking-wide transition-colors duration-150 hover:bg-black/[0.05] active:scale-[0.98]"
                                style={{ background: isEditing ? C.primary : C.hairSoft, color: isEditing ? "#fff" : C.ink }}
                            >
                                Edit details
                                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" strokeWidth={2.5} style={{ transform: isEditing ? "rotate(180deg)" : "none" }} />
                            </button>
                        </div>

                        {!isPending && !isExpired && (
                            <ActiveToggle isActive={isActive} busy={togglingId === it.id} onChange={(next) => (next ? onActivate(it.id) : onDeactivate(it.id))} />
                        )}
                    </div>
                </motion.div>

                {/* FULL EDIT FORM — inline dropdown, unchanged behaviour */}
                <AnimatePresence initial={false}>
                    {isEditing && (
                        <motion.div
                            key="inline-editor"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
                            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                            transition={{ duration: 0.22, ease: EASE }}
                            style={{ overflow: "hidden" }}
                            onClick={stop}
                        >
                            <div className="border-t px-3 pb-4 pt-3 sm:px-4" style={{ borderColor: C.hairSoft, background: "rgba(11,17,22,0.02)" }}>
                                {editor}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="h-px w-full" style={{ background: C.hairSoft }} />
            </motion.div>

            <AnimatePresence>
                {priceOpen && (
                    <EditPriceModal
                        it={it}
                        includeGst={includeGst}
                        token={token}
                        onClose={() => setPriceOpen(false)}
                        onApply={(payload) => { setPriceOpen(false); onSavePrice(it, payload); }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function RowSkeleton() {
    return (
        <div className="border-b px-3 py-3 sm:px-4" style={{ borderColor: C.hairSoft }}>
            <div className="flex items-center gap-3">
                <div className="h-20 w-16 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    <div className="h-2.5 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    <div className="h-2.5 w-1/3 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                </div>
                <div className="h-14 w-20 shrink-0 animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
            </div>
            <div className="mt-3 h-11 w-full animate-pulse rounded-xl" style={{ background: C.hairSoft }} />
        </div>
    );
}

/* ============================== main page ============================== */

export default function SellerManageListingsPage() {
    const { token, profile, registerResyncHandler, refreshProfile } = useAuth();
    const { socket } = useSocket();
    const navigate = useNavigate();

    const { reportRestockCount, reportWallet, markListingsViewed, markWalletTopupViewed } = useListings();

    const [wallet, setWallet] = useState(null);
    const [highlightedIds, setHighlightedIds] = useState(new Set());
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    // Which part of the edit form opens: null = the full form, otherwise a
    // section key ("fulfilment" | "packaging" | "pricing" | "customPricing").
    const [editingSection, setEditingSection] = useState(null);
    const [query, setQuery] = useState("");
    const [needsRestockOnly, setNeedsRestockOnly] = useState(false);
    const [includeGst, setIncludeGst] = useState(true);
    const [togglingId, setTogglingId] = useState(null);
    const [savingPriceId, setSavingPriceId] = useState(null);
    const [lightboxImage, setLightboxImage] = useState(null);

    const location = useLocation();
    const [toastMsg, setToastMsg] = useState(location.state?.toast || null);

    const [nowMs, setNowMs] = useState(() => Date.now());
    const [refreshingId, setRefreshingId] = useState(null);
    const [expiredOnly, setExpiredOnly] = useState(() => new URLSearchParams(location.search).get("filter") === "expired");

    useEffect(() => {
        // Clear the router state so refreshing/back-nav doesn't re-show the toast.
        if (location.state?.toast) window.history.replaceState({}, document.title);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const t = setInterval(() => setNowMs(Date.now()), 60000);
        return () => clearInterval(t);
    }, []);

    const isApprovedSeller = profile?.seller_status === "approved";

    const reload = useCallback(({ silent } = {}) => {
        if (!token || !isApprovedSeller) { setLoading(false); return; }
        if (!silent) setLoading(true);
        fetchMySellerSubmissions(token).then((res) => {
            if (res?.success) setItems(res.items || []);
            setLoading(false);
        });
    }, [token, isApprovedSeller]);

    useEffect(() => { reload(); }, [reload]);

    // Live updates straight from the real socket.io connection.
    useEffect(() => {
        if (!socket) return;
        const onSubmissionsChanged = () => reload({ silent: true });
        socket.on("submissions_changed", onSubmissionsChanged);
        return () => socket.off("submissions_changed", onSubmissionsChanged);
    }, [socket, reload]);

    useEffect(() => registerResyncHandler?.(() => reload({ silent: true })), [registerResyncHandler, reload]);

    // Safety net for changes that happened while the tab was unfocused.
    useEffect(() => {
        function onVisible() { if (document.visibilityState === "visible") { setNowMs(Date.now()); reload({ silent: true }); } }
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
    }, [reload]);

    useEffect(() => {
        if (!token || !isApprovedSeller) return;
        fetchWalletStatus(token).then((res) => { if (res?.success) setWallet(res.wallet); });
    }, [token, isApprovedSeller]);

    const stats = useMemo(() => {
        const total = items.length;
        const live = items.filter((it) => it.is_active !== false && it.review_status === "approved" && !getListingExpiry(it, nowMs).expired).length;
        const expired = items.filter((it) => getListingExpiry(it, nowMs).expired).length;
        const low = items.filter((it) => stockState(it.stock_quantity, it.moq) === "low").length;
        const out = items.filter((it) => stockState(it.stock_quantity, it.moq) === "out").length;
        return { total, live, expired, low, out };
    }, [items, nowMs]);

    const filtered = useMemo(() => {
        let list = items;
        if (expiredOnly) list = list.filter((it) => getListingExpiry(it, nowMs).expired);
        if (needsRestockOnly) list = list.filter((it) => stockState(it.stock_quantity, it.moq) !== "ok");
        const term = query.trim().toLowerCase();
        if (term) {
            list = list.filter((it) => {
                const name = (it.brand?.name || it.product_name || "").toLowerCase();
                const brand = (it.brand?.brand_name || it.brand_name || "").toLowerCase();
                return name.includes(term) || brand.includes(term);
            });
        }
        return list;
    }, [items, needsRestockOnly, expiredOnly, query, nowMs]);

    const columnCount = useResponsiveColumnCount();
    const columns = useMemo(() => bucketItemsByColumn(filtered, columnCount), [filtered, columnCount]);

    useEffect(() => {
        markListingsViewed().then((ids) => {
            if (!ids.length) return;
            setHighlightedIds(new Set(ids));
            const t = setTimeout(() => setHighlightedIds(new Set()), 5000);
            return () => clearTimeout(t);
        });
    }, [markListingsViewed]);

    useEffect(() => { reportRestockCount(stats.low + stats.out); }, [stats.low, stats.out, reportRestockCount]);
    useEffect(() => { if (wallet) reportWallet(wallet); }, [wallet, reportWallet]);

    function patchItem(id, patch) {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    }

    async function handleShare(it) {
        const name = it.brand?.name || it.product_name || "Product";
        const sellerName = profile?.shop_name || profile?.name || "this seller";
        const result = await shareProductLink({ submissionId: it.id, productName: name, sellerName });
        if (result === "copied") setToastMsg("Link copied to clipboard.");
    }

    async function setListingActive(id, active) {
        setTogglingId(id);
        const res = await setSellerSubmissionActive(token, id, active);
        setTogglingId(null);
        if (res?.success) patchItem(id, res.submission);
        else setToastMsg(res?.message || "Couldn't update the listing. Try again.");
    }
    const activateListing = (id) => setListingActive(id, true);
    const deactivateListing = (id) => setListingActive(id, false);

    // Runs when the price modal's slide-to-confirm completes. It can save the
    // price, the staged promotion plan, or both. The price updates instantly
    // (and rolls back on failure); the promotion patch lands once the server accepts it.
    async function handleSavePrice(it, { basePrice, priceBasis, finalInclusive, priceChanged, promotionServices }) {
        setSavingPriceId(it.id);
        let priceOk = null;
        let promoOk = null;
        let failMsg = null;

        if (priceChanged) {
            const prev = { price: it.price, base_price: it.base_price };
            patchItem(it.id, { price: finalInclusive, base_price: basePrice });
            let res = null;
            try {
                res = await updateSellerProductSubmission(token, it.id, {
                    basePrice: String(basePrice), priceBasis, gstInclusive: false,
                });
            } catch { res = null; }
            priceOk = !!res?.success;
            if (!priceOk) {
                patchItem(it.id, prev);
                failMsg = res?.message || "Couldn't update the price. Try again.";
            }
        }

        if (promotionServices) {
            const r = await savePromotionPlan(token, it.id, promotionServices);
            promoOk = r.ok;
            if (r.ok) patchItem(it.id, r.patch);
            else failMsg = failMsg || r.message || "Couldn't update the promotion. Try again.";
        }

        setSavingPriceId(null);
        const msg = saveResultMessage({ priceOk, promoOk, failMsg });
        if (msg) setToastMsg(msg);
        if (priceOk || promoOk) reload({ silent: true });
    }

    // One-tap renewal: `hours` is the validity already saved on the listing.
    // The guard on refreshingId stops double taps from firing two requests.
    async function handleRefreshListing(it, hours) {
        if (refreshingId) return false;
        setRefreshingId(it.id);
        let res = null;
        try { res = await refreshSellerSubmission(token, it.id, hours); } catch { res = null; }
        setRefreshingId(null);
        if (res?.success && res.submission) {
            patchItem(it.id, res.submission);
            setNowMs(Date.now());
            setToastMsg(`Listing renewed. Live until ${formatExpiryDate(res.submission.expires_at)}.`);
            reload({ silent: true });
            return true;
        }
        setToastMsg(res?.message || "Couldn't renew the listing. Try again.");
        return false;
    }

    // One editor open at a time.
    // - Header / "Edit details" (no section): opens the full form, or closes it.
    // - A strip cell (section): opens just that section; tapping the same cell
    //   again closes it, tapping a different cell switches sections.
    function toggleEdit(id, section = null) {
        if (editingId === id && (section === null || section === editingSection)) {
            setEditingId(null);
            setEditingSection(null);
            return;
        }
        setEditingId(id);
        setEditingSection(section);
    }

    function closeEditor() {
        setEditingId(null);
        setEditingSection(null);
    }

    function handleEditSaved(id, submission, message) {
        patchItem(id, submission);
        setEditingId(null);
        setEditingSection(null);
        setToastMsg(message);
        reload({ silent: true });
    }

    if (!isApprovedSeller) {
        if (profile?.seller_status === "pending_review") {
            return (
                <>
                    <div className="min-h-screen" style={{ background: "#FFFFFF" }}>
                        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#047084,#7fb3bd)" }}>
                                <Clock className="h-6 w-6" />
                            </span>
                            <h2 className="mt-4 text-[19px] font-extrabold" style={{ color: C.ink }}>Your shop is under review</h2>
                            <p className="mt-2 text-[13.5px] font-medium" style={{ color: C.muted }}>
                                We're verifying your details — you'll be able to manage listings once your shop is approved. This usually takes 24–48 hours.
                            </p>
                        </div>
                    </div>
                    <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
                </>
            );
        }

        // No seller record yet, or previously rejected — show onboarding. On
        // submit the seller is auto-approved server-side; refreshProfile()
        // re-renders this component as the real dashboard.
        return (
            <>
                <SellerOnboardingForm onSubmitted={() => refreshProfile?.()} />
                <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
            </>
        );
    }

    return (
        <div className="min-h-screen bg-[#FFFFFF] text-slate-900 antialiased">
            <main className="mx-auto max-w-7xl px-2.5 pb-12 pt-5 sm:px-4 lg:px-6">
                <div className="grid grid-cols-2 items-end gap-3 ps-2 sm:gap-6">
                    <div className="min-w-0">
                        <h1 className="text-[22px] font-black leading-tight tracking-tight sm:text-[28px]" style={{ color: C.ink }}>
                            My Products
                        </h1>
                        <p className="mt-1 text-[12px] font-semibold leading-tight tracking-wide sm:text-[13px]" style={{ color: C.muted }}>
                            {stats.total} listing{stats.total === 1 ? "" : "s"}
                            <span className="mx-1">·</span>
                            {stats.live} live
                            {stats.expired > 0 && (<><span className="mx-1">·</span><span style={{ color: "#c71f11" }}>{stats.expired} expired</span></>)}
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <WalletSummaryCard
                            wallet={wallet}
                            onClick={async () => {
                                await markWalletTopupViewed();
                                navigate("/seller/wallet");
                            }}
                        />
                    </div>
                </div>

                {/* search + quick controls */}
                <div className="mt-4 flex flex-col gap-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.muted }} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search your listings by product or brand…"
                            className="w-full rounded-full border bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                            style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }}
                        />
                    </div>

                    <div className="flex items-center gap-2 px-1">
                        {/* Scrollable filter chips */}
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
                            <FilterChip
                                label="Needs restock"
                                active={needsRestockOnly}
                                onClick={() => setNeedsRestockOnly((v) => !v)}
                                count={stats.low + stats.out}
                            />

                            {(stats.expired > 0 || expiredOnly) && (
                                <FilterChip
                                    label="Expired"
                                    active={expiredOnly}
                                    onClick={() => setExpiredOnly((v) => !v)}
                                    count={stats.expired}
                                />
                            )}

                            <FilterChip
                                label="Marketing"
                                active={false}
                                onClick={() => navigate("/seller/marketing")}
                            />
                        </div>

                        {/* GST always stays visible */}
                        <div className="shrink-0">
                            <GstToggle
                                includeGst={includeGst}
                                onChange={setIncludeGst}
                            />
                        </div>
                    </div>
                </div>

                {/* list */}
                <div className="-mx-3 mt-4 overflow-hidden bg-white sm:mx-0 sm:rounded-2xl sm:border" style={{ borderColor: C.hair }}>
                    {loading && (
                        <div className="flex divide-x" style={{ borderColor: C.hair }}>
                            {Array.from({ length: columnCount }).map((_, colIdx) => (
                                <div key={colIdx} className="min-w-0 flex-1">
                                    {Array.from({ length: Math.ceil(5 / columnCount) }).map((_, i) => <RowSkeleton key={i} />)}
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                            <Package className="h-6 w-6" style={{ color: C.hair }} />
                            <p className="text-[13.5px] font-bold" style={{ color: C.ink }}>
                                {items.length === 0 ? "You haven't listed anything yet" : "Nothing matches these filters"}
                            </p>
                            <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>
                                {items.length === 0 ? "List your first product to start selling." : "Try a different search or filter."}
                            </p>
                            {items.length === 0 && (
                                <button
                                    type="button"
                                    onClick={() => navigate("/seller/sell")}
                                    className="mt-2 rounded-xl px-4 py-2 text-[12.5px] font-bold text-white"
                                    style={{ background: C.secondary }}
                                >
                                    List a product
                                </button>
                            )}
                        </div>
                    )}

                    {!loading && filtered.length > 0 && (
                        <div className="flex divide-x" style={{ borderColor: C.hair }}>
                            {columns.map((colItems, colIdx) => (
                                <div key={colIdx} className="min-w-0 flex-1">
                                    <AnimatePresence initial={false}>
                                        {colItems.map((it, i) => (
                                            <ListingRow
                                                key={it.id}
                                                it={it}
                                                idx={i * columnCount + colIdx}
                                                includeGst={includeGst}
                                                token={token}
                                                isHighlighted={highlightedIds.has(it.id)}
                                                isEditing={editingId === it.id}
                                                nowMs={nowMs} refreshingId={refreshingId} onRefresh={handleRefreshListing}
                                                editingSection={editingSection}
                                                editor={
                                                    editingId === it.id ? (
                                                        <EditListingModal
                                                            inline
                                                            token={token}
                                                            submissionId={it.id}
                                                            key={`${it.id}-${editingSection || "all"}`}
                                                            focusSection={editingSection}
                                                            onClose={closeEditor}
                                                            onSaved={handleEditSaved}
                                                        />
                                                    ) : null
                                                }
                                                togglingId={togglingId}
                                                savingPriceId={savingPriceId}
                                                onToggleEdit={toggleEdit}
                                                onActivate={activateListing}
                                                onDeactivate={deactivateListing}
                                                onOpenImage={setLightboxImage}
                                                onShare={handleShare}
                                                onSavePrice={handleSavePrice}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {lightboxImage && createPortal(
                <ImageLightbox images={lightboxImage.images} initialIndex={lightboxImage.index} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />,
                document.body
            )}

            <Toast message={toastMsg} show={!!toastMsg} onDone={() => setToastMsg(null)} />
            <FloatingSellButton to="/seller/sell" label="Sell" />
        </div>
    );
}