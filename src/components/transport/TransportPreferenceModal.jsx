import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Truck,
    TrainFront,
    Plane,
    Package,
    Bike,
    UserRound,
    Loader2,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    Plus,
    Clock3,
    MapPin,
    Search,
    CheckCircle2,
    Check,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchBuyerAddresses } from "../../utils/api.js";
import {
    fetchSellerRouteOptions, fetchRouteSuggestions, proposeRouteOption,
} from "../../utils/api.transport.js";
import { saveBuyerTransportPreference } from "../../utils/api.transport.js";
import {
    ROUTE_TRANSPORT_GROUPS, getRouteTransportFields, routeTransportModeLabel, routeOptionSummary,
} from "../../../shared/routeTransportFields.js";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];
const MAX_SUGGESTIONS_SHOWN = 30;
// Keeps every stage's body roughly the same height so switching between
// "available options" / "propose" / "confirm" / "pending" doesn't visibly
// jolt the modal's size on every click.
const BODY_MIN_HEIGHT = "min-h-[360px]";

function parseDispatchOrigin(seller) {
    const parts = (seller?.dispatchOrigin || "").split(",").map((s) => s.trim());
    return { city: parts[0] || "", state: seller?.dispatchState || parts[1] || "" };
}

function filterGroupsBySellerOptions(groups, allowedModes) {
    if (!Array.isArray(allowedModes) || !allowedModes.length) return groups;
    return groups
        .map((g) => ({ ...g, modes: g.modes.filter((m) => allowedModes.includes(m)) }))
        .filter((g) => g.modes.length > 0);
}

function TransportIcon({ mode, className = "h-4 w-4" }) {
    const Icon = {
        roadway_transport: Truck,
        train_service: TrainFront,
        flight_service: Plane,
        parcel_service: Package,
        courier_service: Package,
        rapido: Bike,
        self_pickup: UserRound,
    }[mode] || Truck;

    return <Icon className={className} strokeWidth={2} />;
}

function groupOptionsByMode(options) {
    const byMode = new Map();
    for (const opt of options) {
        if (!byMode.has(opt.mode)) byMode.set(opt.mode, []);
        byMode.get(opt.mode).push(opt);
    }
    return Array.from(byMode.entries()).map(([mode, options]) => ({ mode, options }));
}

function toSentenceCase(value) {
    if (!value) return "";
    const text = String(value).trim();
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function Field({ field, value, onChange }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                {field.label}{field.required && <span style={{ color: C.primary }}> *</span>}
            </label>
            {field.type === "textarea" ? (
                <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)}
                    className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                    style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }} />
            ) : (
                <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded-lg border bg-white px-3 py-2 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                    style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }} />
            )}
        </div>
    );
}

