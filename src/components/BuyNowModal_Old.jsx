// components/BuyNowModal.jsx — SINGLE-PAGE FLOW
//
// Top to bottom, in the order a buyer thinks:
//   1. WHAT am I buying   -> header: tappable product image (lightbox), name, brand, seller, tags
//   2. RULES              -> quantity card: selected qty, pack info, slabs / discounts
//   3. WHAT DOES IT COST  -> always-visible price summary (+ pay-on-credit for approved buyers)
//   4. WHERE / HOW        -> delivery address (shared BuyerAddressContext), transport, estimate
//   5. DETAILS            -> seller terms + full product details (both closed by default)
//
// STICKY FOOTER (thumb zone): quantity stepper + total, Add to cart, and ONE primary button:
//   - no transport preference yet -> "Select transport & Buy now"
//   - transport already set       -> "Buy now"
// Quantity warnings (below MOQ / out of stock / exceeds stock) show in the footer, right
// next to the stepper being tapped.
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import PaymentQRModal from "./PaymentQRModal.jsx";
import AddressBook from "./shipping/AddressBook.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import {
    Loader2, Lock, CheckCircle2, X, Plus, MapPin, Minus, Layers, FileText, Calendar, Beaker,
    Package, Truck, ReceiptText, CreditCard, Boxes, ShoppingCart, ChevronDown, AlertCircle,
    Share2, Info, Zap, Store, Maximize2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { BuyerAddressProvider, useBuyerAddress } from "../context/BuyerAddressContext.jsx";
import {
    fetchCheckoutStatus, fetchOrderQuote,
    placeOrder, cancelMyOrder, fetchCreditStatus,
    requestCreditIncrease as requestCreditIncreaseApi, fetchBrandItemDetail, fetchOrderConstraints,
} from "../utils/api.js";
import { addToCart } from "../utils/cartApi.js";
import { saveOrderFormSession, loadOrderFormSession, clearOrderFormSession } from "../utils/orderFormSession.js";
import { clearPaymentSession } from "../utils/paymentSession.js";
import { C, EASE, Label, ChipToggleGroup } from "./seller/listingForm/FormPrimitives.jsx";
import { purchaseQtyToSaleUnitQty, saleUnitQtyToBaseUnits, hasOuterPack, saleUnitLabel, round2 } from "../shared/packUnits.js";
import { checkOrderWindow, checkLocationServiceable } from "../shared/orderConstraints.js";
import TransportPreferenceModal from "./transport/TransportPreferenceModal.jsx";
import { shareProductLink } from "../utils/share.js";
import { routeTransportModeLabel, getRouteTransportFields } from "../../shared/routeTransportFields.js";
import { fetchBuyerTransportPreference } from "../utils/api.transport.js";
import { resizedImageUrl } from "../utils/imageUrl";
import { useOrderResume } from "../context/OrderResumeContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";

/* ============================================================
   Pure logic — unchanged
   ============================================================ */

const BASIS_OPTIONS = [
    { value: "per_pack", label: "Packs" },
    { value: "per_master_pack", label: "Master packs" },
];

function getVisibleBasisOptions(seller) {
    const hasMasterPack = Number(seller?.masterPackSize) >= 1;
    return hasMasterPack
        ? BASIS_OPTIONS.filter((o) => o.value === "per_master_pack")
        : BASIS_OPTIONS.filter((o) => o.value === "per_pack");
}

