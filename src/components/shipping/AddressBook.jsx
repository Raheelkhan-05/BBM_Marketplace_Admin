// components/shipping/AddressBook.jsx
//
// Delivery address selector, driven by BuyerAddressContext (fetched once, shared everywhere).
//   props: onChange(addr), disabled, variant: "card" (default) | "bar"
//   ref:   openChange(), ensureSavedAddress()
//
// - "bar":  the Home-page selector. A whole-bar tap target with an "aura" ring (a soft
//           traffic-orange light travelling around the border), a small pin badge on the
//           top line that drops in with a ripple whenever the address changes, and a
//           black "Change" pill. Hero line is "Shop Name · City" (shop name comes from
//           the business profile via the context).
// - "card": full address card, used inside Buy Now / Cart / Transport modal.
// - The change/add modal renders in a portal (never clipped) above every other modal.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MapPin, Plus, Loader2, ChevronDown, ChevronRight, Pencil, Check, X, Phone } from "lucide-react";
import { C, TextField } from "../seller/listingForm/FormPrimitives.jsx";
import { usePincodeResolution } from "../../hooks/usePincodeResolution.js";
import { useBuyerAddress } from "../../context/BuyerAddressContext.jsx";

const EMPTY_ADDRESS = { label: "", contact_name: "", contact_phone: "", address_line1: "", address_line2: "", city: "", state: "", pincode: "" };
const stopBubble = (e) => e.stopPropagation();

// "SHIV-SHAKTI AUTO CENTER" -> "Shiv-Shakti Auto Center"
// Capitalizes the first letter after a start, space, hyphen, slash, bracket, comma or dot.
// Display only: the stored data is never changed.
function toTitleCase(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/(^|[\s\-/(.,])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// RAL 2009 "Traffic orange" = #DE5307 (222, 83, 7). The head of the comet is a lighter tint
// of the same hue (#FF9A5C = 255, 154, 92) so it reads as a glowing leading edge.
// Comet-style sweep: transparent for roughly half the turn, then a long, eased fade up
// through traffic orange to the light head, and back to fully transparent at 360deg so
// the loop seam is invisible.
const AURA_CONIC =
    "conic-gradient(from 0deg, rgba(222,83,7,0) 0deg, rgba(222,83,7,0) 180deg, rgba(222,83,7,0.4) 245deg, rgba(222,83,7,0.9) 305deg, #ff9a5c 340deg, rgba(255,154,92,0) 360deg)";

const AURA_CSS = `
.bbm-aura-spin {
    transform: translate(-50%, -50%);
    animation: bbm-aura-spin 7s linear infinite;
    will-change: transform;
}
@keyframes bbm-aura-spin {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
    .bbm-aura-spin { animation: none; }
}
`;

// Hairline frame + a light that travels around it. The square gradient layer is 200% of
// the bar's width so it always covers the bar's diagonal while rotating.
function AuraFrame({ children }) {
    return (
        <div className="relative isolate rounded-2xl">
            <style>{AURA_CSS}</style>

            {/* soft outer glow */}
            <span aria-hidden className="pointer-events-none absolute -inset-[3px] -z-10 overflow-hidden rounded-[19px] opacity-50 blur-[7px]">
                <span className="bbm-aura-spin absolute left-1/2 top-1/2 aspect-square w-[200%]" style={{ background: AURA_CONIC }} />
            </span>

            {/* ring (neutral hairline + travelling light) */}
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" style={{ background: "rgba(11,17,22,0.10)" }}>
                <span className="bbm-aura-spin absolute left-1/2 top-1/2 aspect-square w-[200%]" style={{ background: AURA_CONIC }} />
            </span>

            {/* opaque inner surface leaves a 1.5px ring visible */}
            <div className="relative m-[1.5px] rounded-[14.5px] bg-white">{children}</div>
        </div>
    );
}

// Black pin badge (same language as the Follow pin): drops in, squashes, settles, and
// sends out a single ripple. Re-plays whenever the address changes (keyed by id).
// `small` is the inline version used on the bar's top line.
function PinBadge({ addressKey, outlined = false, small = false }) {
    const box = small ? "h-5 w-5" : "h-9 w-9";
    const icon = small ? "h-3 w-3" : "h-4 w-4";
    const drop = small ? 6 : 12;
    return (
        <span className={`relative flex ${box} shrink-0 items-center justify-center`}>
            <motion.span
                key={`ripple-${addressKey}`}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ background: outlined ? "#006F83" : "#000" }}
                initial={{ opacity: 0.28, scale: 0.6 }}
                animate={{ opacity: 0, scale: small ? 2.6 : 2.1 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.28 }}
            />
            <motion.span
                key={`pin-${addressKey}`}
                className={`relative flex ${box} items-center justify-center rounded-full`}
                style={outlined
                    ? { background: "#006F831A", color: "#006F83", originY: 1 }
                    : { background: "#000", color: "#fff", originY: 1 }}
                initial={{ y: -drop, opacity: 0, scaleY: 1.15 }}
                animate={{ y: [-drop, drop / 4, 0], opacity: 1, scaleY: [1.15, 0.88, 1] }}
                transition={{ duration: 0.5, times: [0, 0.6, 1], ease: "easeOut" }}
            >
                <MapPin className={icon} strokeWidth={2.4} />
            </motion.span>
        </span>
    );
}

