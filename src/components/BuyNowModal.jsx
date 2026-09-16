// components/BuyNowModal.jsx — REDESIGNED (UI/UX only, logic untouched)

import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PaymentQRModal from "./PaymentQRModal.jsx";
import {
    Loader2, Lock, CheckCircle2, X, Plus, MapPin, ShieldCheck, IndianRupee,
    Minus, Layers, FileText, Calendar, Beaker, Package, Truck, ReceiptText,
    CreditCard, Boxes, ShoppingCart, Clock, ChevronDown, PackageCheck, AlertCircle
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import {
    fetchCheckoutStatus, fetchOrderQuote, fetchBuyerAddresses, createBuyerAddress,
    placeOrder, cancelMyOrder, fetchCreditStatus, requestCredit as requestCreditApi,
    fetchBusinessProfile, requestCreditIncrease as requestCreditIncreaseApi, // NEW
} from "../utils/api.js";
import { addToCart } from "../utils/cartApi.js";
import { TRANSPORT_OPTIONS } from "../../shared/transportOptions.js";
import { saveOrderFormSession, loadOrderFormSession, clearOrderFormSession } from "../utils/orderFormSession.js";
import { clearPaymentSession } from "../utils/paymentSession.js";
import { C, EASE, Label, TextField, ChipToggleGroup, SectionCard } from "./seller/listingForm/FormPrimitives.jsx";
import { purchaseQtyToSaleUnitQty, saleUnitQtyToBaseUnits, hasOuterPack, saleUnitLabel, round2 } from "../shared/packUnits.js";
import { checkOrderWindow, checkLocationServiceable } from "../shared/orderConstraints.js";
import { fetchOrderConstraints } from "../utils/api.js";
import { usePincodeResolution } from "../hooks/usePincodeResolution.js";
import TransportPreferenceModal from "./transport/TransportPreferenceModal.jsx";
import { Share2 } from "lucide-react";
import { shareProductLink } from "../utils/share.js";
import { routeTransportModeLabel, getRouteTransportFields } from "../../shared/routeTransportFields.js";
import { fetchBuyerTransportPreference, fetchSellerRouteOptions } from "../utils/api.transport.js";

/* ============================================================
   All logic below (constants, pure functions, computeLocalQuote,
   normalizeQuote, etc.) is IDENTICAL to the original file —
   copy verbatim, no changes.
   ============================================================ */

const EMPTY_ADDRESS = { label: "Office", contact_name: "", contact_phone: "", address_line1: "", address_line2: "", city: "", state: "", pincode: "" };

function seedFromBusinessProfile(bp, phone) {
    if (!bp) return null;
    const useDispatch = bp.dispatch_same_as_registered === false && bp.dispatch_address;
    return {
        label: "Deliver To: ",
        contact_name: bp.legal_name || bp.trade_name || "",
        contact_phone: phone || "",
        address_line1: useDispatch ? bp.dispatch_address : (bp.registered_address || ""),
        address_line2: "",
        city: bp.district || "",
        state: useDispatch ? (bp.dispatch_state || bp.state || "") : (bp.state || ""),
        pincode: useDispatch ? (bp.dispatch_pincode || bp.pincode || "") : (bp.pincode || ""),
    };
}

const BASIS_OPTIONS = [
    { value: "per_pack", label: "Packs" },
    { value: "per_master_pack", label: "Master packs" },
];
const VISIBLE_BASIS_OPTIONS = BASIS_OPTIONS;

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

function computeLocalQuote(seller, quantity, basis, isSample, buyerPincode, buyerState) {
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
    const outOfStock = seller.stockType !== "made_to_order" && availableStock != null && availableStock <= 0;

    const grossSubtotal = round2(slabPrice * saleQty);
    const subtotal = round2(unitPrice * saleQty);
    const discountAmount = round2(grossSubtotal - subtotal);

    return {
        orderType: "standard", quantity: qty, saleUnitQuantity: saleQty, basis, unit: seller.unit,
        unitPrice, basePriceApplied: slabPrice, appliedSlab, discountPercent, discountTier,
        grossSubtotal, discountAmount, subtotal, moq,
        meetsMoq: moq ? saleQty >= moq : true,
        availableStock, stockShortfall, estimatedDeliveryDate: null, isEstimate: true,
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

/* ============================================================
   REDESIGNED presentational primitives
   ============================================================ */

// Slightly larger tap targets, clearer pressed/disabled states, no
// harsh 90° corners on the stepper buttons so it reads as one control.
function Stepper({ value, onChange, min = 1, max }) {
    const atMax = max != null && Number(value) >= Number(max);
    const atMin = Number(value) <= Number(min);
    return (
        <div className="flex items-center overflow-hidden rounded-xl border" style={{ borderColor: C.hair }}>
            <button type="button" disabled={atMin} onClick={() => onChange(Math.max(min, Number(value) - 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-30 disabled:hover:bg-transparent">
                <Minus className="h-4 w-4" style={{ color: C.ink }} />
            </button>
            <div className="h-11 w-px" style={{ background: C.hair }} />
            <input type="text" inputMode="decimal" value={value}
                onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-11 w-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-extrabold tabular-nums tracking-wide focus:outline-none"
                style={{ color: C.ink }} />
            <div className="h-11 w-px" style={{ background: C.hair }} />
            <button type="button" disabled={atMax} onClick={() => onChange(Number(value) + 1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-30 disabled:hover:bg-transparent">
                <Plus className="h-4 w-4" style={{ color: C.ink }} />
            </button>
        </div>
    );
}

// Consistent icon + tone so warnings/errors/info are visually
// distinguishable at a glance, not just by background tint.
function Notice({ tone = "warn", children }) {
    const tones = {
        warn: { background: "#FEF6E7", color: "#92600A", icon: AlertCircle },
        danger: { background: "#FDECEC", color: "#B3261E", icon: AlertCircle },
        info: { background: `${C.secondary}0f`, color: C.secondary, icon: AlertCircle },
    };
    const t = tones[tone] || tones.warn;
    const Icon = t.icon;
    return (
        <div className="flex items-start gap-2 rounded-xl px-2.5 py-2" style={{ background: t.background }}>
            <Icon className="mt-[1px] h-4 w-4 shrink-0" style={{ color: t.color }} />
            <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: t.color }}>{children}</p>
        </div>
    );
}

function ConstraintNotice({ reasons }) {
    const active = reasons.filter(Boolean);
    if (!active.length) return null;
    return (
        <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "#FDECEC" }}>
            <AlertCircle className="mt-[1px] h-4 w-4 shrink-0" style={{ color: "#B3261E" }} />
            <div className="min-w-0">
                <p className="text-[12.5px] font-bold" style={{ color: "#B3261E" }}>Can't place an order right now</p>
                <div className="mt-1 flex flex-col gap-0.5">
                    {active.map((r, i) => (
                        <span key={i} className="text-[12px] font-medium leading-snug" style={{ color: "#B3261E" }}>{r.message}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SkeletonBar({ width = "70%" }) {
    return <span className="inline-block h-3.5 animate-pulse rounded" style={{ width, background: C.hairSoft }} />;
}

function QuoteRow({ label, value, tone, strong, small }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className={`font-medium tracking-wide ${small ? "text-[12.5px]" : "text-[13.5px]"}`} style={{ color: tone || C.muted }}>{label}</span>
            <span className={`shrink-0 tabular-nums font-bold tracking-wide ${strong ? "text-[17px]" : "text-[13.5px]"}`} style={{ color: tone || C.ink }}>{value}</span>
        </div>
    );
}

// A single, reusable card shell replacing SectionCard's repeated
// icon+eyebrow+border pattern — quieter borders, one consistent radius,
// and a plain sentence-case title instead of a tracked-out label.
function Panel({ icon: Icon, title, subtitle, children }) {
    return (
        <div className="rounded-2xl border bg-white p-4 sm:p-4.5" style={{ borderColor: C.hairSoft }}>
            <div className="mb-3 flex items-center gap-2">
                {Icon && (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12` }}>
                        <Icon className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                    </span>
                )}
                <div className="min-w-0">
                    <h3 className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>{title}</h3>
                    {subtitle && <p className="text-[11.5px] font-medium tracking-wide" style={{ color: C.muted }}>{subtitle}</p>}
                </div>
            </div>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}

/* ============================================================
   Main component
   ============================================================ */

export default function BuyNowModal({ seller, product, onClose }) {
    const { token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    /* ---- ALL STATE, EFFECTS, AND HANDLERS BELOW ARE UNCHANGED FROM
       THE ORIGINAL FILE — copy verbatim. Only the JSX return differs. ---- */

    const [access, setAccess] = useState(undefined);
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [showNewAddress, setShowNewAddress] = useState(false);
    const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS);
    const [awaitingPaymentOrderId, setAwaitingPaymentOrderId] = useState(null);
    const [orderMode, setOrderMode] = useState("standard");
    const isSample = orderMode === "sample";
    const isCredit = orderMode === "credit";

    const defaultBasis = useMemo(
        () => (Number(seller?.masterPackSize) >= 1 ? "per_master_pack" : "per_pack"),
        [seller?.masterPackSize]
    );

    const [basis, setBasis] = useState(defaultBasis);
    const minQuantity = useMemo(() => computeMinQuantity(seller, basis), [seller, basis]);
    const visibleBasisOptions = useMemo(() => getVisibleBasisOptions(seller), [seller?.masterPackSize]);
    const [quantity, setQuantity] = useState(() => computeMinQuantity(seller, defaultBasis));
    const userPickedBasis = useRef(false);
    const belowMoq = !isSample && Number(quantity) < minQuantity;

    const [transportPreference, setTransportPreference] = useState(seller?.transportPreference ?? null);
    const [pendingTransportProposal, setPendingTransportProposal] = useState(seller?.transportPendingProposal ?? null); // was already declared — now actually seeded

    useEffect(() => {
        setTransportPreference(seller?.transportPreference ?? null);
        setPendingTransportProposal(seller?.transportPendingProposal ?? null); // NEW
    }, [seller?.transportPreference, seller?.transportPendingProposal]);

    useEffect(() => {
        if (!userPickedBasis.current) setBasis(defaultBasis);
    }, [defaultBasis]);

    useEffect(() => {
        if (basis === "per_master_pack" && !(Number(seller?.masterPackSize) >= 1)) {
            setBasis("per_pack");
        }
    }, [basis, seller?.masterPackSize]);

    useEffect(() => {
        if (basis === "per_pack" && Number(seller?.masterPackSize) >= 1) {
            setBasis("per_master_pack");
        }
    }, [basis, seller?.masterPackSize]);

    useEffect(() => {
        if (isSample) return;
        setQuantity((q) => (Number(q) < minQuantity ? minQuantity : q));
    }, [minQuantity, isSample]);

    const [notes, setNotes] = useState("");
    const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
    const [quote, setQuote] = useState(null);

    const maxQuantity = !isSample && seller?.stockType === "ready_stock"
        ? (quote?.availableStock ?? seller?.availableStock ?? null)
        : null;

    const exceedsStock = !isSample && maxQuantity != null && Number(quantity) > Number(maxQuantity);
    const outOfStock = !isSample && (quote?.outOfStock || (maxQuantity != null && Number(maxQuantity) <= 0));

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);
    const quoteTimer = useRef(null);
    const [showTransportModal, setShowTransportModal] = useState(false);
    const [transportRemovedNotice, setTransportRemovedNotice] = useState(null); // NEW — summary of what was removed, or null
    const isFirstQuoteRef = useRef(true);
    const requestIdRef = useRef(0);
    const { resolved: pincodeGeo, status: pincodeStatus, message: pincodeMessage } =
        usePincodeResolution(showNewAddress ? newAddress.pincode : null);
    const pendingQuoteRef = useRef(Promise.resolve());
    const standardBasisRef = useRef(defaultBasis);

    useEffect(() => {
        if (!isSample && basis !== "per_unit") {
            standardBasisRef.current = basis;
        }
    }, [isSample, basis]);

    useEffect(() => {
        if (!isSample && basis === "per_unit") {
            const restoredBasis = standardBasisRef.current || defaultBasis;
            setBasis(restoredBasis);
            setQuantity(computeMinQuantity(seller, restoredBasis));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSample]);

    const [creditStatus, setCreditStatus] = useState(null);

    useEffect(() => {
        if (pincodeGeo) {
            setNewAddress((a) => ({ ...a, city: pincodeGeo.district, state: pincodeGeo.state }));
        }
    }, [pincodeGeo]);

    // No longer waits for access to resolve first; fires the moment
    // seller.offerId/token are known, in parallel with fetchCheckoutStatus
    // instead of after it. Removes one full round trip of pure waiting.
    useEffect(() => {
        if (!seller?.offerId || !token) return;
        fetchCreditStatus(token, { submissionId: seller.offerId }).then((res) => setCreditStatus(res?.credit || null));
    }, [seller?.offerId, token]);

    const canBuyOnCredit = creditStatus?.status === "approved";
    const [requestingIncrease, setRequestingIncrease] = useState(false); // NEW

    // NEW — "crosses limit" is based on THIS order's total vs what's left,
    // not on the limit being fully drained already.
    const creditRemaining = creditStatus
        ? Math.max(Number(creditStatus.credit_limit || 0) - Number(creditStatus.credit_used || 0), 0)
        : 0;
    const crossesCreditLimit = canBuyOnCredit && !!quote && Number(quote.subtotal || 0) > creditRemaining;
    const limitIncreasePending = !!creditStatus?.limit_increase_request_message_id;
    const limitIncreaseCooldownActive = !!creditStatus?.limit_increase_cooldown_until
        && new Date(creditStatus.limit_increase_cooldown_until) > new Date();

    const handleRequestCreditIncrease = async () => {
        if (!creditStatus?.id) return;
        setRequestingIncrease(true);
        const res = await requestCreditIncreaseApi(token, creditStatus.id);
        setRequestingIncrease(false);
        if (!res?.success) { setError(res?.message || "Couldn't send the request for a higher limit."); return; }
        // reflect "pending" immediately so the button swaps to the waiting state
        setCreditStatus((prev) => (prev ? { ...prev, limit_increase_request_message_id: "pending" } : prev));
    };


    useEffect(() => {
        if (isCredit && !canBuyOnCredit) setOrderMode("standard");
    }, [isCredit, canBuyOnCredit]);

    const effectivePincode = showNewAddress ? newAddress.pincode : selectedAddress?.pincode;
    const effectiveState = showNewAddress ? newAddress.state : selectedAddress?.state;
    const effectiveCity = showNewAddress ? newAddress.city : selectedAddress?.city;

    useEffect(() => {
        if (!(Number(quantity) > 0)) { setQuote(null); return; }
        setQuote((prev) => {
            const local = computeLocalQuote(seller, quantity, basis, isSample, effectivePincode, effectiveState, effectiveCity);
            return local ? normalizeQuote(local) : prev;
        });
    }, [seller, quantity, basis, isSample, effectivePincode, effectiveState]);

    useEffect(() => {
        const lenis = window.lenis;
        lenis?.stop?.();
        return () => { lenis?.start?.(); };
    }, []);

    // Preference was resolved for a specific destination route. If the buyer
    // changes the shipping address to a different city/state inside the
    // modal, that preference no longer applies to the (new) route — clear it
    // so "Set preference" reappears instead of silently keeping a stale pick.
    useEffect(() => {
        if (!transportPreference?.destCity || !transportPreference?.destState) return;
        if (!effectiveCity || !effectiveState) return;
        const sameRoute =
            transportPreference.destCity.trim().toLowerCase() === effectiveCity.trim().toLowerCase() &&
            transportPreference.destState.trim().toLowerCase() === effectiveState.trim().toLowerCase();
        if (!sameRoute) setTransportPreference(null);
    }, [effectiveCity, effectiveState]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Only evaluate serviceability once the buyer has finished entering a
    // pincode — checking on every city/state keystroke was noisy and could
    // flash a false "not serviceable" notice mid-typing.
    const PINCODE_RE = /^\d{6}$/;

    const locationStatus = useMemo(() => {
        if (!PINCODE_RE.test(effectivePincode || "")) {
            return { serviceable: true };
        }
        const result = checkLocationServiceable(constraints?.dispatchingLocations, { state: effectiveState, city: effectiveCity });
        console.log("[locationStatus]", {
            pincode: effectivePincode,
            state: effectiveState,
            city: effectiveCity,
            constraintsLoaded: !!constraints,
            dispatchingLocations: constraints?.dispatchingLocations,
            result,
        });
        return result;
    }, [constraints, effectivePincode, effectiveState, effectiveCity]);

    const blockedByConstraints = !locationStatus.serviceable;

    // Only needs a token to exist, not the full checkout-status
    // round trip to resolve first. If access later comes back as not-eligible,
    // the gate screen still shows correctly — this fetch running early just
    // means addresses are ready the instant the form actually renders instead
    // of after a second serial round trip.
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            const res = await fetchBuyerAddresses(token);
            if (cancelled || !res?.success) return;
            setAddresses(res.addresses || []);
            const def = res.addresses?.find((a) => a.is_default) || res.addresses?.[0];
            if (def) {
                setSelectedAddressId(def.id);
            } else {
                const bpRes = await fetchBusinessProfile(token);
                if (cancelled) return;
                const seeded = bpRes?.success ? seedFromBusinessProfile(bpRes.profile, access?.profile?.phone) : null;
                setNewAddress(seeded || EMPTY_ADDRESS);
                setShowNewAddress(true);
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (isSample) {
            const sampleQty = Number(seller?.sampleQuantity) > 0 ? Number(seller.sampleQuantity) : 1;
            setQuantity(sampleQty);
            userPickedBasis.current = false;
            setBasis("per_unit");
        }
    }, [isSample, seller?.sampleQuantity]);

    useEffect(() => {
        if (!(Number(quantity) > 0)) { setQuote(null); return; }
        setQuote((prev) => {
            const local = computeLocalQuote(seller, quantity, basis, isSample, effectivePincode, effectiveState);
            return local ? normalizeQuote(local) : prev;
        });
    }, [seller, quantity, basis, isSample, effectivePincode, effectiveState]);


    // In the quote-fetch effect — only the setTimeout delay changes:
    useEffect(() => {
        if (!seller?.offerId || !(Number(quantity) > 0)) return;
        clearTimeout(quoteTimer.current);
        const myRequestId = ++requestIdRef.current;
        const qtyAtSchedule = quantity;
        const basisAtSchedule = basis;
        const sampleAtSchedule = isSample;
        const addressAtSchedule = selectedAddressId;
        const destPincodeAtSchedule = effectivePincode;   // NEW
        const destStateAtSchedule = effectiveState;       // NEW


        // CHANGED: first quote fetch on modal open fires immediately instead
        // of waiting the full 300ms debounce — that delay exists to avoid
        // spamming the endpoint while someone's actively changing quantity,
        // which doesn't apply to the very first render.
        const delay = isFirstQuoteRef.current ? 0 : 300;
        isFirstQuoteRef.current = false;

        pendingQuoteRef.current = new Promise((resolve) => {
            quoteTimer.current = setTimeout(async () => {
                const res = await fetchOrderQuote(seller.offerId, qtyAtSchedule, {
                    purchaseBasis: basisAtSchedule,
                    orderType: sampleAtSchedule ? "sample" : "standard",
                    addressId: addressAtSchedule || undefined,
                    destPincode: addressAtSchedule ? undefined : destPincodeAtSchedule,  // NEW
                    destState: addressAtSchedule ? undefined : destStateAtSchedule,      // NEW
                });
                if (myRequestId === requestIdRef.current && res?.success) {
                    const confirmed = normalizeQuote({ ...res, isEstimate: false });
                    setQuote(confirmed);
                    resolve(confirmed);
                } else {
                    resolve(null);
                }
            }, delay);
        });

        return () => clearTimeout(quoteTimer.current);
    }, [seller?.offerId, quantity, basis, isSample, selectedAddressId, effectivePincode, effectiveState]);


    // REPLACE the old "clear preference on address change" effect with this:
    //
    // Whenever the buyer's effective destination (city/state) changes — either
    // by picking a different saved address or by a new address's pincode
    // resolving — the transport preference is no longer guaranteed to apply,
    // since it's keyed per (buyer, seller, destination route). Re-resolve it:
    //   1. If the preference already in state was resolved for this exact
    //      route (e.g. it came in pre-attached from the feed for the default
    //      address), trust it — no need to re-fetch.
    //   2. Otherwise, ask the backend whether a decision already exists for
    //      this seller on this new route. If yes, adopt it immediately.
    //   3. If no decision exists yet for this route, clear the stale
    //      preference AND open the picker automatically so the buyer isn't
    //      left silently defaulting to "seller decides" without being asked.
    const lastCheckedRouteRef = useRef(null);

    useEffect(() => {
        if (!effectiveCity || !effectiveState || !seller?.sellerId) return;

        const routeKey = `${effectiveState.trim().toLowerCase()}::${effectiveCity.trim().toLowerCase()}`;
        if (lastCheckedRouteRef.current === routeKey) return;
        lastCheckedRouteRef.current = routeKey;

        const sameAsCurrent =
            transportPreference?.destCity?.trim().toLowerCase() === effectiveCity.trim().toLowerCase() &&
            transportPreference?.destState?.trim().toLowerCase() === effectiveState.trim().toLowerCase();
        if (sameAsCurrent) return;

        let cancelled = false;
        (async () => {
            const res = await fetchBuyerTransportPreference(seller.sellerId, effectiveState, effectiveCity, token);
            if (cancelled) return;

            const pendingProposal = res?.pendingProposal
                ? { ...res.pendingProposal, destCity: effectiveCity, destState: effectiveState }
                : null;
            setPendingTransportProposal(pendingProposal);

            if (res?.rejectedNotice) {
                // NEW: an unacknowledged rejection always wins — clear whatever
                // else was showing and force the picker open with the reason,
                // regardless of the decided/pending state otherwise returned.
                setTransportPreference(null);
                setTransportRemovedNotice(`Your proposed transport option (${res.rejectedNotice.summary}) wasn't accepted by the seller.`);
                setShowTransportModal(true);
                return;
            }

            if (res?.success && res.decided) {
                setTransportPreference(res.preference ? { ...res.preference, destCity: effectiveCity, destState: effectiveState } : null);
                setTransportRemovedNotice(null);
            } else {
                setTransportPreference(null);
                setTransportRemovedNotice(res?.invalidated ? "The seller no longer offers your previously selected transport option." : null);
                if (!pendingProposal) setShowTransportModal(true);
            }
        })();

        return () => { cancelled = true; };
    }, [effectiveCity, effectiveState, seller?.sellerId, token]); // eslint-disable-line react-hooks/exhaustive-deps

    // One-time validation of whatever preference the modal opened with — it
    // may have been resolved earlier (e.g. by HomeProductFeed before the
    // modal opened) and the seller could have removed it since then.
    const initialPreferenceCheckedRef = useRef(false);
    useEffect(() => {
        if (initialPreferenceCheckedRef.current) return;
        if (!seller?.sellerId || !effectiveCity || !effectiveState) return;
        initialPreferenceCheckedRef.current = true;

        (async () => {
            const res = await fetchBuyerTransportPreference(seller.sellerId, effectiveState, effectiveCity, token);
            if (res?.rejectedNotice) {
                setTransportPreference(null);
                setTransportRemovedNotice(`Your proposed transport option (${res.rejectedNotice.summary}) wasn't accepted by the seller.`);
                setShowTransportModal(true);
                return;
            }
            if (res?.invalidated) {
                setTransportPreference(null);
                setTransportRemovedNotice("The seller no longer offers your previously selected transport option.");
                setShowTransportModal(true);
            }
        })();
    }, [seller?.sellerId, effectiveCity, effectiveState, token]);

    const setAddrField = (key, value) => setNewAddress((a) => ({ ...a, [key]: value }));

    const handleSaveNewAddress = async () => {
        const missing = ["contact_name", "contact_phone", "address_line1", "city", "state", "pincode"].filter((k) => !newAddress[k].trim());
        if (missing.length) { setError("Please fill in the shipping address completely."); return null; }
        setError(null);
        const res = await createBuyerAddress(token, { ...newAddress, is_default: addresses.length === 0 });
        if (!res?.success) { setError(res?.message || "Couldn't save address."); return null; }
        setAddresses((prev) => [res.address, ...prev]);
        setSelectedAddressId(res.address.id);
        setShowNewAddress(false);
        return res.address.id;
    };

    const handleSubmit = async (explicitOrderType) => {
        setError(null);
        if (!windowStatus.open) return setError(windowStatus.message);
        if (!locationStatus.serviceable) return setError(locationStatus.message);

        if (!isSample && Number(quantity) < minQuantity) {
            setError(`Minimum order quantity is ${minQuantity} ${moqUnitLabel}${minQuantity === 1 ? "" : "s"}.`);
            return;
        }
        if (!isSample && maxQuantity != null && Number(quantity) > Number(maxQuantity)) {
            setError(Number(maxQuantity) <= 0
                ? "This item is currently out of stock with this seller."
                : `You can order at most ${maxQuantity} ${saleUnitLabel(seller?.masterPackSize)}${Number(maxQuantity) === 1 ? "" : "s"} from this seller.`);
            return;
        }

        let addressId = selectedAddressId;
        if (showNewAddress || !addressId) {
            addressId = await handleSaveNewAddress();
            if (!addressId) return;
        }
        if (!(Number(quantity) > 0)) return setError("Please enter a valid quantity.");

        setSubmitting(true);

        const confirmed = await pendingQuoteRef.current;
        const finalQuote = confirmed || quote;
        const effectiveOrderType = explicitOrderType || (isSample ? "sample" : "standard");

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
            shippingAddressId: addressId,
            notes: notes.trim() || undefined,
            transportRouteOptionId: transportPreference?.routeOptionId || undefined,
        });
        setSubmitting(false);
        if (!res?.success) return setError(res?.message || "Couldn't place the order.");

        if (res.orderStatus === "awaiting_payment") {
            saveOrderFormSession({
                orderId: res.orderId,
                seller,
                product,
                quantity,
                basis,
                selectedAddressId,
                showNewAddress,
                newAddress,
                notes,
                orderMode: effectiveOrderType
            });
            setAwaitingPaymentOrderId(res.orderId);
        } else {
            setDone(res);
        }
    };

    const restoreFromSession = (session) => {
        if (!session) return;
        setQuantity(session.quantity);
        userPickedBasis.current = true;
        setBasis(session.basis);
        setSelectedAddressId(session.selectedAddressId);
        setShowNewAddress(session.showNewAddress);
        setNewAddress(session.newAddress || EMPTY_ADDRESS);
        setNotes(session.notes || "");
        setOrderMode(session.orderMode || "standard");
    };

    // useEffect(() => {
    //     const session = loadOrderFormSession();
    //     if (session && session.seller?.offerId === seller?.offerId) {
    //         restoreFromSession(session);
    //     }
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, []);

    useEffect(() => {
        const session = loadOrderFormSession();
        if (session && session.seller?.offerId === seller?.offerId && session.orderId) {
            // only restore if this session corresponds to a still-pending order
            restoreFromSession(session);
        }
    }, []);

    const handleCloseToEdit = () => {
        const session = loadOrderFormSession(awaitingPaymentOrderId);
        restoreFromSession(session);
        clearPaymentSession();
        clearOrderFormSession();
        setAwaitingPaymentOrderId(null);
    };

    const gateContent = {
        NOT_AUTHENTICATED: {
            title: "Sign in to place an order",
            body: "You'll need to sign in to your BBM Marketplace account first.",
            cta: "Sign in",
            // CHANGED: carry the current path (the shared product link, or
            // wherever else BuyNowModal was opened from) so AuthPage can send
            // the person back here once they're signed in, instead of
            // dumping them on /home.
            action: () => navigate("/login", { state: { from: location.pathname + location.search } }),
        },
        NOT_VERIFIED: {
            title: "Verify your contact details",
            body: "We need a verified email or phone so sellers know you're a genuine buyer.",
            cta: "Verify now",
            action: () => navigate("/account", { state: { from: location.pathname + location.search } }),
        },
    }[access?.reason] || { title: "Can't place an order right now", body: "Please try again in a moment.", cta: "Close", action: onClose };

    const [requestingCredit, setRequestingCredit] = useState(false);
    const handleRequestCredit = async () => {
        if (!seller?.offerId) { setError("Couldn't reach this seller right now."); return; }
        setRequestingCredit(true);
        const reqRes = await requestCreditApi(token, { submissionId: seller.offerId });
        setRequestingCredit(false);
        if (!reqRes?.success) { setError(reqRes?.message || "Couldn't send the credit request."); return; }
        onClose();
        navigate(`/chat/${reqRes.conversationId}`);
    };

    // If the buyer has a proposal awaiting seller approval for this route,
    // check whether it's since been approved — the seller's approved-options
    // list will include it once approveProposal flips its status. If so,
    // silently adopt it as the active preference instead of leaving the
    // buyer stuck on a stale "awaiting approval" notice.
    // While a proposal is awaiting the seller's decision, poll its live
    // status periodically (piggybacking on the existing 30s clockTick) so
    // this modal picks up an approval or rejection even if it happened while
    // the modal was already open, not just once on mount.
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
            } else if (res.checkedProposalStatus === "rejected") {
                setPendingTransportProposal(null);
                setTransportPreference(null);
                setTransportRemovedNotice(`Your proposed transport option (${pendingTransportProposal.summary}) wasn't accepted by the seller.`);
                setShowTransportModal(true);
            }
            // "proposed" (still pending) or "removed"/"not_found" (edge case,
            // e.g. seller deleted the row outright) — leave state as-is for
            // "proposed"; "removed"/"not_found" is rare enough to just fall
            // through and get caught by the next full route re-check instead.
        })();

        return () => { cancelled = true; };
    }, [clockTick, pendingTransportProposal?.routeOptionId, seller?.sellerId, effectiveCity, effectiveState, token]);

    const handleBackToEdit = async () => {
        if (awaitingPaymentOrderId) {
            const res = await cancelMyOrder(token, awaitingPaymentOrderId, "Buyer went back to edit the order before paying");
            if (!res?.success) {
                console.warn("Couldn't cancel the pending order before going back:", res?.message);
            }
        }
        clearPaymentSession();
        setAwaitingPaymentOrderId(null);
    };

    const hasTerms = seller && (seller.deliveryTimeline || seller.paymentTerms || seller.returnPolicy || seller.warranty || seller.hsnCode || seller.freightIncluded != null || seller.dispatchOrigin);
    const canSample = seller?.sampleAvailable;
    const basisLabel = basis === "per_pack" ? "pack(s)" : basis === "per_master_pack" ? "master pack(s)" : (seller?.unit || "units");
    const deliveryDateLabel = (val) => (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val) ? formatDDMon(new Date(val)) : val);
    const moqUnitLabel = basis === "per_master_pack" ? "Master Pack" : "Pack";
    const creditCooldownActive = creditStatus?.status === "rejected" && creditStatus.cooldown_until && new Date(creditStatus.cooldown_until) > new Date();

    /* ============================================================
       REDESIGNED RENDER
       ============================================================ */

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
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
                    /* ---------------- Success state ---------------- */
                    <div className="flex flex-col items-center px-6 py-10 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg" style={{ background: "linear-gradient(135deg,#047084,#0B9FB8)" }}>
                            <CheckCircle2 className="h-8 w-8" />
                        </span>
                        <h2 className="mt-5 text-[19px] font-bold tracking-tight" style={{ color: C.ink }}>
                            {done.orderType === "sample" ? "Sample requested" : done.paymentMethod === "credit" ? "Order placed on credit" : "Order placed"}
                        </h2>
                        <p className="mt-1.5 rounded-full bg-slate-50 px-3 py-1 font-mono text-[12px] font-semibold" style={{ color: C.secondary }}>{done.orderNumber}</p>
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
                    /* ---------------- Access-gate state ---------------- */
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
                        {/* ---------------- Header ---------------- */}
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: C.hairSoft }}>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold tracking-wider" style={{ color: C.secondary }}>Place order</p>
                                <h2 className="mt-0.5 truncate text-[18px] font-bold tracking-wide" style={{ color: C.ink }}>{product?.name}</h2>
                                <p className="truncate text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>from {seller?.display_name}</p>
                            </div>
                            <button
                                onClick={async () => {
                                    const result = await shareProductLink({
                                        submissionId: seller.offerId,
                                        productName: product?.name,
                                        sellerName: seller?.display_name,
                                    });
                                    if (result === "copied") setToastMsg?.("Link copied!"); // or your own toast
                                }}
                                aria-label="Share this seller's listing"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]"
                            >
                                <Share2 className="h-4 w-4" style={{ color: C.muted }} />
                            </button>
                            <button onClick={onClose} aria-label="Close"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                                <X className="h-4.5 w-4.5" style={{ color: C.muted }} />
                            </button>
                        </div>

                        {/* ---------------- Scrollable body ---------------- */}
                        <div className="flex-1 overflow-y-auto" data-lenis-prevent>
                            <div className="flex flex-col gap-3 px-5 py-4 sm:px-6">

                                {/* Order type toggle — clearer selected state, sits like a
                                    segmented control instead of two loosely-grouped pills. */}
                                {canSample && (
                                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                                        {[
                                            { v: "standard", t: "Standard order" },
                                            { v: "sample", t: "Order a sample", icon: Beaker },
                                        ].map(({ v, t, icon: Icon }) => (
                                            <button key={v} type="button" onClick={() => setOrderMode(v)}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold transition-all tracking-wide duration-150"
                                                style={orderMode === v
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

                                {/* ---------------- Quantity ---------------- */}
                                <Panel icon={Package} title="Quantity" subtitle={!isSample ? `MOQ ${minQuantity} ${moqUnitLabel}${minQuantity === 1 ? "" : "s"}` : undefined}>
                                    {!isSample && Number(seller?.packSize) > 0 && (
                                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                            <Boxes className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                            <p className="text-[12px] font-semibold tracking-wide" style={{ color: C.ink }}>
                                                1 pack = {seller.packSize} {seller.unit}
                                                {Number(seller?.masterPackSize) >= 1 && ` · 1 master pack = ${seller.masterPackSize} packs`}
                                            </p>
                                        </div>
                                    )}

                                    {!isSample && visibleBasisOptions.length > 1 && (
                                        <ChipToggleGroup dense value={basis} onChange={(v) => { userPickedBasis.current = true; setBasis(v); }} options={visibleBasisOptions} />
                                    )}

                                    {isSample ? (
                                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
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
                                        <div className="flex items-center gap-3">
                                            <Stepper value={quantity} onChange={setQuantity} min={minQuantity} max={maxQuantity} />

                                            {/* FIX: was repeating "{quantity} {basisLabel}" right next to a
            stepper that already shows the quantity in its own input —
            e.g. input showed "23" and this text also said "23 master
            pack(s)". Now this only shows the unit label + the actual
            base-unit conversion, never the quantity itself again. */}
                                            <p className="text-[12.5px] capitalize font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                                                {basisLabel}
                                                {Number(seller?.packSize) > 0 && (
                                                    <span className="block text-[11.5px] tracking-wide" style={{ color: C.muted }}>
                                                        = {toBaseUnits(seller, Number(quantity) || 0, basis)} {seller?.unit}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    )}

                                    {!isSample && quote && quote.meetsMoq === false && (
                                        <Notice tone="danger">Below the seller's MOQ of {formatMoqForBasis(quote.moq, seller)}.</Notice>
                                    )}
                                    {!isSample && outOfStock && (
                                        <Notice tone="danger">This item is currently out of stock with this seller.</Notice>
                                    )}
                                    {!isSample && !outOfStock && exceedsStock && (
                                        <Notice tone="danger">
                                            You can order at most {maxQuantity} {saleUnitLabel(seller?.masterPackSize)}{Number(maxQuantity) === 1 ? "" : "s"} from this seller. Please reduce the quantity.
                                        </Notice>
                                    )}

                                    {!isSample && Array.isArray(seller?.priceSlabs) && seller.priceSlabs.length > 0 && (
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
                                                            {slab.minQty}{slab.maxQty ? `–${slab.maxQty}` : "+"} pack{Number(slab.maxQty || slab.minQty) === 1 ? "" : "s"}: ₹{inr(slab.price)}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {!isSample && Array.isArray(seller?.quantityDiscounts) && seller.quantityDiscounts.length > 0 && (
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
                                </Panel>

                                {/* ---------------- Shipping address ---------------- */}
                                <Panel icon={MapPin} title="Shipping address">
                                    {!showNewAddress && addresses.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            {addresses.map((a) => {
                                                const addrLocationStatus = checkLocationServiceable(constraints?.dispatchingLocations, { state: a.state, city: a.city });
                                                const isSelected = selectedAddressId === a.id;
                                                const isUndeliverable = !!constraints && !addrLocationStatus.serviceable;
                                                return (
                                                    <button key={a.id} type="button" onClick={() => setSelectedAddressId(a.id)}
                                                        className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-150"
                                                        style={{
                                                            borderColor: isUndeliverable ? "#B3261E" : (isSelected ? C.secondary : C.hair),
                                                            background: isUndeliverable ? "#FDECEC" : (isSelected ? `${C.secondary}08` : "#fff"),
                                                        }}>
                                                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                                                            style={{ borderColor: isUndeliverable ? "#B3261E" : (isSelected ? C.secondary : C.hair) }}>
                                                            {isSelected && <span className="h-2 w-2 rounded-full" style={{ background: isUndeliverable ? "#B3261E" : C.secondary }} />}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{a.label} · {a.contact_name}</p>
                                                            <p className="mt-0.5 text-[12px] font-medium leading-snug tracking-wide" style={{ color: isUndeliverable ? "#B3261E" : C.muted }}>
                                                                {a.address_line1}, {a.city}, {a.state} – {a.pincode}
                                                            </p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            <button type="button" onClick={() => setShowNewAddress(true)}
                                                className="flex w-fit items-center gap-1.5 rounded-lg px-1 py-1.5 text-[12.5px] font-bold" style={{ color: C.secondary }}>
                                                <Plus className="h-3.5 w-3.5" /> Add a new address
                                            </button>
                                        </div>
                                    )}

                                    {showNewAddress && (
                                        <div className="flex flex-col gap-2.5">
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <TextField dense label="Contact name" value={newAddress.contact_name} onChange={(v) => setAddrField("contact_name", v)} />
                                                <TextField dense label="Phone" value={newAddress.contact_phone} onChange={(v) => setAddrField("contact_phone", v)} />
                                            </div>
                                            <TextField dense label="Address line 1" value={newAddress.address_line1} onChange={(v) => setAddrField("address_line1", v)} />
                                            <TextField dense label="Address line 2 (optional)" value={newAddress.address_line2} onChange={(v) => setAddrField("address_line2", v)} />
                                            <div className="flex flex-col gap-2.5">
                                                <TextField
                                                    dense
                                                    label="Pincode"
                                                    value={newAddress.pincode}
                                                    onChange={(v) => {
                                                        const digits = v.replace(/\D/g, "").slice(0, 6);
                                                        setNewAddress((a) => ({ ...a, pincode: digits, city: "", state: "" }));
                                                    }}
                                                    // Just a red ring on the input itself — no separate message box here.
                                                    style={
                                                        pincodeStatus === "ok" && constraints && !locationStatus.serviceable
                                                            ? { borderColor: "#B3261E", boxShadow: "0 0 0 1px #B3261E33" }
                                                            : undefined
                                                    }
                                                />

                                                {pincodeStatus === "loading" && (
                                                    <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Looking up location…</p>
                                                )}

                                                {pincodeStatus === "error" && (
                                                    <p className="text-[11.5px] font-medium" style={{ color: "#B3261E" }}>{pincodeMessage}</p>
                                                )}

                                                {pincodeStatus === "ok" && newAddress.city && (
                                                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                                                        <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                                                        <p className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>
                                                            {newAddress.city}, {newAddress.state}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            {addresses.length > 0 && (
                                                <button type="button" onClick={() => setShowNewAddress(false)} className="w-fit text-[12.5px] font-bold" style={{ color: C.muted }}>
                                                    Use a saved address instead
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const id = await handleSaveNewAddress();
                                                    if (id) setShowNewAddress(false); // handleSaveNewAddress already does this, but be explicit
                                                }}
                                                className="w-fit rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white"
                                                style={{ background: C.secondary }}
                                            >
                                                Save address
                                            </button>
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hairSoft }}>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>Preferred transport</p>
                                            <button type="button" onClick={() => setShowTransportModal(true)} className="shrink-0 text-[12px] font-bold tracking-wide" style={{ color: C.secondary }}>
                                                {transportPreference || pendingTransportProposal ? "Change" : "Set preference"}
                                            </button>
                                        </div>

                                        {transportPreference ? (
                                            <div className="flex flex-col gap-1.5">
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                    {routeTransportModeLabel(transportPreference.mode)}
                                                </p>
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                                                    {getRouteTransportFields(transportPreference.mode).map((f) => {
                                                        const val = transportPreference.fields?.[f.key];
                                                        if (!val) return null;
                                                        const displayLabel = f.label.replace(/\s*\(if any\)\s*/i, "");
                                                        return (
                                                            <div key={f.key} className="flex items-baseline gap-1.5">
                                                                <span className="shrink-0 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>{displayLabel}:</span>
                                                                <span className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{val}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : pendingTransportProposal ? (
                                            <div className="flex flex-col gap-1.5">
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                    {routeTransportModeLabel(pendingTransportProposal.mode)}
                                                </p>
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                                                    {getRouteTransportFields(pendingTransportProposal.mode).map((f) => {
                                                        const val = pendingTransportProposal.fields?.[f.key];
                                                        if (!val) return null;
                                                        const displayLabel = f.label.replace(/\s*\(if any\)\s*/i, "");
                                                        return (
                                                            <div key={f.key} className="flex items-baseline gap-1.5">
                                                                <span className="shrink-0 text-[11px] font-semibold tracking-wide" style={{ color: C.muted }}>{displayLabel}:</span>
                                                                <span className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{val}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <Notice tone="warn">
                                                    Your proposed transport option is still awaiting the seller's approval. If you place the order now, it'll go through the same as "No preference set" — the seller will choose the transport for now.
                                                </Notice>
                                            </div>
                                        ) : (
                                            <p className="text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>No preference set — the seller will choose for you.</p>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: C.hairSoft }}>
                                        <Label>Note to seller (optional)</Label>
                                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any special instructions…"
                                            className="w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-[13.5px] font-medium placeholder:text-slate-300 focus:outline-none focus:ring-2"
                                            style={{ borderColor: C.hair, color: C.ink, ["--tw-ring-color"]: `${C.secondary}22` }} />
                                    </div>
                                </Panel>

                                {/* ---------------- Quote breakdown ---------------- */}
                                <Panel icon={ReceiptText} title="Price breakdown">
                                    {quote ? (
                                        <>
                                            <div className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hair }}>
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${C.secondary}12` }}>
                                                    <Boxes className="h-4 w-4" style={{ color: C.secondary }} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    {isSample ? (
                                                        <p className="text-[14px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                                                            {quote.baseUnitQuantity} {seller?.unit}
                                                        </p>
                                                    ) : (
                                                        <p className="text-[14px] font-extrabold tabular-nums tracking-wide" style={{ color: C.ink }}>
                                                            {quote.saleUnitQuantity} {saleUnitLabel(seller?.masterPackSize)}{quote.saleUnitQuantity === 1 ? "" : "s"}
                                                            {Number(seller?.packSize) > 0 && (
                                                                <span className="font-semibold" style={{ color: C.muted }}>
                                                                    {" "}· {saleUnitQtyToBaseUnits(quote.saleUnitQuantity, seller.packSize, seller.masterPackSize)} {seller?.unit}
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}
                                                    {!isSample && basis === "per_master_pack" && (
                                                        <p className="text-[11px] font-medium tracking-wider" style={{ color: C.muted }}>
                                                            {quantity} master pack{Number(quantity) === 1 ? "" : "s"} selected
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2.5 rounded-xl bg-slate-50 p-3.5">
                                                <span className="text-[11.5px] font-bold tracking-wider" style={{ color: C.muted }}>Rate applied</span>

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

                                                <div className="h-px" style={{ background: C.hair }} />

                                                <QuoteRow label="Subtotal" value={`₹${inr(quote.grossSubtotal)}`} tone={C.ink} small />
                                                {!isSample && quote.discountAmount > 0 && (
                                                    <QuoteRow label={`Discount (${quote.discountPercent}% off)`} value={`− ₹${inr(quote.discountAmount)}`} tone={C.secondary} small />
                                                )}

                                                <div className="h-px" style={{ background: C.hair }} />

                                                <div className="flex items-center justify-between tracking-wide">
                                                    <span className="text-[13.5px] font-bold" style={{ color: C.ink }}>
                                                        {isSample ? "Total payable (sample)" : "Total payable"}
                                                    </span>
                                                    <span className="text-[20px] font-extrabold tabular-nums" style={{ color: C.ink }}>₹{inr(quote.subtotal)}</span>
                                                </div>
                                            </div>

                                            {!blockedByConstraints && (
                                                <>
                                                    {!isSample && quote.acceptanceDelayDays > 0 && (
                                                        <Notice tone="warn">
                                                            {quote.acceptanceMessage || "This seller is currently closed — your order will still be placed, but acceptance is delayed."}
                                                        </Notice>
                                                    )}

                                                    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3.5">
                                                        <span className="text-[11.5px] font-bold tracking-wider" style={{ color: C.muted }}>Delivery estimate</span>

                                                        {quote.acceptanceDelayDays > 0 && (
                                                            <QuoteRow small label="Acceptance delay" value={`${quote.acceptanceDelayDays} day${quote.acceptanceDelayDays === 1 ? "" : "s"}`} />
                                                        )}
                                                        {quote.leadDays > 0 && (
                                                            <QuoteRow small label={seller?.stockType === "made_to_order" ? "Production time" : "Dispatch time"} value={`${quote.leadDays} day${quote.leadDays === 1 ? "" : "s"}`} />
                                                        )}
                                                        <QuoteRow
                                                            small
                                                            label="Transit"
                                                            value={quote.transitDaysMin === quote.transitDaysMax
                                                                ? `${quote.transitDaysMin} day${quote.transitDaysMin === 1 ? "" : "s"}`
                                                                : `${quote.transitDaysMin}–${quote.transitDaysMax} days`}
                                                        />

                                                        <div className="h-px" style={{ background: C.hair }} />

                                                        <div className="flex items-center gap-2.5">
                                                            <Truck className="h-4 w-4 shrink-0" style={{ color: C.secondary }} />
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>Estimated delivery</span>
                                                                <p className="text-[13.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                                    {quote.isEstimate || !quote.estimatedDeliveryDate ? <SkeletonBar width="100px" /> : deliveryDateLabel(quote.estimatedDeliveryDate)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-[12.5px] font-medium" style={{ color: C.muted }}>Enter a quantity to see the total.</p>
                                    )}
                                </Panel>

                                {/* ---------------- Seller terms (collapsible, quieter) ---------------- */}
                                {hasTerms && (
                                    <details className="group rounded-2xl border bg-white p-4 sm:p-4.5" style={{ borderColor: C.hairSoft }}>
                                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                                            <span className="flex items-center gap-2">
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${C.secondary}12` }}>
                                                    <FileText className="h-3.5 w-3.5" style={{ color: C.secondary }} />
                                                </span>
                                                <span className="text-[14px] font-bold" style={{ color: C.ink }}>Seller terms</span>
                                            </span>
                                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: C.muted }} />
                                        </summary>
                                        <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-[13px] font-medium" style={{ borderColor: C.hairSoft }}>
                                            {seller.deliveryTimeline && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Delivery</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{seller.deliveryTimeline}</span></div>}
                                            {seller.paymentTerms && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Payment</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{seller.paymentTerms}</span></div>}
                                            {seller.returnPolicy && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Returns</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{seller.returnPolicy}</span></div>}
                                            {seller.warranty && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Warranty</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{seller.warranty}</span></div>}
                                            {seller.dispatchOrigin && <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Ships from</span><span style={{ color: C.ink, fontWeight: 700 }} className="text-right">{seller.dispatchOrigin}</span></div>}
                                            {seller.freightIncluded != null && (
                                                <div className="flex justify-between gap-3">
                                                    <span style={{ color: C.muted }}>Freight</span>
                                                    <span style={{ color: seller.freightIncluded ? C.secondary : C.ink, fontWeight: 700 }} className="text-right">
                                                        {seller.freightIncluded ? "Included in price" : "Extra, paid by buyer"}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                )}

                                {error && <Notice tone="danger">{error}</Notice>}
                            </div>
                        </div>

                        {/* ---------------- Sticky footer ---------------- */}
                        <div className="shrink-0 border-t bg-white px-5 py-4 sm:px-6" style={{ borderColor: C.hairSoft }}>
                            {!locationStatus.serviceable ? (
                                <ConstraintNotice reasons={[{ icon: MapPin, message: locationStatus.message }]} />
                            ) : (
                                <>
                                    {!windowStatus.open && (
                                        <div className="mb-3"><Notice tone="warn">{windowStatus.message}</Notice></div>
                                    )}

                                    {quote && (
                                        <div className="mb-3 flex items-center justify-between">
                                            <span className="text-[11.5px] font-bold tracking-wider" style={{ color: C.muted }}>Total payable</span>
                                            <span className="flex items-center text-[19px] font-extrabold tabular-nums tracking-wider" style={{ color: C.ink }}>
                                                <IndianRupee className="h-4 w-4" />{inr(quote.subtotal)}
                                            </span>
                                        </div>
                                    )}

                                    {!isSample && (
                                        canBuyOnCredit ? (
                                            crossesCreditLimit ? (
                                                limitIncreasePending ? (
                                                    <div className="mb-2.5">
                                                        <Notice tone="info">
                                                            You've asked {seller.display_name} for a higher credit limit — waiting for their response.
                                                        </Notice>
                                                    </div>
                                                ) : limitIncreaseCooldownActive ? (
                                                    <div className="mb-2.5">
                                                        <Notice tone="warn">
                                                            This order is above your remaining credit. Your last request was declined — you can ask again
                                                            after {new Date(creditStatus.limit_increase_cooldown_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
                                                        </Notice>
                                                    </div>
                                                ) : (
                                                    <button type="button" onClick={handleRequestCreditIncrease} disabled={requestingIncrease}
                                                        className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border px-5 py-3 text-[13.5px] font-bold disabled:opacity-50"
                                                        style={{ borderColor: "#7c3aed40", color: "#7c3aed", background: "#7c3aed08" }}>
                                                        <CreditCard className="h-3.5 w-3.5" /> {requestingIncrease ? "Requesting…" : "Ask for a higher credit limit"}
                                                    </button>
                                                )
                                            ) : (
                                                <button type="button" onClick={() => handleSubmit("credit")} disabled={submitting || belowMoq || outOfStock || exceedsStock}
                                                    className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border px-5 py-3 text-[13.5px] font-bold disabled:opacity-50"
                                                    style={{ borderColor: "#7c3aed40", color: "#7c3aed", background: "#7c3aed08" }}>
                                                    <CreditCard className="h-3.5 w-3.5" /> {submitting ? "Placing…" : "Buy on credit"}
                                                </button>
                                            )
                                        ) : creditStatus?.status === "pending" ? (
                                            <div className="mb-2.5"><Notice tone="info">Your credit request to {seller.display_name} is awaiting their response — check your chat with them.</Notice></div>
                                        ) : creditCooldownActive ? (
                                            <div className="mb-2.5">
                                                <Notice tone="warn">Your last credit request was declined. You can request again after {new Date(creditStatus.cooldown_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</Notice>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={handleRequestCredit} disabled={requestingCredit || belowMoq || outOfStock || exceedsStock}
                                                className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-[12.5px] font-bold disabled:opacity-60"
                                                style={{ borderColor: "#7c3aed40", color: "#7c3aed", background: "#7c3aed08" }}>
                                                <CreditCard className="h-3.5 w-3.5" /> {requestingCredit ? "Requesting…" : "Request credit from this seller"}
                                            </button>
                                        )
                                    )}

                                    <div className="flex gap-2.5">
                                        {!isSample && !isCredit && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (quote && quote.meetsMoq === false) {
                                                        setError(`Minimum order quantity is ${formatMoqForBasis(quote.moq, seller)}.`);
                                                        return;
                                                    }
                                                    if (maxQuantity != null && Number(quantity) > Number(maxQuantity)) {
                                                        setError(`You can order at most ${maxQuantity} ${saleUnitLabel(seller?.masterPackSize)}${Number(maxQuantity) === 1 ? "" : "s"} from this seller.`);
                                                        return;
                                                    }
                                                    const confirmed = await pendingQuoteRef.current;
                                                    const finalQuote = confirmed || quote;
                                                    if (finalQuote && finalQuote.meetsMoq === false) {
                                                        setError(`Minimum order quantity is ${formatMoqForBasis(finalQuote.moq, seller)}.`);
                                                        return;
                                                    }
                                                    setSubmitting(true);
                                                    const res = await addToCart(token, { submissionId: seller.offerId, quantity: Number(quantity), purchaseBasis: basis });
                                                    setSubmitting(false);
                                                    if (!res?.success) return setError(res?.message || "Couldn't add to cart.");
                                                    onClose();
                                                    navigate("/cart");
                                                }}
                                                disabled={submitting || belowMoq || outOfStock || exceedsStock}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-3.5 text-[13.5px] font-bold disabled:opacity-50"
                                                style={{ borderColor: C.hair, color: C.ink }}
                                            >
                                                <ShoppingCart className="h-4 w-4" /> Add to cart
                                            </button>
                                        )}

                                        <button onClick={() => handleSubmit()} disabled={submitting || (!isSample && (belowMoq || outOfStock || exceedsStock))}
                                            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl px-5 py-3.5 text-[14px] font-bold text-white shadow-sm transition-opacity duration-150 disabled:opacity-50"
                                            style={{ background: isSample ? "linear-gradient(135deg, #006F83 0%, #047084 100%)" : "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (isSample ? "Request sample" : "Place order")}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}
            </motion.div>
            {showTransportModal && (
                <TransportPreferenceModal
                    open
                    seller={seller}
                    destCity={effectiveCity}
                    destState={effectiveState}
                    removedNotice={transportRemovedNotice}
                    onClose={() => { setShowTransportModal(false); setTransportRemovedNotice(null); }}
                    onResolved={(result) => {
                        if (result?.pending) {
                            setTransportPreference(null);
                            setPendingTransportProposal(result);
                        } else {
                            setTransportPreference(result);
                            setPendingTransportProposal(null);
                        }
                        setTransportRemovedNotice(null);
                        setShowTransportModal(false);
                    }}
                />
            )}
        </motion.div>
    );
}