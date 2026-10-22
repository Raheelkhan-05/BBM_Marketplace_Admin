// components/checkout/DeliveryAddressModal.jsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Plus, Loader2, Check } from "lucide-react";
import { fetchBuyerAddresses, createBuyerAddress } from "../../utils/api.js";
import { fetchDeliveryAddressOptions } from "../../utils/addressUtils.js";
import { usePincodeResolution } from "../../hooks/usePincodeResolution.js";
import { useAuth } from "../../context/AuthContext.jsx";

const C = {
    ink: "#0B1116", muted: "#667077", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];
const EMPTY_NEW = { label: "Office", contact_name: "", contact_phone: "", address_line1: "", address_line2: "", city: "", state: "", pincode: "" };

// `onSelect` receives { addressId, city, state } — addressId is null for
// the synthetic business-profile option (nothing to persist as a saved
// address unless the buyer explicitly saves it via "Add new").
export default function DeliveryAddressModal({ open, initialAddressId, onSelect, onClose }) {
    const { token, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [addresses, setAddresses] = useState([]);
    const [businessAddress, setBusinessAddress] = useState(null);
    const [selectedId, setSelectedId] = useState(initialAddressId || null); // real id, or "business"
    const [showNewForm, setShowNewForm] = useState(false);
    const [newAddress, setNewAddress] = useState(EMPTY_NEW);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const { resolved: pincodeGeo, status: pincodeStatus, message: pincodeMessage } =
        usePincodeResolution(showNewForm ? newAddress.pincode : null);

    useEffect(() => {
        if (pincodeGeo) setNewAddress((a) => ({ ...a, city: pincodeGeo.district, state: pincodeGeo.state }));
    }, [pincodeGeo]);

    useEffect(() => {
        if (!open || !token) return;
        setLoading(true);
        Promise.all([fetchBuyerAddresses(token), fetchDeliveryAddressOptions(token, profile?.phone)])
            .then(([addrRes, fallbackRes]) => {
                const savedAddresses = addrRes?.addresses || [];
                setAddresses(savedAddresses);
                setBusinessAddress(fallbackRes.businessAddress);

                if (initialAddressId) {
                    setSelectedId(initialAddressId);
                } else {
                    const def = savedAddresses.find((a) => a.is_default) || savedAddresses[0];
                    setSelectedId(def ? def.id : (fallbackRes.businessAddress ? "business" : null));
                }
                // No saved addresses at all and no business profile either —
                // there's genuinely nothing to pick from, so open straight
                // into the "add new" form instead of showing an empty list.
                if (!savedAddresses.length && !fallbackRes.businessAddress) setShowNewForm(true);
            })
            .finally(() => setLoading(false));
    }, [open, token, initialAddressId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveNew = async () => {
        const missing = ["contact_name", "contact_phone", "address_line1", "city", "state", "pincode"].filter((k) => !newAddress[k].trim());
        if (missing.length) { setError("Please fill in the address completely."); return; }
        setError(null);
        setSaving(true);
        const res = await createBuyerAddress(token, { ...newAddress, is_default: addresses.length === 0 });
        setSaving(false);
        if (!res?.success) { setError(res?.message || "Couldn't save address."); return; }
        setAddresses((prev) => [res.address, ...prev]);
        setSelectedId(res.address.id);
        setShowNewForm(false);
    };

    const handleConfirm = () => {
        if (selectedId === "business" && businessAddress) {
            onSelect({ addressId: null, city: businessAddress.city, state: businessAddress.state });
            return;
        }
        const addr = addresses.find((a) => a.id === selectedId);
        if (!addr) return;
        onSelect({ addressId: addr.id, city: addr.city, state: addr.state });
    };

    if (!open) return null;

    return (
        <motion.div className="fixed inset-0 z-[998] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }} onClick={(e) => e.stopPropagation()}>

                <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <h2 className="text-[15.5px] font-bold tracking-wide" style={{ color: C.ink }}>Deliver to</h2>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    {loading ? (
                        <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: C.muted }} /></div>
                    ) : showNewForm ? (
                        <div className="flex flex-col gap-2.5">
                            <div className="grid grid-cols-2 gap-2.5">
                                <input placeholder="Contact name" value={newAddress.contact_name} onChange={(e) => setNewAddress((a) => ({ ...a, contact_name: e.target.value }))}
                                    className="rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: C.hair }} />
                                <input placeholder="Phone" value={newAddress.contact_phone} onChange={(e) => setNewAddress((a) => ({ ...a, contact_phone: e.target.value }))}
                                    className="rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: C.hair }} />
                            </div>
                            <input placeholder="Address line 1" value={newAddress.address_line1} onChange={(e) => setNewAddress((a) => ({ ...a, address_line1: e.target.value }))}
                                className="rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: C.hair }} />
                            <input placeholder="Pincode" value={newAddress.pincode}
                                onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6), city: "", state: "" }))}
                                className="rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: C.hair }} />
                            {pincodeStatus === "loading" && <p className="text-[11.5px] font-medium" style={{ color: C.muted }}>Looking up location…</p>}
                            {pincodeStatus === "error" && <p className="text-[11.5px] font-medium" style={{ color: "#B3261E" }}>{pincodeMessage}</p>}
                            {pincodeStatus === "ok" && newAddress.city && (
                                <p className="text-[12.5px] font-semibold" style={{ color: C.ink }}>{newAddress.city}, {newAddress.state}</p>
                            )}
                            {error && <p className="text-[12px] font-semibold" style={{ color: "#B3261E" }}>{error}</p>}
                            <div className="mt-1 flex gap-2">
                                {(addresses.length > 0 || businessAddress) && (
                                    <button onClick={() => { setShowNewForm(false); setError(null); }} className="flex-1 rounded-xl border py-2.5 text-[12.5px] font-bold" style={{ borderColor: C.hair, color: C.ink }}>
                                        Cancel
                                    </button>
                                )}
                                <button onClick={handleSaveNew} disabled={saving} className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: C.secondary }}>
                                    {saving ? "Saving…" : "Save & use this address"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {addresses.map((a) => {
                                const isSelected = selectedId === a.id;
                                return (
                                    <button key={a.id} onClick={() => setSelectedId(a.id)}
                                        className="flex items-start gap-3 rounded-xl border p-3 text-left"
                                        style={{ borderColor: isSelected ? C.secondary : C.hair, background: isSelected ? `${C.secondary}08` : "#fff" }}>
                                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: isSelected ? C.secondary : C.hair }}>
                                            {isSelected && <span className="h-2 w-2 rounded-full" style={{ background: C.secondary }} />}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>{a.label} · {a.contact_name}</p>
                                            <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>{a.address_line1}, {a.city}, {a.state} – {a.pincode}</p>
                                        </div>
                                    </button>
                                );
                            })}

                            {businessAddress && (
                                <button onClick={() => setSelectedId("business")}
                                    className="flex items-start gap-3 rounded-xl border p-3 text-left"
                                    style={{ borderColor: selectedId === "business" ? C.secondary : C.hair, background: selectedId === "business" ? `${C.secondary}08` : "#fff" }}>
                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: selectedId === "business" ? C.secondary : C.hair }}>
                                        {selectedId === "business" && <span className="h-2 w-2 rounded-full" style={{ background: C.secondary }} />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: C.ink }}>
                                            {businessAddress.label} <MapPin className="h-3 w-3" style={{ color: C.muted }} />
                                        </p>
                                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: C.muted }}>
                                            {businessAddress.city}, {businessAddress.state} – {businessAddress.pincode}
                                        </p>
                                    </div>
                                </button>
                            )}

                            <button onClick={() => { setNewAddress(EMPTY_NEW); setShowNewForm(true); setError(null); }}
                                className="flex w-fit items-center gap-1.5 px-1 py-1.5 text-[12.5px] font-bold" style={{ color: C.secondary }}>
                                <Plus className="h-3.5 w-3.5" /> Add a new address
                            </button>
                        </div>
                    )}
                </div>

                {!showNewForm && !loading && (
                    <div className="shrink-0 border-t px-5 py-3.5" style={{ borderColor: C.hairSoft }}>
                        <button onClick={handleConfirm} disabled={!selectedId}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13.5px] font-bold text-white disabled:opacity-50"
                            style={{ background: "linear-gradient(135deg, #d2462b 0%, #c71f11 100%)" }}>
                            <Check className="h-4 w-4" /> Deliver here
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}