function SelectedAddressCard({ address, onChangeClick, disabled }) {
    if (!address) return null;
    const showLabel = address.label && address.label.trim().toLowerCase() !== (address.contact_name || "").trim().toLowerCase();
    return (
        <div className="flex items-start justify-between gap-3 rounded-xl border p-3.5" style={{ borderColor: C.hair, background: "#fff" }}>
            <div className="min-w-0">
                <p className="text-[14px] font-bold tracking-wide" style={{ color: C.ink }}>
                    {address.contact_name}
                    {showLabel && <span className="ml-1.5 font-semibold" style={{ color: C.muted }}>· {address.label}</span>}
                </p>
                <p className="mt-1 text-[12.5px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                    {address.address_line1}
                    {address.address_line2 ? `, ${address.address_line2}` : ""}, {address.city}, {address.state} – {address.pincode}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold tracking-wide" style={{ color: C.ink }}>
                    <Phone className="h-3 w-3 shrink-0" style={{ color: C.muted }} />
                    {address.contact_phone}
                </p>
            </div>
            <button type="button" disabled={disabled} onClick={onChangeClick}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-60"
                style={{ color: C.secondary, background: `${C.secondary}0f` }}>
                Change
            </button>
        </div>
    );
}

// Home-page bar. The top line holds the small pin badge, the small pincode and the optional
// label chip. Below it: "Shop Name · City" as the hero line, then the street address and
// state (no city, it is already in the hero line). Everything is shown in Title Case so
// the text looks uniform. The whole bar is one big tap target.
//
// `shopName` comes from the business profile (BuyerAddressContext). While it is still loading
// (or if the profile has none) the hero line falls back to the contact name.
function SelectedAddressBar({ address, shopName, onChangeClick, disabled }) {
    const label = (address.label || "").trim();
    const contact = (address.contact_name || "").trim();
    const heroName = toTitleCase((shopName || "").trim() || contact);
    const city = toTitleCase(address.city);

    // Hide the label chip when it just repeats the contact name or the hero name.
    const showLabel = label
        && label.toLowerCase() !== contact.toLowerCase()
        && label.toLowerCase() !== heroName.toLowerCase();

    // "Line 1, Line 2, State" (skips empty parts, city is intentionally left out)
    const addressLine = [address.address_line1, address.address_line2, address.city, address.state]
        .map((part) => toTitleCase(part))
        .filter(Boolean)
        .join(", ");

    return (
        <AuraFrame>
            <button
                type="button"
                onClick={onChangeClick}
                disabled={disabled}
                aria-label="Change delivery address"
                className="group flex w-full items-center gap-3 rounded-[14.5px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-black/[0.02] active:bg-black/[0.04] disabled:opacity-60"
            >
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em]" style={{ color: C.muted }}>
                        <PinBadge small addressKey={address.id} />
                        {address.pincode}
                        {showLabel && (
                            <span className="rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider" style={{ background: "#006F8314", color: "#006F83" }}>
                                {label}
                            </span>
                        )}
                    </span>
                    <span className="mt-1 block truncate text-[13.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                        {heroName}
                        {/* {city && <span className="font-semibold" style={{ color: C.muted }}> · {city}</span>} */}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                        {addressLine}
                    </span>
                </span>

                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-black py-1.5 pl-3 pr-2 text-[11.5px] font-bold tracking-wide text-white transition-transform duration-150 group-active:scale-95">
                    Change <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} />
                </span>
            </button>
        </AuraFrame>
    );
}