function CustomDropdown({ value, onChange, options, placeholder = "Select…", label }) {
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [highlightedIdx, setHighlightedIdx] = useState(-1);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        if (!open) return;
        const idx = options.findIndex((o) => (o.value ?? o) === value);
        setHighlightedIdx(idx >= 0 ? idx : 0);
    }, [open, options, value]);

    useEffect(() => {
        if (!open || isMobile) return;
        const handleOutside = (e) => {
            if (!wrapperRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, [open, isMobile]);

    const selectedOption = options.find((o) => (o.value ?? o) === value);
    const selectedLabel = selectedOption ? (selectedOption.label ?? selectedOption) : null;

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Tab") {
            setOpen(false);
            return;
        }

        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
            return;
        }

        if (!open) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIdx((i) => Math.min(options.length - 1, i + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const opt = options[highlightedIdx];
            if (opt) handleSelect(opt.value ?? opt);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={handleKeyDown}
                className="flex w-full items-center justify-between rounded-xl border bg-white px-3.5 py-3 text-left text-[13px] font-bold tracking-wide focus:outline-none focus:ring-2"
                style={{
                    borderColor: C.hair,
                    color: selectedLabel ? C.ink : C.muted,
                    ["--tw-ring-color"]: `${C.secondary}22`,
                }}
            >
                <span className="truncate">{selectedLabel || placeholder}</span>
                <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform duration-150"
                    style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }}
                />
            </button>

            <AnimatePresence>
                {open && isMobile && (
                    <motion.div
                        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-[1px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            className="flex max-h-[75vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white"
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ duration: 0.28, ease: EASE }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div
                                className="flex items-center justify-between border-b px-4 py-3.5"
                                style={{ borderColor: C.hairSoft }}
                            >
                                <span className="text-[15.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                                    {label || "Select"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full"
                                    style={{ background: C.hairSoft }}
                                >
                                    <X className="h-3.5 w-3.5" style={{ color: C.muted }} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-2 py-2">
                                {options.map((o) => {
                                    const optValue = o.value ?? o;
                                    const optLabel = o.label ?? o;
                                    const active = optValue === value;

                                    return (
                                        <button
                                            key={optValue}
                                            type="button"
                                            role="option"
                                            aria-selected={active}
                                            onClick={() => handleSelect(optValue)}
                                            className="flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-[14.5px] font-semibold tracking-wider"
                                            style={active
                                                ? { background: `${C.secondary}12`, color: C.secondary }
                                                : { color: C.ink }}
                                        >
                                            {optLabel}
                                            {active && <Check className="h-4 w-4" style={{ color: C.secondary }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {open && !isMobile && (
                    <motion.div
                        role="listbox"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: EASE }}
                        className="absolute left-0 top-full z-[100] mt-1 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-xl border bg-white py-1.5 shadow-lg"
                        style={{ borderColor: C.hair }}
                    >
                        {options.map((o, idx) => {
                            const optValue = o.value ?? o;
                            const optLabel = o.label ?? o;
                            const active = optValue === value;

                            return (
                                <button
                                    key={optValue}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => handleSelect(optValue)}
                                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-bold tracking-wide transition-colors duration-100 hover:bg-black/[0.03]"
                                    style={active
                                        ? { color: C.secondary, background: `${C.secondary}0c` }
                                        : idx === highlightedIdx
                                            ? { background: "rgba(11,17,22,0.04)", color: C.ink }
                                            : { color: C.ink }}
                                >
                                    {optLabel}
                                    {active && <Check className="h-3.5 w-3.5" style={{ color: C.secondary }} />}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function TransportPreferenceModal({ open, seller, destCity: destCityProp, destState: destStateProp, removedNotice, onClose, onResolved }) {
    const { token } = useAuth();
    const origin = useMemo(() => parseDispatchOrigin(seller), [seller]);
    const allowedGroups = useMemo(
        () => filterGroupsBySellerOptions(ROUTE_TRANSPORT_GROUPS, seller?.transportOptions),
        [seller?.transportOptions]
    );

    const [destCity, setDestCity] = useState(destCityProp || "");
    const [expandedTransportGroup, setExpandedTransportGroup] = useState(null);
    const [destState, setDestState] = useState(destStateProp || "");
    const [needsManualDest, setNeedsManualDest] = useState(false);
    const [resolvingAddress, setResolvingAddress] = useState(!(destCityProp && destStateProp));

    const [loadingOptions, setLoadingOptions] = useState(false);
    const [approvedOptions, setApprovedOptions] = useState([]);

    // ---- Propose flow: collapsed -> modes -> suggestions -> form ----
    const [proposeStage, setProposeStage] = useState("collapsed");
    const [selectedMode, setSelectedMode] = useState(null);
    const [pickerSearch, setPickerSearch] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [fieldValues, setFieldValues] = useState({});

    const [submitting, setSubmitting] = useState(false);
    const [pendingResult, setPendingResult] = useState(null);
    const [error, setError] = useState(null);

    // NEW — holds whatever the buyer just tapped (an approved option or a
    // cross-seller suggestion) until they explicitly confirm it. Prevents
    // the "accidentally picked a transport option" issue new buyers were
    // running into from a single misplaced tap.
    const [confirmTarget, setConfirmTarget] = useState(null); // { kind: "approved" | "suggestion", option }
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (destCityProp && destStateProp) {
            setDestCity(destCityProp);
            setDestState(destStateProp);
            setResolvingAddress(false);
            return;
        }
        setResolvingAddress(true);
        fetchBuyerAddresses(token).then((res) => {
            const def = res?.addresses?.find((a) => a.is_default) || res?.addresses?.[0];
            if (def?.city && def?.state) {
                setDestCity(def.city);
                setDestState(def.state);
            } else {
                setNeedsManualDest(true);
            }
            setResolvingAddress(false);
        });
    }, [open, token, destCityProp, destStateProp]);

    useEffect(() => {
        if (!open) return;
        setProposeStage("collapsed");
        setSelectedMode(null);
        setPickerSearch("");
        setExpandedTransportGroup(null);
        setSuggestions([]);
        setFieldValues({});
        setPendingResult(null);
        setError(null);
        setConfirmTarget(null);
    }, [open, destCity, destState, seller?.sellerId]);

    const canQueryRoute = !resolvingAddress && destCity && destState && origin.city && origin.state;

    useEffect(() => {
        if (!open || !canQueryRoute) return;
        setLoadingOptions(true);
        fetchSellerRouteOptions({
            sellerId: seller.sellerId,
            originState: origin.state, originCity: origin.city,
            destState, destCity,
        }).then((res) => {
            const opts = res?.options || [];
            setApprovedOptions(opts);
            setLoadingOptions(false);
        });
    }, [open, canQueryRoute, seller?.sellerId, origin.state, origin.city, destState, destCity]);

    useEffect(() => {
        if (proposeStage !== "suggestions" || !selectedMode) return;
        setLoadingSuggestions(true);
        fetchRouteSuggestions({ originState: origin.state, originCity: origin.city, destState, destCity })
            .then((res) => {
                setSuggestions((res?.suggestions || []).filter((s) => s.mode === selectedMode));
                setLoadingSuggestions(false);
            });
    }, [proposeStage, selectedMode, origin.state, origin.city, destState, destCity]);

    const groupedApproved = useMemo(() => groupOptionsByMode(approvedOptions), [approvedOptions]);

    const filteredSuggestions = useMemo(() => {
        const needle = pickerSearch.trim().toLowerCase();
        const list = needle
            ? suggestions.filter((s) => routeOptionSummary(s.mode, s.fields).toLowerCase().includes(needle))
            : suggestions;
        return list.slice(0, MAX_SUGGESTIONS_SHOWN);
    }, [suggestions, pickerSearch]);
    const hasMoreSuggestions = useMemo(() => {
        const needle = pickerSearch.trim().toLowerCase();
        const total = needle
            ? suggestions.filter((s) => routeOptionSummary(s.mode, s.fields).toLowerCase().includes(needle)).length
            : suggestions.length;
        return total > MAX_SUGGESTIONS_SHOWN;
    }, [suggestions, pickerSearch]);

    // "Propose new" now fully replaces the approved-options list instead of
    // stacking underneath it — one focused task on screen at a time.
    const openProposeSection = () => { setProposeStage("modes"); };
    const collapseProposeSection = () => { setProposeStage("collapsed"); setSelectedMode(null); setPickerSearch(""); };

    // Dropdown-driven mode selection (flat list — the < select> collapses
    // the old group/pill grid into one control).
    const handleModeSelect = (mode) => {
        if (!mode) return;
        setSelectedMode(mode);
        setPickerSearch("");
        setFieldValues({});
        setError(null);
        setProposeStage("suggestions");
    };
    const backToModes = () => { setProposeStage("modes"); setSelectedMode(null); setPickerSearch(""); };

    const enterManually = () => {
        setFieldValues({});
        setError(null);
        setProposeStage("form");
    };
    const backToSuggestions = () => setProposeStage(suggestions.length || loadingSuggestions ? "suggestions" : "modes");

    const submitProposal = async (fieldsOverride) => {
        const fieldsToSubmit = fieldsOverride ?? fieldValues;
        setSubmitting(true);
        setError(null);
        const res = await proposeRouteOption({
            sellerId: seller.sellerId,
            originState: origin.state, originCity: origin.city,
            destState, destCity,
            mode: selectedMode, fields: fieldsToSubmit,
        }, token);
        setSubmitting(false);
        if (!res?.success) { setError(res?.message || "Couldn't submit that. Please try again."); return; }

        if (res.option.status === "approved") {
            const resolved = {
                routeOptionId: res.option.id, mode: res.option.mode, fields: res.option.fields,
                summary: routeOptionSummary(res.option.mode, res.option.fields),
                destState, destCity,
            };
            await saveBuyerTransportPreference({ sellerId: seller.sellerId, destState, destCity, preference: resolved }, token);
            onResolved(resolved);
            return;
        }
        setPendingResult(res);
    };

    // NEW — tapping a cross-seller suggestion now opens a confirmation
    // step instead of submitting immediately.
    const requestConfirmSuggestion = (s) => setConfirmTarget({ kind: "suggestion", option: s });

    const doSubmitSuggestion = async (s) => {
        setConfirming(true);
        setFieldValues(s.fields || {});
        setError(null);
        await submitProposal(s.fields || {});
        setConfirming(false);
        setConfirmTarget(null);
    };

    // NEW — tapping an already-approved option also goes through
    // confirmation now, same as suggestions.
    const requestConfirmApproved = (opt) => setConfirmTarget({ kind: "approved", option: opt });

    const doSelectApproved = async (opt) => {
        setConfirming(true);
        const resolved = {
            routeOptionId: opt.id, mode: opt.mode, fields: opt.fields,
            summary: routeOptionSummary(opt.mode, opt.fields),
            destState, destCity,
        };
        await saveBuyerTransportPreference({ sellerId: seller.sellerId, destState, destCity, preference: resolved }, token);
        setConfirming(false);
        setConfirmTarget(null);
        onResolved(resolved);
    };

    const handleConfirm = () => {
        if (!confirmTarget) return;
        if (confirmTarget.kind === "approved") doSelectApproved(confirmTarget.option);
        else doSubmitSuggestion(confirmTarget.option);
    };

    const continueWithoutPreference = async () => {
        await saveBuyerTransportPreference({ sellerId: seller.sellerId, destState, destCity, preference: null }, token);
        if (pendingResult?.option) {
            onResolved({
                pending: true,
                routeOptionId: pendingResult.option.id,
                mode: pendingResult.option.mode,
                fields: pendingResult.option.fields,
                summary: routeOptionSummary(pendingResult.option.mode, pendingResult.option.fields),
                destCity, destState,
            });
            return;
        }
        onResolved(null);
    };

    const groupFields = selectedMode ? getRouteTransportFields(selectedMode) : [];
    const canSubmitProposal = selectedMode && groupFields.filter((f) => f.required).every((f) => String(fieldValues[f.key] || "").trim());

    if (!open) return null;

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }} onClick={(e) => e.stopPropagation()}>

                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-wider" style={{ color: C.secondary }}>Transport preference</p>
                        <h2 className="mt-0.5 truncate text-[16px] font-bold tracking-wide" style={{ color: C.ink }}>{seller?.display_name}</h2>
                    </div>
                    <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                        <X className="h-4.5 w-4.5" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className={`flex-1 overflow-y-auto px-5 py-4 ${BODY_MIN_HEIGHT}`} data-lenis-prevent>
                    <AnimatePresence mode="wait" initial={false}>
                        {resolvingAddress ? (
                            <motion.div key="resolving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex items-center justify-center py-10">
                                <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} />
                            </motion.div>

                        ) : needsManualDest ? (
                            <motion.div key="manual-dest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex flex-col gap-3">
                                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                    <MapPin className="h-3.5 w-3.5" /> We need your city to check transport options on this route.
                                </p>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <input placeholder="Your city" value={destCity} onChange={(e) => setDestCity(e.target.value)}
                                        className="rounded-lg border px-3 py-2 text-[13px] tracking-wide" style={{ borderColor: C.hair }} />
                                    <input placeholder="Your state" value={destState} onChange={(e) => setDestState(e.target.value)}
                                        className="rounded-lg border px-3 py-2 text-[13px] tracking-wide" style={{ borderColor: C.hair }} />
                                </div>
                                <button disabled={!destCity || !destState} onClick={() => setNeedsManualDest(false)}
                                    className="w-fit rounded-lg px-4 py-2 text-[12.5px] font-bold tracking-wide text-white disabled:opacity-50"
                                    style={{ background: C.secondary }}>
                                    Continue
                                </button>
                            </motion.div>

                        ) : confirmTarget ? (
                            /* ---------------- NEW — confirmation step ---------------- */
                            <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2, ease: EASE }}
                                className="flex flex-col items-center gap-3 py-8 text-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${C.secondary}12` }}>
                                    <Truck className="h-5 w-5" style={{ color: C.secondary }} />
                                </span>
                                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Set as your preferred transport?</p>
                                <div className="w-full max-w-xs rounded-xl border px-4 py-3" style={{ borderColor: C.hair, background: C.hairSoft }}>
                                    <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                        {routeOptionSummary(confirmTarget.option.mode, confirmTarget.option.fields)}
                                    </p>
                                    <p className="mt-0.5 text-[11px] font-semibold tracking-wider" style={{ color: C.muted }}>
                                        {routeTransportModeLabel(confirmTarget.option.mode)}
                                    </p>
                                </div>
                                <p className="max-w-xs text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>
                                    {seller?.display_name} will ship your order via this option for {toSentenceCase(origin.city)} → {toSentenceCase(destCity)}.
                                </p>
                                <div className="mt-2 flex w-full max-w-xs gap-2.5">
                                    <button onClick={() => setConfirmTarget(null)} disabled={confirming}
                                        className="flex-1 rounded-xl border py-2.5 text-[12.5px] font-bold tracking-wide disabled:opacity-50"
                                        style={{ borderColor: C.hair, color: C.ink }}>
                                        Cancel
                                    </button>
                                    <button onClick={handleConfirm} disabled={confirming}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold tracking-wide text-white disabled:opacity-50"
                                        style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                        {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Confirm
                                    </button>
                                </div>
                            </motion.div>

                        ) : pendingResult ? (
                            <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2, ease: EASE }}
                                className="flex flex-col items-center gap-3 py-8 text-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `${C.secondary}12` }}>
                                    <Clock3 className="h-5 w-5" style={{ color: C.secondary }} />
                                </span>
                                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>Sent to the seller for approval</p>
                                <p className="max-w-xs text-[12.5px] font-medium tracking-wide" style={{ color: C.muted }}>
                                    We'll let you know once {seller?.display_name} approves this transport option for {toSentenceCase(origin.city)} → {toSentenceCase(destCity)}. You can continue placing your order in the meantime.
                                </p>
                                <button onClick={continueWithoutPreference}
                                    className="mt-2 rounded-xl px-5 py-2.5 text-[13px] font-bold tracking-wide text-white"
                                    style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                    Continue to order
                                </button>
                            </motion.div>

                        ) : (
                            <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="flex flex-col gap-4">
                                {removedNotice && (
                                    <div className="flex items-start gap-2 rounded-xl px-3.5 py-3" style={{ background: "#FEF6E7" }}>
                                        <Truck className="mt-[1px] h-4 w-4 shrink-0" style={{ color: "#92600A" }} />
                                        <p className="text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: "#92600A" }}>
                                            {removedNotice} Please pick another option below, or propose a new one.
                                        </p>
                                    </div>
                                )}

                                <p className="text-[12px] font-semibold tracking-wider" style={{ color: C.muted }}>
                                    {toSentenceCase(origin.city || "Seller")} → {toSentenceCase(destCity)}
                                </p>

                                {/* ---- "Available on this route" is hidden entirely once the
                                    propose flow is active, so only one task is on screen. ---- */}
                                {proposeStage === "collapsed" && (
                                    loadingOptions ? (
                                        <div className="flex items-center justify-center py-10">
                                            <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} />
                                        </div>
                                    ) : groupedApproved.length > 0 ? (
                                        <div className="flex flex-col gap-2">
                                            <p className="text-[11.5px] font-bold tracking-wide" style={{ color: C.ink }}>
                                                Available on this route
                                            </p>

                                            <div className="flex flex-col gap-1.5">
                                                {groupedApproved.map(({ mode, options }) => {
                                                    const isExpanded = expandedTransportGroup === mode;

                                                    return (
                                                        <div
                                                            key={mode}
                                                            className="overflow-hidden rounded-xl border"
                                                            style={{ borderColor: C.hair }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setExpandedTransportGroup(
                                                                        isExpanded ? null : mode
                                                                    );
                                                                }}
                                                                aria-expanded={isExpanded}
                                                                className="grid w-full grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-2 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                                                                style={{
                                                                    background: C.hairSoft,
                                                                    color: C.ink,
                                                                }}
                                                            >
                                                                {/* Fixed icon column */}
                                                                <span className="flex h-5 w-6 items-center justify-center">
                                                                    <TransportIcon
                                                                        mode={mode}
                                                                        className="h-[17px] w-[17px]"
                                                                    />
                                                                </span>

                                                                {/* Group name and count */}
                                                                <span className="flex min-w-0 items-center gap-2">
                                                                    <span className="min-w-0 truncate text-[12.5px] font-bold tracking-wide">
                                                                        {routeTransportModeLabel(mode)}
                                                                    </span>

                                                                    <span
                                                                        className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold tracking-wider"
                                                                        style={{
                                                                            background: "white",
                                                                            color: C.muted,
                                                                        }}
                                                                    >
                                                                        {options.length}
                                                                    </span>
                                                                </span>

                                                                {/* Fixed chevron column */}
                                                                <motion.span
                                                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                                                    transition={{ duration: 0.22, ease: EASE }}
                                                                    className="flex h-6 w-6 items-center justify-center"
                                                                >
                                                                    <ChevronDown
                                                                        className="h-4 w-4"
                                                                        style={{ color: C.muted }}
                                                                    />
                                                                </motion.span>
                                                            </button>

                                                            <AnimatePresence initial={false}>
                                                                {isExpanded && (
                                                                    <motion.div
                                                                        key="options"
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: "auto", opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        transition={{
                                                                            height: {
                                                                                duration: 0.28,
                                                                                ease: EASE,
                                                                            },
                                                                            opacity: {
                                                                                duration: 0.18,
                                                                                ease: "easeOut",
                                                                            },
                                                                        }}
                                                                        style={{ overflow: "hidden" }}
                                                                    >
                                                                        <div className="flex flex-col gap-1.5 px-2.5 py-2.5">
                                                                            {options.map((opt) => (
                                                                                <button
                                                                                    key={opt.id}
                                                                                    type="button"
                                                                                    onClick={() => requestConfirmApproved(opt)}
                                                                                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                                                                                    style={{ borderColor: C.hairSoft }}
                                                                                >
                                                                                    <div className="min-w-0">
                                                                                        <p
                                                                                            className="truncate text-[12.5px] font-bold tracking-wide"
                                                                                            style={{ color: C.ink }}
                                                                                        >
                                                                                            {routeOptionSummary(
                                                                                                opt.mode,
                                                                                                opt.fields
                                                                                            )}
                                                                                        </p>

                                                                                        {opt.fields?.contact_number && (
                                                                                            <p
                                                                                                className="truncate text-[10.5px] font-semibold tracking-wider"
                                                                                                style={{ color: C.muted }}
                                                                                            >
                                                                                                {opt.fields.contact_number}
                                                                                            </p>
                                                                                        )}
                                                                                    </div>

                                                                                    <ChevronRight
                                                                                        className="h-3.5 w-3.5 shrink-0"
                                                                                        style={{ color: C.muted }}
                                                                                    />
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 rounded-xl px-4 py-8 text-center" style={{ background: C.hairSoft }}>
                                            <Truck className="h-6 w-6" style={{ color: C.muted }} />
                                            <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>No transport options recorded yet</p>
                                            <p className="max-w-xs text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>
                                                Nobody has set up a transport route between {toSentenceCase(origin.city)} and {toSentenceCase(destCity)} with this seller yet.
                                            </p>
                                        </div>
                                    )
                                )}

                                {/* ---- Propose flow: collapsed -> modes -> suggestions -> form ---- */}
                                <AnimatePresence mode="wait" initial={false}>
                                    {proposeStage === "collapsed" && (
                                        <motion.button
                                            key="collapsed"
                                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.18, ease: EASE }}
                                            onClick={openProposeSection}
                                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-2.5 text-[12.5px] font-bold tracking-wide transition-colors duration-150 hover:bg-black/[0.03]"
                                            style={{ borderColor: `${C.primary}40`, color: C.primary }}
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Propose new transport option
                                        </motion.button>
                                    )}

                                    {proposeStage === "modes" && (
                                        <motion.div key="modes"
                                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.2, ease: EASE }}>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11.5px] font-bold tracking-wide" style={{ color: C.ink }}>Propose a transport option</p>
                                                <button onClick={collapseProposeSection} className="text-[11px] font-bold tracking-wide" style={{ color: C.muted }}>Cancel</button>
                                            </div>

                                            {/* ---- Custom dropdown: one flat list, no mode grouping ---- */}
                                            <div className="mt-2.5">
                                                <CustomDropdown
                                                    value={selectedMode || ""}
                                                    onChange={handleModeSelect}
                                                    label="Select a transport type"
                                                    placeholder="Select a transport type…"
                                                    options={allowedGroups.flatMap((g) =>
                                                        g.modes.map((mode) => ({
                                                            value: mode,
                                                            label: routeTransportModeLabel(mode),
                                                        }))
                                                    )}
                                                />
                                            </div>

                                            {allowedGroups.length === 0 && (
                                                <p className="mt-2 text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>This seller hasn't listed any transport types yet.</p>
                                            )}
                                        </motion.div>
                                    )}

                                    {proposeStage === "suggestions" && (
                                        <motion.div key="suggestions"
                                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.2, ease: EASE }}>
                                            <div className="flex items-center gap-2">
                                                <button onClick={backToModes} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                                                    <ChevronLeft className="h-4 w-4" style={{ color: C.muted }} />
                                                </button>
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(selectedMode)}</p>
                                            </div>

                                            {(loadingSuggestions || suggestions.length > 0) && (
                                                <div className="relative mt-2.5">
                                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: C.muted }} />
                                                    <input
                                                        value={pickerSearch}
                                                        onChange={(e) => setPickerSearch(e.target.value)}
                                                        placeholder="Search company or number…"
                                                        className="w-full rounded-lg border py-2 pl-8 pr-3 text-[13px] font-medium tracking-wide focus:outline-none focus:ring-2"
                                                        style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }}
                                                        autoFocus
                                                    />
                                                </div>
                                            )}

                                            <div className="mt-2.5 max-h-56 overflow-y-auto" data-lenis-prevent>
                                                {loadingSuggestions ? (
                                                    <div className="flex items-center justify-center py-6"><Loader2 className="h-4.5 w-4.5 animate-spin" style={{ color: C.muted }} /></div>
                                                ) : filteredSuggestions.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        <AnimatePresence initial={false}>
                                                            {filteredSuggestions.map((s, i) => (
                                                                <motion.button
                                                                    key={`${s.mode}::${routeOptionSummary(s.mode, s.fields)}::${i}`}
                                                                    layout
                                                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                                    transition={{ duration: 0.15 }}
                                                                    onClick={() => requestConfirmSuggestion(s)}
                                                                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                                                                    style={{ borderColor: C.hair }}>
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-[12.5px] font-bold tracking-wide" style={{ color: C.ink }}>{routeOptionSummary(s.mode, s.fields)}</p>
                                                                        {s.fields?.contact_number && (
                                                                            <p className="truncate text-[10.5px] font-semibold tracking-wider" style={{ color: C.muted }}>{s.fields.contact_number}</p>
                                                                        )}
                                                                    </div>
                                                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                                                                </motion.button>
                                                            ))}
                                                        </AnimatePresence>
                                                        {hasMoreSuggestions && (
                                                            <p className="pt-1 text-center text-[10.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                                                                Keep typing to narrow the list…
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="py-4 text-center text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>
                                                        {pickerSearch ? "No match — try a different search." : "No one's added this yet on this route."}
                                                    </p>
                                                )}
                                            </div>

                                            <button onClick={enterManually} className="mt-2.5 w-fit text-[12px] font-bold tracking-wide" style={{ color: C.secondary }}>
                                                Can't find it? Enter new details →
                                            </button>
                                        </motion.div>
                                    )}

                                    {proposeStage === "form" && (
                                        <motion.div key="form"
                                            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.2, ease: EASE }} className="flex flex-col gap-3">
                                            <div className="flex items-center gap-2">
                                                <button onClick={backToSuggestions} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.05]">
                                                    <ChevronLeft className="h-4 w-4" style={{ color: C.muted }} />
                                                </button>
                                                <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{routeTransportModeLabel(selectedMode)}</p>
                                            </div>

                                            <div className="flex flex-col gap-2.5">
                                                {groupFields.map((f) => (
                                                    <Field key={f.key} field={f} value={fieldValues[f.key] || ""}
                                                        onChange={(v) => setFieldValues((prev) => ({ ...prev, [f.key]: v }))} />
                                                ))}
                                            </div>

                                            {error && <p className="text-[12px] font-semibold tracking-wide" style={{ color: "#B3261E" }}>{error}</p>}

                                            <button disabled={!canSubmitProposal || submitting} onClick={() => submitProposal()}
                                                className="mt-1 rounded-xl px-4 py-3 text-[13px] font-bold tracking-wide text-white disabled:opacity-50"
                                                style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                                                {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Submit to seller"}
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button onClick={continueWithoutPreference} className="mt-1 w-fit text-[12px] font-bold tracking-wider" style={{ color: C.muted }}>
                                    Skip — decide later
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </motion.div>
    );
}