function resolveSlabUnitPrice(priceSlabs, quantity, fallbackPrice) {
    if (!Array.isArray(priceSlabs) || !priceSlabs.length) return { price: fallbackPrice, slab: null };
    const applicable = priceSlabs
        .filter((s) => Number(s.minQty) > 0 && quantity >= Number(s.minQty) && (!s.maxQty || quantity <= Number(s.maxQty)))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    if (!applicable.length) return { price: fallbackPrice, slab: null };
    return { price: Number(applicable[0].price), slab: applicable[0] };
}
function inr(n) {
    const val = Number(n) || 0;
    return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function resolveDiscountPercent(quantityDiscounts, quantity) {
    if (!Array.isArray(quantityDiscounts) || !quantityDiscounts.length) return { percent: 0, tier: null };
    const applicable = quantityDiscounts
        .filter((d) => Number(d.minQty) > 0 && quantity >= Number(d.minQty))
        .sort((a, b) => Number(b.minQty) - Number(a.minQty));
    if (!applicable.length) return { percent: 0, tier: null };
    return { percent: Number(applicable[0].discountPercent) || 0, tier: applicable[0] };
}

function toBaseUnits(seller, quantity, basis) {
    const packSize = Number(seller.packSize) > 0 ? Number(seller.packSize) : 1;
    const masterPackSize = Number(seller.masterPackSize) > 0 ? Number(seller.masterPackSize) : 1;
    if (basis === "per_master_pack") return quantity * packSize * masterPackSize;
    return quantity * packSize;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDDMon(date) {
    return `${String(date.getDate()).padStart(2, "0")} ${MONTH_SHORT[date.getMonth()]}`;
}

function computeMinQuantity(seller, basis) {
    const moqSaleUnits = Number(seller?.moq) || 0;
    if (!moqSaleUnits) return 1;
    const pack = Number(seller?.packSize) > 0 ? Number(seller.packSize) : 1;
    const master = Number(seller?.masterPackSize) > 0 ? Number(seller.masterPackSize) : 1;
    const moqBaseUnits = moqSaleUnits * (hasOuterPack(master) ? pack * master : pack);
    if (basis === "per_master_pack") return Math.max(1, Math.ceil(moqBaseUnits / (pack * master)));
    if (basis === "per_unit") return Math.max(1, Math.ceil(moqBaseUnits));
    return Math.max(1, Math.ceil(moqBaseUnits / pack));
}

function formatMoqForBasis(moqSaleUnits, seller) {
    const label = saleUnitLabel(seller?.masterPackSize);
    const n = Number(moqSaleUnits) || 0;
    return `${n} ${label}${n === 1 ? "" : "s"}`;
}

function computeLocalQuote(seller, quantity, basis, isSample) {
    const qty = Number(quantity);
    if (!seller || !(qty > 0)) return null;

    const saleQty = purchaseQtyToSaleUnitQty(qty, basis, seller.packSize, seller.masterPackSize);
    const pack = Number(seller.packSize) > 0 ? Number(seller.packSize) : 1;
    const master = Number(seller.masterPackSize) > 0 ? Number(seller.masterPackSize) : 1;
    const baseQty = saleQty * (hasOuterPack(master) ? pack * master : pack);

    if (isSample) {
        const unitPrice = Number(seller.samplePrice) || 0;
        return {
            orderType: "sample", quantity: qty, saleUnitQuantity: saleQty, basis,
            unit: seller.unit, unitPrice,
            grossSubtotal: round2(unitPrice * baseQty), discountAmount: 0, subtotal: round2(unitPrice * baseQty),
            exceedsSampleQuantity: seller.sampleQuantity != null && baseQty > Number(seller.sampleQuantity),
            sampleQuantity: seller.sampleQuantity, estimatedDeliveryDate: null, isEstimate: true,
        };
    }
    if (!(Number(seller.price) > 0)) return null;

    const pricePerSaleUnit = Number(seller.price);
    const { price: slabPrice, slab: appliedSlab } = resolveSlabUnitPrice(seller.priceSlabs, saleQty, pricePerSaleUnit);
    const { percent: discountPercent, tier: discountTier } = resolveDiscountPercent(seller.quantityDiscounts, saleQty);
    const unitPrice = round2(slabPrice * (1 - discountPercent / 100));

    const moq = Number(seller.moq) || 0;
    const availableStock = seller.availableStock != null ? Number(seller.availableStock) : null;
    const stockShortfall = seller.stockType !== "made_to_order" && availableStock != null && saleQty > availableStock;
    const outOfStock = seller.stockType !== "made_to_order" && availableStock != null
        && (moq > 0 ? availableStock < moq : availableStock <= 0);

    const grossSubtotal = round2(slabPrice * saleQty);
    const subtotal = round2(unitPrice * saleQty);
    const discountAmount = round2(grossSubtotal - subtotal);

    return {
        orderType: "standard", quantity: qty, saleUnitQuantity: saleQty, basis, unit: seller.unit,
        unitPrice, basePriceApplied: slabPrice, appliedSlab, discountPercent, discountTier,
        grossSubtotal, discountAmount, subtotal, moq,
        meetsMoq: moq ? saleQty >= moq : true,
        availableStock, stockShortfall, outOfStock, estimatedDeliveryDate: null, isEstimate: true,
    };
}

function normalizeQuote(raw) {
    if (!raw) return raw;
    const isSample = raw.orderType === "sample";
    const acceptanceFields = {
        acceptingNow: raw.acceptingNow,
        acceptanceMessage: raw.acceptanceMessage,
        acceptanceDelayDays: raw.acceptanceDelayDays || 0,
        acceptanceWindowLabel: raw.acceptanceWindowLabel,
    };

    if (isSample) {
        const subtotal = Number(raw.subtotal) || 0;
        return {
            ...raw, ...acceptanceFields,
            baseUnitQuantity: Number(raw.quantity) || 0,
            grossSubtotal: raw.grossSubtotal != null ? Number(raw.grossSubtotal) : subtotal,
            discountAmount: 0,
            discountPercent: 0,
        };
    }

    const saleUnitQuantity = Number(raw.saleUnitQuantity ?? raw.quantity) || 0;
    const subtotal = Number(raw.subtotal) || 0;
    const discountPercent = Number(raw.discountPercent) || 0;

    let basePriceApplied = raw.basePriceApplied != null ? Number(raw.basePriceApplied) : null;
    if (basePriceApplied == null) {
        const unitPrice = Number(raw.unitPrice) || 0;
        basePriceApplied = discountPercent > 0 ? round2(unitPrice / (1 - discountPercent / 100)) : unitPrice;
    }

    let grossSubtotal = raw.grossSubtotal != null ? Number(raw.grossSubtotal) : round2(basePriceApplied * saleUnitQuantity);
    if (grossSubtotal < subtotal) grossSubtotal = subtotal;

    const discountAmount = raw.discountAmount != null ? Number(raw.discountAmount) : round2(grossSubtotal - subtotal);

    return { ...raw, ...acceptanceFields, saleUnitQuantity, grossSubtotal, discountAmount, discountPercent };
}

function pick(obj, ...keys) {
    for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
}
const isHiddenLabel = (name) => typeof name === "string" && name.trim().toLowerCase() === "pending";

/* ============================================================
   Presentational primitives
   ============================================================ */

function Stepper({ value, onChange, min = 1, max }) {
    const atMax = max != null && Number(value) >= Number(max);
    const atMin = Number(value) <= Number(min);
    return (
        <div className="flex items-center overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.hair }}>
            <button type="button" aria-label="Decrease quantity" disabled={atMin} onClick={() => onChange(Math.max(min, Number(value) - 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center transition-colors duration-150 active:bg-black/[0.06] hover:bg-black/[0.03] disabled:opacity-30 disabled:hover:bg-transparent">
                <Minus className="h-4 w-4" style={{ color: C.ink }} />
            </button>
            <div className="h-11 w-px" style={{ background: C.hair }} />
            <input type="text" inputMode="numeric" value={value} aria-label="Quantity"
                onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
                className="h-11 w-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-extrabold tabular-nums tracking-wide focus:outline-none"
                style={{ color: C.ink }} />
            <div className="h-11 w-px" style={{ background: C.hair }} />
            <button type="button" aria-label="Increase quantity" disabled={atMax} onClick={() => onChange(Number(value) + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center transition-colors duration-150 active:bg-black/[0.06] hover:bg-black/[0.03] disabled:opacity-30 disabled:hover:bg-transparent">
                <Plus className="h-4 w-4" style={{ color: C.ink }} />
            </button>
        </div>
    );
}

function Notice({ tone = "warn", children }) {
    const tones = {
        warn: { background: "#FEF6E7", color: "#92600A" },
        danger: { background: "#FDECEC", color: "#B3261E" },
        info: { background: `${C.secondary}0f`, color: C.secondary },
    };
    const t = tones[tone] || tones.warn;
    return (
        <div className="flex items-start gap-2 rounded-xl px-2.5 py-2" style={{ background: t.background }}>
            <AlertCircle className="mt-[1px] h-4 w-4 shrink-0" style={{ color: t.color }} />
            <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: t.color }}>{children}</p>
        </div>
    );
}

function SkeletonBar({ width = "70%" }) {
    return <span className="inline-block h-3.5 animate-pulse rounded" style={{ width, background: C.hairSoft }} />;
}

function QuoteRow({ label, value, tone, small }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className={`font-medium tracking-wide ${small ? "text-[12.5px]" : "text-[13.5px]"}`} style={{ color: tone || C.muted }}>{label}</span>
            <span className={`shrink-0 tabular-nums font-bold tracking-wide ${small ? "text-[12.5px]" : "text-[13.5px]"}`} style={{ color: tone || C.ink }}>{value}</span>
        </div>
    );
}

function Card({ icon: Icon, title, right, children }) {
    return (
        <section className="rounded-2xl border bg-white p-3.5 sm:p-4" style={{ borderColor: C.hair }}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>
                    {Icon && <Icon className="h-3.5 w-3.5" />} {title}
                </p>
                {right}
            </div>
            <div className="flex flex-col gap-3">{children}</div>
        </section>
    );
}

function Collapse({ icon: Icon, title, hint, defaultOpen = false, children }) {
    return (
        <details open={defaultOpen} className="group rounded-2xl border bg-white p-3.5 sm:p-4" style={{ borderColor: C.hair }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />}
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.muted }}>{title}</span>
                    {hint && <span className="truncate text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>· {hint}</span>}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: C.muted }} />
            </summary>
            <div className="mt-3 border-t pt-3" style={{ borderColor: C.hairSoft }}>{children}</div>
        </details>
    );
}

function Fact({ label, value }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex items-baseline justify-between gap-3 border-b py-2 text-[12.5px] last:border-b-0" style={{ borderColor: C.hairSoft }}>
            <span className="shrink-0 font-semibold tracking-wide" style={{ color: C.muted }}>{label}</span>
            <span className="text-right font-bold tracking-wide" style={{ color: C.ink }}>{String(value)}</span>
        </div>
    );
}

function Pill({ icon: Icon, tone = "neutral", children }) {
    const tones = {
        neutral: { background: C.hairSoft, color: C.muted },
        teal: { background: "#006F8314", color: "#006F83" },
        warn: { background: "#f59e0b1a", color: "#b45309" },
        purple: { background: "#7c3aed14", color: "#7c3aed" },
    };
    const t = tones[tone] || tones.neutral;
    return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-bold tracking-wide whitespace-nowrap" style={t}>
            {Icon && <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />} {children}
        </span>
    );
}

function TransportFields({ mode, fields }) {
    const rows = getRouteTransportFields(mode)
        .map((f) => ({ f, val: fields?.[f.key] }))
        .filter((x) => x.val);
    if (!rows.length) return null;
    return (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {rows.map(({ f, val }) => (
                <div key={f.key} className="flex items-baseline gap-1.5">
                    <span className="shrink-0 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>{f.label.replace(/\s*\(if any\)\s*/i, "")}:</span>
                    <span className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{val}</span>
                </div>
            ))}
        </div>
    );
}

/* ============================================================
   Main component
   ============================================================ */

function BuyNowModalInner({ seller, product, onClose, resumeIntent: resumeIntentProp, deferPriceUntilConfirmed = false }) {
    const { token, profile } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { reportApproved, reportRejected, registerActive, unregisterActive } = useOrderResume();
    const { socket } = useSocket();
    const { addresses, selectedAddress, loading: addressLoading, selectAddress } = useBuyerAddress();

    const [access, setAccess] = useState(() =>
        profile && (profile.email_verified || profile.phone_verified)
            ? { canCheckout: true, profile }
            : undefined
    );

    // ---- Delivery address (shared context; already loaded on Home) ----
    const addressBookRef = useRef(null);
    const selectedAddressId = selectedAddress?.id || null;
    const effectivePincode = selectedAddress?.pincode || "";
    const effectiveState = selectedAddress?.state || "";
    const effectiveCity = selectedAddress?.city || "";

    const restoreAddressIdRef = useRef(null);
    useEffect(() => {
        if (!restoreAddressIdRef.current || !addresses.length) return;
        const target = addresses.find((a) => a.id === restoreAddressIdRef.current);
        restoreAddressIdRef.current = null;
        if (target) selectAddress(target);
    }, [addresses, selectAddress]);

    const [awaitingPaymentOrderId, setAwaitingPaymentOrderId] = useState(null);
    const [orderMode, setOrderMode] = useState("standard"); // standard | sample | credit
    const isSample = orderMode === "sample";
    const isCredit = orderMode === "credit";

    const defaultBasis = useMemo(
        () => (Number(seller?.masterPackSize) >= 1 ? "per_master_pack" : "per_pack"),
        [seller?.masterPackSize]
    );

    const [basis, setBasis] = useState(defaultBasis);
    const minQuantity = useMemo(() => computeMinQuantity(seller, basis), [seller, basis]);
    const visibleBasisOptions = useMemo(() => getVisibleBasisOptions(seller), [seller?.masterPackSize]); // eslint-disable-line react-hooks/exhaustive-deps
    const [quantity, setQuantity] = useState(() => computeMinQuantity(seller, defaultBasis));
    const userPickedBasis = useRef(false);
    const belowMoq = !isSample && Number(quantity) < minQuantity;

    const [transportPreference, setTransportPreference] = useState(seller?.transportPreference ?? null);
    const [pendingTransportProposal, setPendingTransportProposal] = useState(seller?.transportPendingProposal ?? null);
    const transportPrefRef = useRef(transportPreference);
    transportPrefRef.current = transportPreference;

    useEffect(() => {
        setTransportPreference(seller?.transportPreference ?? null);
        setPendingTransportProposal(seller?.transportPendingProposal ?? null);
    }, [seller?.transportPreference, seller?.transportPendingProposal]);

    useEffect(() => { if (!userPickedBasis.current) setBasis(defaultBasis); }, [defaultBasis]);
    useEffect(() => {
        if (basis === "per_master_pack" && !(Number(seller?.masterPackSize) >= 1)) setBasis("per_pack");
    }, [basis, seller?.masterPackSize]);
    useEffect(() => {
        if (basis === "per_pack" && Number(seller?.masterPackSize) >= 1) setBasis("per_master_pack");
    }, [basis, seller?.masterPackSize]);
    useEffect(() => {
        if (isSample) return;
        setQuantity((q) => (Number(q) < minQuantity ? minQuantity : q));
    }, [minQuantity, isSample]);

    const [notes, setNotes] = useState("");
    const [quote, setQuote] = useState(null);

    const maxQuantity = !isSample && seller?.stockType === "ready_stock"
        ? (quote?.availableStock ?? seller?.availableStock ?? null)
        : null;
    const exceedsStock = !isSample && maxQuantity != null && Number(quantity) > Number(maxQuantity);
    const outOfStock = !isSample && (
        quote?.outOfStock || (maxQuantity != null && maxQuantity < minQuantity)
    );

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const [toast, setToast] = useState(null);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const quoteTimer = useRef(null);
    const [showTransportModal, setShowTransportModal] = useState(false);
    const autoPlaceRef = useRef(false);
    const [transportRemovedNotice, setTransportRemovedNotice] = useState(null);
    const isFirstQuoteRef = useRef(true);
    const requestIdRef = useRef(0);
    const pendingQuoteRef = useRef(Promise.resolve());
    const [quoteFailed, setQuoteFailed] = useState(false);
    const standardBasisRef = useRef(defaultBasis);

    useEffect(() => {
        if (!isSample && basis !== "per_unit") standardBasisRef.current = basis;
    }, [isSample, basis]);

    useEffect(() => {
        if (!isSample && basis === "per_unit") {
            const restoredBasis = standardBasisRef.current || defaultBasis;
            setBasis(restoredBasis);
            setQuantity(computeMinQuantity(seller, restoredBasis));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSample]);

    // ---- Product details (image, specs, description…) — non-blocking ----
    const [detail, setDetail] = useState(null);
    useEffect(() => {
        if (!product?.id) return;
        let cancelled = false;
        fetchBrandItemDetail(product.id)
            .then((res) => { if (!cancelled && res?.success) setDetail(res.item); })
            .catch(() => { /* header still renders from `product` */ });
        return () => { cancelled = true; };
    }, [product?.id]);

    // ---- Credit (pay on credit for approved buyers; requesting credit is NOT offered here) ----
    const [creditStatus, setCreditStatus] = useState(null);
    useEffect(() => {
        if (!seller?.offerId || !token) return;
        fetchCreditStatus(token, { submissionId: seller.offerId }).then((res) => setCreditStatus(res?.credit || null));
    }, [seller?.offerId, token]);

    const canBuyOnCredit = creditStatus?.status === "approved";
    const [requestingIncrease, setRequestingIncrease] = useState(false);
    const creditRemaining = creditStatus
        ? Math.max(Number(creditStatus.credit_limit || 0) - Number(creditStatus.credit_used || 0), 0)
        : 0;
    const crossesCreditLimit = isCredit && canBuyOnCredit && !!quote && Number(quote.subtotal || 0) > creditRemaining;
    const limitIncreasePending = !!creditStatus?.limit_increase_request_message_id;
    const limitIncreaseCooldownActive = !!creditStatus?.limit_increase_cooldown_until
        && new Date(creditStatus.limit_increase_cooldown_until) > new Date();
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    const handleRequestCreditIncrease = async () => {
        if (!creditStatus?.id) return;
        setRequestingIncrease(true);
        const res = await requestCreditIncreaseApi(token, creditStatus.id);
        setRequestingIncrease(false);
        if (!res?.success) { setError(res?.message || "Couldn't send the request for a higher limit."); return; }
        setCreditStatus((prev) => (prev ? { ...prev, limit_increase_request_message_id: "pending" } : prev));
    };

    useEffect(() => { if (isCredit && !canBuyOnCredit) setOrderMode("standard"); }, [isCredit, canBuyOnCredit]);

    // Instant local quote, then the confirmed server quote below.
    useEffect(() => {
        if (deferPriceUntilConfirmed) return; // never show a non-custom estimate
        if (!(Number(quantity) > 0)) { setQuote(null); return; }
        setQuote((prev) => {
            const local = computeLocalQuote(seller, quantity, basis, isSample);
            return local ? normalizeQuote(local) : prev;
        });
    }, [seller, quantity, basis, isSample, effectivePincode, effectiveState, deferPriceUntilConfirmed]);

    useEffect(() => {
        const lenis = window.lenis;
        lenis?.stop?.();
        return () => { lenis?.start?.(); };
    }, []);

    useEffect(() => {
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = original; };
    }, []);

    useEffect(() => {
        const pref = transportPrefRef.current;
        if (!pref?.destCity || !pref?.destState) return;
        if (!effectiveCity || !effectiveState) return;
        const sameRoute =
            pref.destCity.trim().toLowerCase() === effectiveCity.trim().toLowerCase() &&
            pref.destState.trim().toLowerCase() === effectiveState.trim().toLowerCase();
        if (!sameRoute) setTransportPreference(null);
    }, [effectiveCity, effectiveState]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await fetchCheckoutStatus(token);
            if (!cancelled) setAccess(res?.success ? res : { canCheckout: false, reason: "NOT_AUTHENTICATED" });
        })();
        return () => { cancelled = true; };
    }, [token]);

    const [constraints, setConstraints] = useState(null);
    useEffect(() => {
        if (!seller?.offerId) return;
        fetchOrderConstraints(seller.offerId).then((res) => { if (res?.success) setConstraints(res); });
    }, [seller?.offerId]);

    const [clockTick, setClockTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setClockTick((t) => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    // Informational ONLY — a closed seller never blocks placing an order.
    const windowStatus = useMemo(
        () => checkOrderWindow(constraints ? {
            workingDays: constraints.workingDays,
            orderAcceptanceStart: constraints.orderAcceptanceStart,
            orderAcceptanceEnd: constraints.orderAcceptanceEnd,
            holidays: constraints.holidays,
        } : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [constraints, clockTick]
    );

    const locationStatus = useMemo(() => {
        if (!/^\d{6}$/.test(effectivePincode || "")) return { serviceable: true };
        return checkLocationServiceable(constraints?.dispatchingLocations, { state: effectiveState, city: effectiveCity });
    }, [constraints, effectivePincode, effectiveState, effectiveCity]);
    const blockedByConstraints = !locationStatus.serviceable;

    useEffect(() => {
        if (isSample) {
            const sampleQty = Number(seller?.sampleQuantity) > 0 ? Number(seller.sampleQuantity) : 1;
            setQuantity(sampleQty);
            userPickedBasis.current = false;
            setBasis("per_unit");
        }
    }, [isSample, seller?.sampleQuantity]);

    // Server quote (debounced; first one immediate)
    useEffect(() => {
        if (!seller?.offerId || !(Number(quantity) > 0)) return;
        clearTimeout(quoteTimer.current);
        const myRequestId = ++requestIdRef.current;
        const qtyAtSchedule = quantity;
        const basisAtSchedule = basis;
        const sampleAtSchedule = isSample;
        const addressAtSchedule = selectedAddressId;
        const destPincodeAtSchedule = effectivePincode;
        const destStateAtSchedule = effectiveState;

        const delay = isFirstQuoteRef.current ? 0 : 300;
        isFirstQuoteRef.current = false;

        pendingQuoteRef.current = new Promise((resolve) => {
            quoteTimer.current = setTimeout(async () => {
                const res = await fetchOrderQuote(seller.offerId, qtyAtSchedule, {
                    purchaseBasis: basisAtSchedule,
                    orderType: sampleAtSchedule ? "sample" : "standard",
                    addressId: addressAtSchedule || undefined,
                    destPincode: addressAtSchedule ? undefined : destPincodeAtSchedule,
                    destState: addressAtSchedule ? undefined : destStateAtSchedule,
                    token,
                });
                if (myRequestId === requestIdRef.current && res?.success) {
                    const confirmed = normalizeQuote({ ...res, isEstimate: false });
                    setQuote(confirmed);
                    setQuoteFailed(false);
                    resolve(confirmed);
                } else {
                    if (myRequestId === requestIdRef.current) setQuoteFailed(true);
                    resolve(null);
                }
            }, delay);
        });

        return () => clearTimeout(quoteTimer.current);
    }, [seller?.offerId, quantity, basis, isSample, selectedAddressId, effectivePincode, effectiveState]); // eslint-disable-line react-hooks/exhaustive-deps

    const awaitQuote = () => Promise.race([
        pendingQuoteRef.current,
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    // ---- Transport preference for this route (one merged check per route) ----
    const lastCheckedRouteRef = useRef(null);
    useEffect(() => {
        if (!effectiveCity || !effectiveState || !seller?.sellerId) return;
        const routeKey = `${effectiveState.trim().toLowerCase()}::${effectiveCity.trim().toLowerCase()}`;
        if (lastCheckedRouteRef.current === routeKey) return;
        lastCheckedRouteRef.current = routeKey;

        let cancelled = false;
        (async () => {
            const res = await fetchBuyerTransportPreference(seller.sellerId, effectiveState, effectiveCity, token);
            if (cancelled) return;

            const cur = transportPrefRef.current;
            const sameAsCurrent =
                cur?.destCity?.trim().toLowerCase() === effectiveCity.trim().toLowerCase() &&
                cur?.destState?.trim().toLowerCase() === effectiveState.trim().toLowerCase();

            const pendingProposal = res?.pendingProposal
                ? { ...res.pendingProposal, destCity: effectiveCity, destState: effectiveState }
                : null;
            setPendingTransportProposal(pendingProposal);

            if (res?.rejectedNotice) {
                setTransportPreference(null);
                setTransportRemovedNotice(
                    `Your proposed transport option (${res.rejectedNotice.summary}) wasn't accepted by the seller.` +
                    (res.rejectedNotice.reason ? ` Reason: ${res.rejectedNotice.reason}` : "")
                );
                if (res.rejectedNotice.routeOptionId) reportRejected(res.rejectedNotice.routeOptionId, res.rejectedNotice.reason || null);
                return;
            }
            if (res?.invalidated) {
                setTransportPreference(null);
                setTransportRemovedNotice("The seller no longer offers your previously selected transport option.");
                return;
            }
            if (sameAsCurrent) return;
            if (res?.success && res.decided) {
                setTransportPreference(res.preference ? { ...res.preference, destCity: effectiveCity, destState: effectiveState } : null);
                setTransportRemovedNotice(null);
            } else {
                setTransportPreference(null);
            }
        })();

        return () => {
            cancelled = true;
            if (lastCheckedRouteRef.current === routeKey) lastCheckedRouteRef.current = null;
        };
    }, [effectiveCity, effectiveState, seller?.sellerId, token]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- Place order ----
    const handleSubmit = async (override = {}) => {
        setError(null);
        if (!selectedAddressId) return setError("Please add a delivery address first.");
        if (!locationStatus.serviceable) return setError(locationStatus.message);

        if (!isSample && Number(quantity) < minQuantity) {
            return setError(`Minimum order quantity is ${minQuantity} ${moqUnitLabel}${minQuantity === 1 ? "" : "s"}.`);
        }
        if (!isSample && maxQuantity != null && Number(quantity) > Number(maxQuantity)) {
            return setError(Number(maxQuantity) <= 0
                ? "This item is currently out of stock with this seller."
                : `You can order at most ${maxQuantity} ${saleUnitLabel(seller?.masterPackSize)}${Number(maxQuantity) === 1 ? "" : "s"} from this seller.`);
        }
        if (!(Number(quantity) > 0)) return setError("Please enter a valid quantity.");

        const routeOptionId = override.routeOptionId ?? transportPreference?.routeOptionId;
        if (!routeOptionId) return setError("Please select a transport preference.");

        setSubmitting(true);
        const confirmed = await awaitQuote();
        const finalQuote = confirmed || quote;
        const effectiveOrderType = isSample ? "sample" : isCredit ? "credit" : "standard";

        if (finalQuote) {
            if (effectiveOrderType === "sample" && finalQuote.exceedsSampleQuantity) {
                setSubmitting(false);
                return setError(`Sample quantity is capped at ${finalQuote.sampleQuantity} ${finalQuote.unit}.`);
            }
            if (effectiveOrderType !== "sample" && finalQuote.meetsMoq === false) {
                setSubmitting(false);
                return setError(`Minimum order quantity is ${formatMoqForBasis(finalQuote.moq, seller)}.`);
            }
        }

        const res = await placeOrder(token, {
            submissionId: seller.offerId,
            quantity: Number(quantity),
            purchaseBasis: basis,
            orderType: effectiveOrderType,
            shippingAddressId: selectedAddressId,
            notes: notes.trim() || undefined,
            transportRouteOptionId: routeOptionId,
        });
        setSubmitting(false);
        if (!res?.success) return setError(res?.message || "Couldn't place the order.");

        if (res.orderStatus === "awaiting_payment") {
            saveOrderFormSession({
                orderId: res.orderId, seller, product, quantity, basis,
                selectedAddressId, notes, orderMode: effectiveOrderType,
            });
            setAwaitingPaymentOrderId(res.orderId);
        } else {
            setDone(res);
        }
    };

    const handleAddToCart = async () => {
        setError(null);
        if (quote && quote.meetsMoq === false) return setError(`Minimum order quantity is ${formatMoqForBasis(quote.moq, seller)}.`);
        if (maxQuantity != null && Number(quantity) > Number(maxQuantity)) {
            return setError(`You can order at most ${maxQuantity} ${saleUnitLabel(seller?.masterPackSize)}${Number(maxQuantity) === 1 ? "" : "s"} from this seller.`);
        }
        const confirmed = await awaitQuote();
        const finalQuote = confirmed || quote;
        if (finalQuote && finalQuote.meetsMoq === false) return setError(`Minimum order quantity is ${formatMoqForBasis(finalQuote.moq, seller)}.`);
        setSubmitting(true);
        const res = await addToCart(token, { submissionId: seller.offerId, quantity: Number(quantity), purchaseBasis: basis });
        setSubmitting(false);
        if (!res?.success) return setError(res?.message || "Couldn't add to cart.");
        onClose();
        navigate("/cart");
    };

    const restoreFromSession = (session) => {
        if (!session) return;
        setQuantity(session.quantity);
        userPickedBasis.current = true;
        setBasis(session.basis);
        restoreAddressIdRef.current = session.selectedAddressId || null;
        setNotes(session.notes || "");
        setOrderMode(session.orderMode || "standard");
    };

    useEffect(() => {
        const session = loadOrderFormSession();
        if (session && session.seller?.offerId === seller?.offerId && session.orderId) restoreFromSession(session);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumeAppliedRef = useRef(false);
    useEffect(() => {
        const ri = resumeIntentProp || location.state?.resumeIntent;
        if (!ri || resumeAppliedRef.current) return;
        if (ri.source !== "buynow" || ri.offerId !== seller?.offerId) return;
        resumeAppliedRef.current = true;

        setQuantity(ri.quantity);
        userPickedBasis.current = true;
        setBasis(ri.basis);
        setOrderMode(ri.orderMode || "standard");
        setNotes(ri.notes || "");
        restoreAddressIdRef.current = ri.addressId || null;

        if (ri.resolvedMode) {
            setTransportPreference({
                routeOptionId: ri.resolvedRouteOptionId,
                mode: ri.resolvedMode,
                fields: ri.resolvedFields,
                destCity: ri.destCity,
                destState: ri.destState,
            });
            setPendingTransportProposal(null);
        }
        navigate(location.pathname + location.search, { replace: true, state: {} });
    }, [location.state, seller?.offerId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCloseToEdit = () => {
        const session = loadOrderFormSession(awaitingPaymentOrderId);
        restoreFromSession(session);
        clearPaymentSession();
        clearOrderFormSession();
        setAwaitingPaymentOrderId(null);
    };

    const handleBackToEdit = async () => {
        if (awaitingPaymentOrderId) {
            const res = await cancelMyOrder(token, awaitingPaymentOrderId, "Buyer went back to edit the order before paying");
            if (!res?.success) console.warn("Couldn't cancel the pending order before going back:", res?.message);
        }
        clearPaymentSession();
        setAwaitingPaymentOrderId(null);
    };

    const gateContent = {
        NOT_AUTHENTICATED: {
            title: "Sign in to place an order",
            body: "You'll need to sign in to your BBM Marketplace account first.",
            cta: "Sign in",
            action: () => navigate("/login", { state: { from: location.pathname + location.search } }),
        },
        NOT_VERIFIED: {
            title: "Verify your contact details",
            body: "We need a verified email or phone so sellers know you're a genuine buyer.",
            cta: "Verify now",
            action: () => navigate("/account", { state: { from: location.pathname + location.search } }),
        },
    }[access?.reason] || { title: "Can't place an order right now", body: "Please try again in a moment.", cta: "Close", action: onClose };

    useEffect(() => {
        if (!pendingTransportProposal?.routeOptionId || !seller?.sellerId || !effectiveCity || !effectiveState) return;
        let cancelled = false;
        (async () => {
            const res = await fetchBuyerTransportPreference(
                seller.sellerId, effectiveState, effectiveCity, token, pendingTransportProposal.routeOptionId
            );
            if (cancelled || !res?.success) return;
            if (res.checkedProposalStatus === "approved") {
                const resolved = {
                    routeOptionId: pendingTransportProposal.routeOptionId,
                    mode: pendingTransportProposal.mode,
                    fields: pendingTransportProposal.fields,
                    summary: pendingTransportProposal.summary,
                    destCity: effectiveCity, destState: effectiveState,
                };
                setTransportPreference(resolved);
                setPendingTransportProposal(null);
                setTransportRemovedNotice(null);
                reportApproved(pendingTransportProposal.routeOptionId, resolved);
            } else if (res.checkedProposalStatus === "rejected") {
                setPendingTransportProposal(null);
                setTransportPreference(null);
                setTransportRemovedNotice(
                    `Your proposed transport option (${pendingTransportProposal.summary}) wasn't accepted by the seller.` +
                    (res.rejectedReason ? ` Reason: ${res.rejectedReason}` : "")
                );
                reportRejected(pendingTransportProposal.routeOptionId, res.rejectedReason || null);
            }
        })();
        return () => { cancelled = true; };
    }, [clockTick, pendingTransportProposal?.routeOptionId, seller?.sellerId, effectiveCity, effectiveState, token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!socket) return;
        const onNotif = async (payload) => {
            const routeOptionId = payload?.routeOptionId;
            if (!routeOptionId) return;
            if (!pendingTransportProposal || pendingTransportProposal.routeOptionId !== routeOptionId) return;

            if (payload.type === "transport_proposal_approved") {
                const res = await fetchBuyerTransportPreference(seller.sellerId, effectiveState, effectiveCity, token, routeOptionId);
                if (res?.checkedProposalStatus === "approved" && res?.preference) {
                    const resolved = {
                        routeOptionId: pendingTransportProposal.routeOptionId,
                        mode: pendingTransportProposal.mode,
                        fields: pendingTransportProposal.fields,
                        summary: pendingTransportProposal.summary,
                        destCity: effectiveCity, destState: effectiveState,
                    };
                    setTransportPreference(resolved);
                    setPendingTransportProposal(null);
                    setTransportRemovedNotice(null);
                    reportApproved(routeOptionId, resolved);
                }
            } else if (payload.type === "transport_proposal_rejected") {
                setPendingTransportProposal(null);
                setTransportPreference(null);
                setTransportRemovedNotice(
                    `Your proposed transport option (${pendingTransportProposal.summary}) wasn't accepted by the seller.` +
                    (payload.reason ? ` Reason: ${payload.reason}` : "")
                );
                reportRejected(routeOptionId, payload.reason || null);
            }
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket, pendingTransportProposal, seller?.sellerId, effectiveCity, effectiveState, token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const key = pendingTransportProposal?.routeOptionId || resumeIntentProp?.proposalRouteOptionId || null;
        if (!key) return;
        registerActive(key);
        return () => unregisterActive(key);
    }, [pendingTransportProposal?.routeOptionId, resumeIntentProp?.proposalRouteOptionId, registerActive, unregisterActive]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2200);
        return () => clearTimeout(t);
    }, [toast]);

    /* ---------------- derived display values ---------------- */
    const moqUnitLabel = basis === "per_master_pack" ? "Master Pack" : "Pack";
    const basisLabel = basis === "per_pack" ? "pack(s)" : basis === "per_master_pack" ? "master pack(s)" : (seller?.unit || "units");
    const deliveryDateLabel = (val) => (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val) ? formatDDMon(new Date(val)) : val);
    const canSample = seller?.sampleAvailable;

    // While deferring, no price is shown until the server has confirmed it.
    const priceLoading = deferPriceUntilConfirmed && !quoteFailed && (!quote || quote.isEstimate);

    const productName = product?.name || pick(detail, "name");
    const brandName = product?.brand_name || product?.brandName || pick(detail, "brand_name", "brandName");
    const brandNotApplicable = pick(detail, "brand_not_applicable", "brandNotApplicable");
    const modelNo = product?.model_no || pick(detail, "model_no", "modelNo");
    const gradeVariant = pick(detail, "grade_variant", "gradeVariant");
    const manufacturer = pick(detail, "manufacturer");
    const description = pick(detail, "description");
    const manufacturingDetails = pick(detail, "manufacturing_details", "manufacturingDetails");
    const specifications = detail?.specifications || [];
    const categoryLabel = [product?.category_name || pick(detail, "category_name"), product?.subcategory_name || pick(detail, "subcategory_name")]
        .filter((x) => x && !isHiddenLabel(x)).join(" · ");
    const galleryImages = detail?.images?.length ? detail.images : (detail?.image ? [detail.image] : []);
    const heroImage = product?.image || galleryImages[0] || null;
    const brandImage = product?.brand_image || pick(detail, "brand_image", "brandImage");
    const subLabel = [brandNotApplicable ? null : brandName, modelNo].filter(Boolean).join(" · ");
    const packagingLine = Number(seller?.packSize) > 0
        ? `1 pack = ${seller.packSize} ${seller.unit}${Number(seller?.masterPackSize) >= 1 ? ` · 1 master pack = ${seller.masterPackSize} packs` : ""}`
        : null;
    const leadDays = seller?.stockType === "made_to_order" ? seller?.productionLeadTimeDays : seller?.dispatchTimeDays;

    const hasTerms = seller && (seller.deliveryTimeline || seller.paymentTerms || seller.returnPolicy || seller.warranty || seller.freightIncluded != null || seller.dispatchOrigin);
    const hasProductDetails = !!(manufacturer || modelNo || gradeVariant || description || manufacturingDetails || specifications.length || galleryImages.length > 1);

    // One quantity warning at a time, shown in the footer next to the stepper.
    const qtyNotice = isSample ? null
        : outOfStock ? "This item is currently out of stock with this seller."
            : exceedsStock ? `You can order at most ${maxQuantity} ${saleUnitLabel(seller?.masterPackSize)}${Number(maxQuantity) === 1 ? "" : "s"} from this seller. Please reduce the quantity.`
                : quote && quote.meetsMoq === false ? `Below the seller's MOQ of ${formatMoqForBasis(quote.moq, seller)}.`
                    : null;

    /* ---------------- primary CTA ---------------- */
    const needsTransport = !transportPreference;
    const waitingApproval = needsTransport && !!pendingTransportProposal;
    const verb = isSample ? "Request sample" : isCredit ? "Buy on credit" : "Buy now";
    const ctaLabel = !selectedAddressId
        ? "Add delivery address"
        : waitingApproval
            ? "Waiting for seller approval"
            : needsTransport
                ? `Select transport & ${verb === "Buy now" ? "Buy now" : verb.toLowerCase()}`
                : verb;
    const ctaDisabled = submitting || addressLoading || blockedByConstraints || waitingApproval || priceLoading
        || (!isSample && (belowMoq || outOfStock || exceedsStock)) || crossesCreditLimit;
    const ctaBackground = isSample
        ? "linear-gradient(135deg, #006F83 0%, #047084 100%)"
        : isCredit
            ? "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)"
            : "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)";

    const handlePrimary = () => {
        setError(null);
        if (!selectedAddressId) { addressBookRef.current?.openChange(); return; }
        if (!transportPreference) {
            if (pendingTransportProposal) return;
            autoPlaceRef.current = true;
            setShowTransportModal(true);
            return;
        }
        handleSubmit();
    };

    const stopScrollPropagation = useCallback((e) => { e.stopPropagation(); }, []);

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Place order"
                className="bbm-buynow relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                onClick={(e) => e.stopPropagation()}>

                {awaitingPaymentOrderId ? (
                    <PaymentQRModal
                        token={token}
                        orderId={awaitingPaymentOrderId}
                        onClose={handleCloseToEdit}
                        onBack={handleBackToEdit}
                        onDoneViewOrders={() => navigate("/orders")}
                    />
                ) : done ? (
                    <div className="flex flex-col items-center px-6 py-10 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg" style={{ background: "linear-gradient(135deg,#047084,#0B9FB8)" }}>
                            <CheckCircle2 className="h-8 w-8" />
                        </span>
                        <h2 className="mt-5 text-[19px] font-bold tracking-tight" style={{ color: C.ink }}>
                            {done.orderType === "sample" ? "Sample requested" : done.paymentMethod === "credit" ? "Order placed on credit" : "Order placed"}
                        </h2>
                        <p className="mt-1.5 rounded-full bg-[#FCFBF9] px-3 py-1 font-mono text-[12px] font-semibold" style={{ color: C.secondary }}>{done.orderNumber}</p>
                        <p className="mt-3 max-w-sm text-[13px] font-medium leading-relaxed" style={{ color: C.muted }}>{done.message}</p>

                        {done.estimatedDeliveryDate && (
                            <p className="mt-3 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold" style={{ background: `${C.secondary}0f`, color: C.secondary }}>
                                <Calendar className="h-3.5 w-3.5" /> Estimated delivery {deliveryDateLabel(done.estimatedDeliveryDate)}
                            </p>
                        )}
                        {done.stockShortfall && (
                            <div className="mt-4 w-full">
                                <Notice tone="warn">This item is short on stock right now — fulfilment may take a little longer than usual.</Notice>
                            </div>
                        )}
                        <div className="mt-7 flex w-full gap-2.5">
                            <button onClick={onClose} className="flex-1 rounded-xl border py-3 text-[13.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>Keep browsing</button>
                            <button onClick={() => navigate("/orders")} className="flex-1 rounded-xl py-3 text-[13.5px] font-bold text-white shadow-sm" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>View orders</button>
                        </div>
                    </div>
                ) : access === undefined ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: C.muted }} /></div>
                ) : !access.canCheckout ? (
                    <div className="flex flex-col items-center px-6 py-10 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg" style={{ background: "linear-gradient(135deg,#047084,#0B9FB8)" }}>
                            <Lock className="h-6 w-6" />
                        </span>
                        <h2 className="mt-5 text-[18px] font-bold tracking-tight" style={{ color: C.ink }}>{gateContent.title}</h2>
                        <p className="mt-2 max-w-xs text-[13px] font-medium leading-relaxed" style={{ color: C.muted }}>{gateContent.body}</p>
                        <button onClick={gateContent.action} className="mt-6 rounded-xl px-6 py-3 text-[13.5px] font-bold text-white shadow-sm" style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>{gateContent.cta}</button>
                    </div>
                ) : (
                    <>
                        {/* ============ 1. HEADER — what am I buying ============ */}
                        <div className="shrink-0 border-b px-4 py-3.5 sm:px-5" style={{ borderColor: C.hairSoft }}>
                            <div className="flex items-start gap-3">
                                {/* Tappable image -> lightbox */}
                                <button type="button" disabled={!heroImage} onClick={() => heroImage && setLightboxSrc(heroImage)}
                                    aria-label="View product image"
                                    className="relative flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                                    style={{ background: "#F4F5F6", cursor: heroImage ? "zoom-in" : "default" }}>
                                    {heroImage
                                        ? <img src={resizedImageUrl(heroImage, { width: 256 })} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                        : <Package className="h-5 w-5" style={{ color: C.muted }} />}
                                    {heroImage && (
                                        <span className="absolute bottom-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/60 p-[3px] text-white">
                                            <Maximize2 className="h-2.5 w-2.5" />
                                        </span>
                                    )}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em]" style={{ color: C.secondary }}>Place order</p>
                                    <h2 className="mt-0.5 line-clamp-2 text-[15.5px] font-extrabold leading-tight tracking-wide" style={{ color: C.ink }}>{productName}</h2>
                                    {subLabel && (
                                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "#006F83" }}>
                                            {brandImage && !brandNotApplicable && (
                                                <img src={resizedImageUrl(brandImage, { width: 64 })} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
                                            )}
                                            <span className="truncate">{subLabel}</span>
                                        </p>
                                    )}
                                    {categoryLabel && <p className="mt-0.5 truncate text-[10.5px] font-medium tracking-wide" style={{ color: C.muted }}>{categoryLabel}</p>}
                                    <p className="mt-1 flex items-center gap-1 truncate text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                        <Store className="h-3 w-3 shrink-0" /> <span className="truncate">Sold by {seller?.display_name}{seller?.dispatchOrigin ? ` · ${seller.dispatchOrigin}` : ""}</span>
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                        onClick={async () => {
                                            const result = await shareProductLink({
                                                submissionId: seller.offerId, productName: product?.name, sellerName: seller?.display_name,
                                            });
                                            if (result === "copied") setToast("Link copied!");
                                        }}
                                        aria-label="Share this seller's listing"
                                        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                                        <Share2 className="h-4 w-4" style={{ color: C.muted }} />
                                    </button>
                                    <button onClick={onClose} aria-label="Close"
                                        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                                        <X className="h-[18px] w-[18px]" style={{ color: C.muted }} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ============ BODY ============ */}
                        <div className="flex-1 overflow-y-auto" data-lenis-prevent
                            onWheel={stopScrollPropagation} onTouchStart={stopScrollPropagation} onTouchMove={stopScrollPropagation}>
                            <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">

                                {canSample && (
                                    <div className="flex gap-1 rounded-xl bg-[#FCFBF9] p-1">
                                        {[{ v: "standard", t: "Standard order" }, { v: "sample", t: "Order a sample", icon: Beaker }].map(({ v, t, icon: Icon }) => (
                                            <button key={v} type="button" onClick={() => setOrderMode(v)}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold tracking-wide transition-all duration-150"
                                                style={(v === "sample" ? isSample : !isSample)
                                                    ? { background: "#fff", color: v === "sample" ? "#D2462B" : C.secondary, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                                                    : { color: C.muted }}>
                                                {Icon && <Icon className="h-3.5 w-3.5" />} {t}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {isSample && (
                                    <p className="-mt-1 px-1 text-[12px] font-medium" style={{ color: C.muted }}>
                                        {seller.samplePrice ? `Sample price: ₹${inr(seller.samplePrice)}/${seller.unit}` : "This sample is free."}
                                    </p>
                                )}

                                {(qtyNotice || error) && (
                                    <div className="mb-2.5 flex flex-col gap-2">
                                        {deferPriceUntilConfirmed && quoteFailed && !quote && (
                                            <Notice tone="danger">Couldn't load the latest price. Change the quantity or reopen this link to retry.</Notice>
                                        )}
                                        {qtyNotice && <Notice tone="danger">{qtyNotice}</Notice>}
                                        {error && <Notice tone="danger">{error}</Notice>}
                                    </div>
                                )}
                                {!windowStatus.open && windowStatus.message && (
                                    <div className="mb-1"><Notice tone="warn">{windowStatus.message}</Notice></div>
                                )}

                                {/* ============ 2. QUANTITY (rules + summary; the stepper lives in the footer) ============ */}
                                <Card icon={Package} title="Quantity" right={!isSample ? (
                                    <span className="text-[11px] font-bold tracking-wide" style={{ color: C.muted }}>MOQ {minQuantity} {moqUnitLabel}{minQuantity === 1 ? "" : "s"}</span>
                                ) : null}>
                                    {!isSample && packagingLine && (
                                        <div className="flex items-center gap-2 rounded-lg bg-[#FCFBF9] px-3 py-2">
                                            <Boxes className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                            <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.ink }}>{packagingLine}</p>
                                        </div>
                                    )}

                                    {!isSample && visibleBasisOptions.length > 1 && (
                                        <ChipToggleGroup dense value={basis} onChange={(v) => { userPickedBasis.current = true; setBasis(v); }} options={visibleBasisOptions} />
                                    )}

                                    {isSample ? (
                                        <div className="flex items-center justify-between rounded-xl bg-[#FCFBF9] px-3.5 py-3">
                                            <span className="text-[16px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                                {quantity} {seller?.unit}
                                                {Number(seller?.packSize) > 0 && (
                                                    <span className="ml-1.5 text-[11.5px] font-semibold" style={{ color: C.muted }}>
                                                        (~{round2(Number(quantity) / Number(seller.packSize))} pack{round2(Number(quantity) / Number(seller.packSize)) === 1 ? "" : "s"})
                                                    </span>
                                                )}
                                            </span>
                                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold" style={{ color: C.muted }}>Fixed by seller</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FCFBF9] px-3.5 py-3">
                                            <p className="min-w-0 text-[13.5px] font-extrabold tabular-nums tracking-wide capitalize" style={{ color: C.ink }}>
                                                {quantity || 0} {basisLabel}
                                                {Number(seller?.packSize) > 0 && (
                                                    <span className="ml-1.5 text-[11.5px] font-semibold normal-case" style={{ color: C.muted }}>
                                                        = {toBaseUnits(seller, Number(quantity) || 0, basis)} {seller?.unit}
                                                    </span>
                                                )}
                                            </p>
                                            <span className="shrink-0 text-[10.5px] font-bold tracking-wide" style={{ color: C.muted }}>Adjust below ↓</span>
                                        </div>
                                    )}

                                    {!isSample && !priceLoading && Array.isArray(seller?.priceSlabs) && seller.priceSlabs.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.ink }}>
                                                <Layers className="h-3.5 w-3.5" style={{ color: C.secondary }} /> Price slabs
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {seller.priceSlabs.map((slab, i) => {
                                                    const active = quote?.appliedSlab && Number(quote.appliedSlab.minQty) === Number(slab.minQty);
                                                    return (
                                                        <span key={i} className="rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
                                                            style={active ? { borderColor: C.secondary, background: `${C.secondary}14`, color: C.secondary } : { borderColor: C.hair, color: C.muted }}>
                                                            {slab.minQty}{slab.maxQty ? `–${slab.maxQty}` : "+"} {moqUnitLabel.toLowerCase()}{Number(slab.maxQty || slab.minQty) === 1 ? "" : "s"}: ₹{inr(slab.price)}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {!isSample && !priceLoading && Array.isArray(seller?.quantityDiscounts) && seller.quantityDiscounts.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: C.ink }}>
                                                <Layers className="h-3.5 w-3.5" style={{ color: "#D2462B" }} /> Quantity discounts
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {seller.quantityDiscounts.map((tier, i) => {
                                                    const active = quote?.discountTier && Number(quote.discountTier.minQty) === Number(tier.minQty);
                                                    const tierUnitLabel = Number(seller?.masterPackSize) >= 1 ? "master pack" : "pack";
                                                    return (
                                                        <span key={i} className="rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
                                                            style={active ? { borderColor: "#D2462B", background: "rgba(210,70,43,0.08)", color: "#D2462B" } : { borderColor: C.hair, color: C.muted }}>
                                                            {tier.minQty}+ {tierUnitLabel}{Number(tier.minQty) === 1 ? "" : "s"}: {tier.discountPercent}% off
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </Card>

                                {/* ============ 3. PRICE SUMMARY ============ */}
                                <Card icon={ReceiptText} title="Price summary">
                                    {priceLoading ? (
                                        <div className="flex flex-col gap-2.5 rounded-xl bg-[#FCFBF9] p-3.5">
                                            <SkeletonBar width="45%" />
                                            <SkeletonBar width="30%" />
                                            <div className="h-px" style={{ background: C.hair }} />
                                            <SkeletonBar width="80%" />
                                            <SkeletonBar width="60%" />
                                        </div>
                                    ) : quote ? (
                                        <div className="flex flex-col gap-2.5 rounded-xl bg-[#FCFBF9] p-3.5">
                                            <div className="flex items-baseline justify-between gap-2 tracking-wide">
                                                <span className="text-[14px] font-bold" style={{ color: C.ink }}>
                                                    ₹{inr(quote.basePriceApplied ?? quote.unitPrice)}{" "}
                                                    <span className="font-medium" style={{ color: C.muted }}>/ {isSample ? seller?.unit : saleUnitLabel(seller?.masterPackSize)}</span>
                                                </span>
                                                {!isSample && Number(seller?.packSize) > 0 && (
                                                    <span className="shrink-0 text-[11px] font-medium tabular-nums" style={{ color: C.muted }}>
                                                        ≈ ₹{inr((quote.basePriceApplied ?? quote.unitPrice) / saleUnitQtyToBaseUnits(1, seller.packSize, seller.masterPackSize))} / {seller?.unit}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                {isSample
                                                    ? `${quote.baseUnitQuantity} ${seller?.unit}`
                                                    : `${quote.saleUnitQuantity} ${saleUnitLabel(seller?.masterPackSize)}${quote.saleUnitQuantity === 1 ? "" : "s"}${Number(seller?.packSize) > 0 ? ` · ${saleUnitQtyToBaseUnits(quote.saleUnitQuantity, seller.packSize, seller.masterPackSize)} ${seller?.unit}` : ""}`}
                                            </p>
                                            <div className="h-px" style={{ background: C.hair }} />
                                            <QuoteRow label="Subtotal" value={`₹${inr(quote.grossSubtotal)}`} tone={C.ink} small />
                                            {!isSample && quote.discountAmount > 0 && (
                                                <QuoteRow label={`Discount (${quote.discountPercent}% off)`} value={`− ₹${inr(quote.discountAmount)}`} tone={C.secondary} small />
                                            )}
                                            <div className="h-px" style={{ background: C.hair }} />
                                            <div className="flex items-center justify-between tracking-wide">
                                                <span className="text-[13.5px] font-bold" style={{ color: C.ink }}>{isSample ? "Total payable (sample)" : "Total payable"}</span>
                                                <span className="text-[20px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(quote.subtotal)}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>Enter a quantity to see the total.</p>
                                    )}

                                    {/* Pay now / Pay on credit — only for buyers already approved for credit */}
                                    {!isSample && canBuyOnCredit && (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex gap-1 rounded-xl bg-[#FCFBF9] p-1">
                                                {[{ v: "standard", t: "Pay now" }, { v: "credit", t: "Pay on credit", icon: CreditCard }].map(({ v, t, icon: Icon }) => (
                                                    <button key={v} type="button" onClick={() => setOrderMode(v)}
                                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-bold tracking-wide transition-all duration-150"
                                                        style={orderMode === v
                                                            ? { background: "#fff", color: v === "credit" ? "#7c3aed" : C.secondary, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                                                            : { color: C.muted }}>
                                                        {Icon && <Icon className="h-3.5 w-3.5" />} {t}
                                                    </button>
                                                ))}
                                            </div>
                                            {isCredit && (
                                                <p className="px-1 text-[11.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                    Credit available: ₹{inr(creditRemaining)}
                                                </p>
                                            )}
                                            {crossesCreditLimit && (
                                                limitIncreasePending ? (
                                                    <Notice tone="info">You've asked {seller.display_name} for a higher credit limit — waiting for their response.</Notice>
                                                ) : limitIncreaseCooldownActive ? (
                                                    <Notice tone="warn">This order is above your remaining credit. Your last request was declined — you can ask again after {fmtDate(creditStatus.limit_increase_cooldown_until)}.</Notice>
                                                ) : (
                                                    <>
                                                        <Notice tone="warn">This order is above your remaining credit limit.</Notice>
                                                        <button type="button" onClick={handleRequestCreditIncrease} disabled={requestingIncrease}
                                                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold disabled:opacity-50"
                                                            style={{ borderColor: "#7c3aed40", color: "#7c3aed", background: "#7c3aed08" }}>
                                                            <CreditCard className="h-3.5 w-3.5" /> {requestingIncrease ? "Requesting…" : "Ask for a higher credit limit"}
                                                        </button>
                                                    </>
                                                )
                                            )}
                                        </div>
                                    )}
                                </Card>

                                {/* ============ 4. DELIVERY ============ */}
                                <Card icon={MapPin} title="Delivery">
                                    <AddressBook ref={addressBookRef} disabled={submitting} />

                                    {blockedByConstraints && <Notice tone="danger">{locationStatus.message}</Notice>}

                                    <div className="flex flex-col gap-2 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hairSoft }}>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>
                                                <Truck className="h-3.5 w-3.5" /> Preferred transport
                                            </p>
                                            <button type="button" onClick={() => { autoPlaceRef.current = false; setShowTransportModal(true); }}
                                                disabled={!selectedAddressId}
                                                className="shrink-0 text-[12px] font-bold tracking-wide disabled:opacity-40" style={{ color: C.secondary }}>
                                                {transportPreference || pendingTransportProposal ? "Change" : "Select"}
                                            </button>
                                        </div>

                                        {transportPreference ? (
                                            <div className="flex flex-col gap-1.5">
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(transportPreference.mode)}</p>
                                                <TransportFields mode={transportPreference.mode} fields={transportPreference.fields} />
                                            </div>
                                        ) : pendingTransportProposal ? (
                                            <div className="flex flex-col gap-1.5">
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(pendingTransportProposal.mode)}</p>
                                                <TransportFields mode={pendingTransportProposal.mode} fields={pendingTransportProposal.fields} />
                                                <Notice tone="warn">
                                                    Waiting for {seller?.display_name}'s approval. You can place the order once it's approved, or pick a different, already-approved option.
                                                </Notice>
                                            </div>
                                        ) : (
                                            <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                Not selected yet — we'll ask when you tap "{verb}".
                                            </p>
                                        )}
                                        {transportRemovedNotice && <Notice tone="warn">{transportRemovedNotice}</Notice>}
                                    </div>

                                    {!blockedByConstraints && quote && (
                                        <div className="flex flex-col gap-2 rounded-xl bg-[#FCFBF9] p-3.5">
                                            <div className="flex items-center gap-2.5">
                                                <Truck className="h-4 w-4 shrink-0" style={{ color: C.secondary }} />
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>Estimated delivery</span>
                                                    <p className="text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                        {quote.isEstimate || !quote.estimatedDeliveryDate ? <SkeletonBar width="100px" /> : deliveryDateLabel(quote.estimatedDeliveryDate)}
                                                    </p>
                                                </div>
                                            </div>
                                            {!quote.isEstimate && (quote.acceptanceDelayDays > 0 || quote.leadDays > 0 || quote.transitDaysMin != null) && (
                                                <div className="border-t pt-2" style={{ borderColor: C.hair }}>
                                                    {quote.acceptanceDelayDays > 0 && <QuoteRow small label="Acceptance delay" value={`${quote.acceptanceDelayDays} day${quote.acceptanceDelayDays === 1 ? "" : "s"}`} />}
                                                    {quote.leadDays > 0 && <QuoteRow small label={seller?.stockType === "made_to_order" ? "Production time" : "Dispatch time"} value={`${quote.leadDays} day${quote.leadDays === 1 ? "" : "s"}`} />}
                                                    {quote.transitDaysMin != null && (
                                                        <QuoteRow small label="Transit" value={quote.transitDaysMin === quote.transitDaysMax
                                                            ? `${quote.transitDaysMin} day${quote.transitDaysMin === 1 ? "" : "s"}`
                                                            : `${quote.transitDaysMin}–${quote.transitDaysMax} days`} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: C.hairSoft }}>
                                        <Label>Note to seller (optional)</Label>
                                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any special instructions…"
                                            className="w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-[13.5px] font-medium placeholder:text-slate-300 focus:outline-none focus:ring-2"
                                            style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }} />
                                    </div>
                                </Card>

                                {/* ============ 5. DETAILS (both closed by default) ============ */}
                                {hasTerms && (
                                    <Collapse icon={FileText} title="Seller terms">
                                        <div className="flex flex-col">
                                            <Fact label="Delivery" value={seller.deliveryTimeline} />
                                            <Fact label="Payment" value={seller.paymentTerms} />
                                            <Fact label="Returns" value={seller.returnPolicy} />
                                            <Fact label="Warranty" value={seller.warranty} />
                                            <Fact label="Ships from" value={seller.dispatchOrigin} />
                                            {seller.freightIncluded != null && <Fact label="Freight" value={seller.freightIncluded ? "Included in price" : "Extra, paid by buyer"} />}
                                        </div>
                                    </Collapse>
                                )}

                                {(hasProductDetails || (product?.id && !detail)) && (
                                    <Collapse icon={Info} title="Product details">
                                        {!detail && product?.id ? (
                                            <div className="flex flex-col gap-2">
                                                <SkeletonBar width="60%" /><SkeletonBar width="90%" /><SkeletonBar width="75%" />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3.5">
                                                {galleryImages.length > 1 && (
                                                    <div className="flex gap-2 overflow-x-auto pb-1">
                                                        {galleryImages.slice(0, 8).map((src, i) => (
                                                            <button key={i} type="button" onClick={() => setLightboxSrc(src)} aria-label={`View image ${i + 1}`}
                                                                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg" style={{ background: "#F4F5F6", cursor: "zoom-in" }}>
                                                                <img src={resizedImageUrl(src, { width: 128 })} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {(manufacturer || modelNo || gradeVariant) && (
                                                    <div className="rounded-xl border px-3.5" style={{ borderColor: C.hair }}>
                                                        <Fact label="Manufacturer" value={manufacturer} />
                                                        <Fact label="Model / Part No." value={modelNo} />
                                                        <Fact label="Grade / Variant" value={gradeVariant} />
                                                    </div>
                                                )}
                                                {description && (
                                                    <div>
                                                        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Description</p>
                                                        <p className="text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>{description}</p>
                                                    </div>
                                                )}
                                                {manufacturingDetails && (
                                                    <div>
                                                        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Manufacturing</p>
                                                        <p className="text-[12.5px] font-medium leading-relaxed tracking-wide" style={{ color: C.ink }}>{manufacturingDetails}</p>
                                                    </div>
                                                )}
                                                {specifications.length > 0 && (
                                                    <div>
                                                        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>Specifications</p>
                                                        <div className="overflow-hidden rounded-xl border" style={{ borderColor: C.hair }}>
                                                            {specifications.map((s, i) => (
                                                                <div key={i} className="flex justify-between gap-3 px-3.5 py-2 text-[12px] font-semibold tracking-wide"
                                                                    style={{ background: i % 2 === 0 ? "white" : C.hairSoft, color: C.ink }}>
                                                                    <span style={{ color: C.muted }}>{s.key}</span>
                                                                    <span className="text-right">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Collapse>
                                )}
                            </div>
                        </div>

                        {/* ============ STICKY FOOTER (thumb zone) ============ */}
                        <div className="shrink-0 border-t bg-white px-4 pb-3 pt-3 sm:px-5" style={{ borderColor: C.hairSoft }}>
                            <div className="mb-3 grid grid-cols-2 gap-3">
                                {/* Quantity */}
                                <div className="min-w-0">
                                    {isSample ? (
                                        <>
                                            <p
                                                className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.1em]"
                                                style={{ color: C.muted }}
                                            >
                                                Sample quantity
                                            </p>
                                            <p
                                                className="text-[15px] font-extrabold tabular-nums"
                                                style={{ color: C.ink }}
                                            >
                                                {quantity} {seller?.unit}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p
                                                className="mb-1 truncate text-[10px] font-extrabold uppercase tracking-[0.1em]"
                                                style={{ color: C.muted }}
                                            >
                                                Quantity · {basisLabel}
                                            </p>
                                            <Stepper
                                                value={quantity}
                                                onChange={setQuantity}
                                                min={minQuantity}
                                                max={maxQuantity}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Total payable */}
                                <div className="min-w-0 text-right">
                                    <p
                                        className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.1em]"
                                        style={{ color: C.muted }}
                                    >
                                        Total payable
                                    </p>
                                    <p
                                        className="text-[21px] font-extrabold leading-none tabular-nums tracking-wide"
                                        style={{ color: C.ink }}
                                    >
                                        {priceLoading ? <SkeletonBar width="90px" /> : quote ? `₹${inr(quote.subtotal)}` : "—"}
                                    </p>
                                </div>
                            </div>


                            <div className="flex gap-2.5">
                                {!isSample && (
                                    <button type="button" onClick={handleAddToCart} aria-label="Add to cart"
                                        disabled={submitting || belowMoq || outOfStock || exceedsStock || priceLoading}
                                        className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-4 py-3.5 text-[13.5px] font-bold disabled:opacity-50"
                                        style={{ borderColor: C.hair, color: C.ink }}>
                                        <ShoppingCart className="h-4 w-4" /> <span className="inline">Add to cart</span>
                                    </button>
                                )}
                                <button type="button" onClick={handlePrimary} disabled={ctaDisabled}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-5 py-3.5 text-[14px] font-bold text-white shadow-sm transition-opacity duration-150 disabled:opacity-50"
                                    style={{ background: ctaBackground }}>
                                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
                                </button>
                            </div>
                        </div>

                        {toast && (
                            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
                                <span className="rounded-full bg-black px-3.5 py-1.5 text-[12px] font-bold text-white shadow-lg">{toast}</span>
                            </div>
                        )}
                    </>
                )}
            </motion.div>

            {showTransportModal && (
                <TransportPreferenceModal
                    open
                    seller={seller}
                    destCity={effectiveCity}
                    destState={effectiveState}
                    destAddressId={selectedAddressId}
                    removedNotice={transportRemovedNotice}
                    onClose={() => { autoPlaceRef.current = false; setShowTransportModal(false); setTransportRemovedNotice(null); }}
                    onAddressChange={() => { /* address now lives in BuyerAddressContext */ }}
                    onResolved={(result) => {
                        setShowTransportModal(false);
                        setTransportRemovedNotice(null);
                        if (result?.pending) {
                            autoPlaceRef.current = false;
                            setTransportPreference(null);
                            setPendingTransportProposal(result);
                            return;
                        }
                        setTransportPreference(result);
                        setPendingTransportProposal(null);
                        if (autoPlaceRef.current && result?.routeOptionId) {
                            autoPlaceRef.current = false;
                            handleSubmit({ routeOptionId: result.routeOptionId });
                        }
                    }}
                    onIntentSource="buynow"
                    onCaptureIntent={() => ({
                        offerId: seller.offerId,
                        productId: product?.id,
                        productName: product?.name,
                        quantity, basis, orderMode,
                        notes, addressId: selectedAddressId,
                    })}
                />
            )}

            {/* Image lightbox: portalled above everything (never clipped by the dialog's transform),
                and its clicks never bubble to the overlay (which would close Buy Now). */}
            {lightboxSrc && createPortal(
                <div className="fixed inset-0 z-[1200]" onClick={(e) => e.stopPropagation()}>
                    <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />
                </div>,
                document.body
            )}
        </motion.div>
    );
}

// Self-contained: works whether or not a BuyerAddressProvider already wraps the app.
export default function BuyNowModal(props) {
    return (
        <BuyerAddressProvider>
            <BuyNowModalInner {...props} />
        </BuyerAddressProvider>
    );
}