// One-line pill: pin + "Deliver to" + pincode + chevron. Used beside the GST toggle.
function CompactAddressPill({ address, onClick, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={`Delivering to ${address.pincode}. Change delivery address`}
            className="inline-flex h-2 items-center gap-1.5 bg-white text-[11.5px] tracking-wide transition-colors hover:bg-black/[0.03] active:scale-[0.98] disabled:opacity-60"
            style={{ borderColor: C.hair }}
        >
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "#006F83" }} strokeWidth={2.4} />
            <span className="shrink-0 font-semibold capitalize" style={{ color: C.muted }}>Deliver to</span>
            <span className="truncate font-extrabold tabular-nums" style={{ color: C.ink }}>{address.pincode}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} strokeWidth={2.4} />
        </button>
    );
}

function CompactEmptyPill({ onClick, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed bg-white pl-2.5 pr-2 text-[11.5px] font-bold tracking-wide disabled:opacity-60"
            style={{ borderColor: "#006F8366", color: "#006F83" }}
        >
            <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
            Add delivery address
            <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
        </button>
    );
}

function CompactSkeleton() {
    return <span className="block h-9 w-40 animate-pulse rounded-full" style={{ background: C.hairSoft }} />;
}

// No address yet: same frame, but an invitation instead of a value.
function EmptyAddressBar({ onAddClick, disabled }) {
    return (
        <AuraFrame>
            <button
                type="button"
                onClick={onAddClick}
                disabled={disabled}
                className="group flex w-full items-center gap-3 rounded-[14.5px] px-3 py-3 text-left transition-colors duration-150 hover:bg-black/[0.02] active:bg-black/[0.04] disabled:opacity-60"
            >
                <PinBadge addressKey="empty" outlined />
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>Add your delivery address</span>
                    <span className="block text-[11px] font-medium tracking-wide" style={{ color: C.muted }}>
                        See which sellers deliver to you and how fast
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-black py-1.5 pl-2.5 pr-3 text-[11.5px] font-bold tracking-wide text-white transition-transform duration-150 group-active:scale-95">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add
                </span>
            </button>
        </AuraFrame>
    );
}

function BarSkeleton({ seeding }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5" style={{ borderColor: C.hair }}>
            <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-2 w-16 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <span className="block h-3 w-40 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <span className="block h-2.5 w-52 max-w-full animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C.muted }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {seeding ? "Setting up…" : ""}
            </span>
        </div>
    );
}

function AddressRow({ addr, isSelected, isExpanded, onToggle, onDeliverHere, onEdit }) {
    return (
        <div className="rounded-xl border" style={{ borderColor: isSelected ? C.secondary : C.hair, background: isSelected ? `${C.secondary}08` : "#fff" }}>
            <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: isSelected ? C.secondary : C.hair }}>
                    {isSelected && <Check className="h-2.5 w-2.5" style={{ color: C.secondary }} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                        {addr.contact_name}{addr.label ? ` · ${addr.label}` : ""}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium leading-snug tracking-wide" style={{ color: C.muted }}>
                        {addr.address_line1}, {addr.city}, {addr.state} – {addr.pincode}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>{addr.contact_phone}</p>
                </div>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 transition-transform duration-150" style={{ color: C.muted, transform: isExpanded ? "rotate(180deg)" : "none" }} />
            </button>
            {isExpanded && (
                <div className="flex items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: C.hair }}>
                    <button type="button" onClick={onDeliverHere}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: C.secondary }}>
                        <Check className="h-3.5 w-3.5" /> Deliver to this address
                    </button>
                    <button type="button" onClick={onEdit}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold" style={{ color: C.ink, background: "rgba(20,27,34,0.045)" }}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                </div>
            )}
        </div>
    );
}

function AddressForm({ value, onField, onCancel, onSave, showCancel, saving, error }) {
    const { resolved: pincodeGeo, status: pincodeStatus, message: pincodeMessage } = usePincodeResolution(value.pincode || null);
    useEffect(() => {
        if (pincodeGeo) { onField("city", pincodeGeo.district); onField("state", pincodeGeo.state); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pincodeGeo]);

    return (
        <div className="flex flex-col gap-2.5 p-1">
            <TextField dense label="Address name (optional)" placeholder="e.g. Home, Warehouse, Head Office"
                value={value.label} onChange={(v) => onField("label", v)} />
            <div className="grid grid-cols-2 gap-2.5">
                <TextField dense label="Contact name" value={value.contact_name} onChange={(v) => onField("contact_name", v)} />
                <TextField dense label="Phone" value={value.contact_phone} onChange={(v) => onField("contact_phone", v)} />
            </div>
            <TextField dense label="Address line 1" value={value.address_line1} onChange={(v) => onField("address_line1", v)} />
            <TextField dense label="Address line 2 (optional)" value={value.address_line2} onChange={(v) => onField("address_line2", v)} />
            <TextField dense label="Pincode" value={value.pincode}
                onChange={(v) => {
                    const digits = v.replace(/\D/g, "").slice(0, 6);
                    onField("pincode", digits); onField("city", ""); onField("state", "");
                }} />
            {pincodeStatus === "loading" && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Looking up location…</p>}
            {pincodeStatus === "error" && <p className="text-[11.5px] font-medium" style={{ color: "#B3261E" }}>{pincodeMessage}</p>}
            {pincodeStatus === "ok" && value.city && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: C.secondary }} />
                    <p className="text-[13px] font-semibold tracking-wide" style={{ color: C.ink }}>{value.city}, {value.state}</p>
                </div>
            )}
            {error && <p className="text-[12px] font-semibold" style={{ color: "#B3261E" }}>{error}</p>}
            <div className="flex items-center gap-2">
                <button type="button" onClick={onSave} disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60" style={{ background: C.secondary }}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save address
                </button>
                {showCancel && (
                    <button type="button" onClick={onCancel} className="text-[12.5px] font-bold" style={{ color: C.muted }}>Cancel</button>
                )}
            </div>
        </div>
    );
}

const AddressBook = forwardRef(function AddressBook({ onChange, disabled, variant = "card" }, ref) {
    const { addresses, selectedAddress, loading, seeding, shopName, selectAddress, saveAddress } = useBuyerAddress();

    const [modalOpen, setModalOpen] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [formMode, setFormMode] = useState(null); // null | "add" | "edit"
    const [formTarget, setFormTarget] = useState(null);
    const [formData, setFormData] = useState(EMPTY_ADDRESS);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Report the selected address to the parent whenever it changes.
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; });
    useEffect(() => {
        if (selectedAddress) onChangeRef.current?.({ ...selectedAddress, isDraft: false });
    }, [selectedAddress]);

    const openAdd = () => { setFormTarget(null); setFormData(EMPTY_ADDRESS); setError(null); setFormMode("add"); };

    const openChangeModal = () => {
        setExpandedId(null); setError(null);
        if (!addresses.length) openAdd(); else setFormMode(null);
        setModalOpen(true);
    };
    const closeModal = () => { setModalOpen(false); setExpandedId(null); setFormMode(null); setFormTarget(null); setError(null); };

    useImperativeHandle(ref, () => ({
        openChange: openChangeModal,
        async ensureSavedAddress() { return selectedAddress?.id || addresses.find((a) => a.is_default)?.id || null; },
    }));

    const deliverHere = (addr) => { selectAddress(addr); closeModal(); };

    const openEdit = (addr) => {
        setFormTarget(addr.id);
        setFormData({
            label: addr.label || "", contact_name: addr.contact_name || "", contact_phone: addr.contact_phone || "",
            address_line1: addr.address_line1 || "", address_line2: addr.address_line2 || "",
            city: addr.city || "", state: addr.state || "", pincode: addr.pincode || "",
        });
        setError(null);
        setFormMode("edit");
    };
    const cancelForm = () => {
        setError(null); setFormTarget(null);
        if (!addresses.length) closeModal(); else setFormMode(null);
    };
    const setField = (key, val) => setFormData((f) => ({ ...f, [key]: val }));

    const saveForm = async () => {
        const missing = ["contact_name", "contact_phone", "address_line1", "city", "state", "pincode"].filter((k) => !String(formData[k] || "").trim());
        if (missing.length) { setError("Please fill in the address completely."); return; }
        setError(null);
        setSaving(true);
        try {
            const res = await saveAddress({ id: formMode === "edit" ? formTarget : null, data: formData });
            if (!res?.success) { setError(res?.message || "Couldn't save address."); return; }
            if (formMode === "edit") { setFormMode(null); setFormTarget(null); }
            else closeModal(); // new address is already selected + default
        } finally {
            setSaving(false);
        }
    };

    const busy = loading || seeding;

    return (
        <div className="flex flex-col gap-2.5">
            {variant === "compact" ? (
                busy ? <CompactSkeleton />
                    : selectedAddress
                        ? <CompactAddressPill address={selectedAddress} onClick={openChangeModal} disabled={disabled} />
                        : <CompactEmptyPill onClick={openChangeModal} disabled={disabled} />
            ) : busy ? (
                variant === "bar" ? (
                    <BarSkeleton seeding={seeding} />
                ) : (
                    <div className="flex items-center gap-2 py-2 text-[12px] font-semibold" style={{ color: C.muted }}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {seeding ? "Setting up your address…" : "Loading your address…"}
                    </div>
                )
            ) : selectedAddress ? (
                variant === "bar"
                    ? <SelectedAddressBar address={selectedAddress} shopName={shopName} onChangeClick={openChangeModal} disabled={disabled} />
                    : <SelectedAddressCard address={selectedAddress} onChangeClick={openChangeModal} disabled={disabled} />
            ) : variant === "bar" ? (
                <EmptyAddressBar onAddClick={openChangeModal} disabled={disabled} />
            ) : (
                <button type="button" onClick={openChangeModal} disabled={disabled}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-3 text-[12.5px] font-bold tracking-wide disabled:opacity-60"
                    style={{ borderColor: `${C.secondary}55`, color: C.secondary }}>
                    <Plus className="h-3.5 w-3.5" /> Add delivery address
                </button>
            )}

            {modalOpen && createPortal(
                <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" onClick={stopBubble}>
                    <div onClick={closeModal} className="absolute inset-0 bg-black/40" />

                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            formMode
                                ? formMode === "edit"
                                    ? "Edit address"
                                    : "Add a new address"
                                : "Choose a delivery address"
                        }
                        className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
                        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3.5" style={{ borderColor: C.hair }}>
                            <span className="text-[14px] font-bold" style={{ color: C.ink }}>
                                {formMode ? (formMode === "edit" ? "Edit address" : "Add a new address") : "Choose a delivery address"}
                            </span>
                            <button type="button" onClick={closeModal} className="rounded-full p-1.5" style={{ background: "rgba(20,27,34,0.045)" }}>
                                <X className="h-4 w-4" style={{ color: C.ink }} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3.5" data-lenis-prevent
                            onWheel={stopBubble} onTouchStart={stopBubble} onTouchMove={stopBubble}>
                            {formMode ? (
                                <AddressForm value={formData} onField={setField} onCancel={cancelForm} onSave={saveForm}
                                    showCancel saving={saving} error={error} />
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {addresses.map((addr) => (
                                        <AddressRow key={addr.id} addr={addr}
                                            isSelected={addr.id === selectedAddress?.id}
                                            isExpanded={expandedId === addr.id}
                                            onToggle={() => setExpandedId((cur) => (cur === addr.id ? null : addr.id))}
                                            onDeliverHere={() => deliverHere(addr)}
                                            onEdit={() => openEdit(addr)} />
                                    ))}
                                    <button type="button" onClick={openAdd}
                                        className="flex w-fit items-center gap-1.5 rounded-lg px-1 py-1.5 text-[12.5px] font-bold" style={{ color: C.secondary }}>
                                        <Plus className="h-3.5 w-3.5" /> Add a new address
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
});

export default AddressBook;