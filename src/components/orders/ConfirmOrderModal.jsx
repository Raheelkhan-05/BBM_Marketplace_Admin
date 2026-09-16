// components/orders/ConfirmOrderModal.jsx — NEW
//
// Shown when a seller clicks "Confirm order". Collects the transport
// method + its required details + an optional proof file + a note, then
// calls onConfirm(formData) where formData is a FormData ready to POST
// to /api/seller/orders/:id/confirm (multer field name "proof" for the
// file).
//
// If the buyer requested a specific method at Buy Now (order.buyer_transport_mode),
// the method is locked to that — the seller only fills in its details.
// Otherwise the seller picks any method from the ones they service
// (sellerTransportOptions — pass the seller's own seller_profiles.transport_options
// keys; falls back to showing every known channel if not provided).
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Upload, CheckCircle2, Truck } from "lucide-react";
import { TRANSPORT_OPTIONS, getTransportOption } from "../../../shared/transportOptions.js";

const C = { ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };

export default function ConfirmOrderModal({ open, order, sellerTransportOptions, onClose, onConfirm }) {
    const lockedMode = order?.buyer_transport_mode || null;
    const availableOptions = TRANSPORT_OPTIONS.filter((t) =>
        lockedMode ? t.key === lockedMode : (!sellerTransportOptions?.length || sellerTransportOptions.includes(t.key))
    );

    const [mode, setMode] = useState(lockedMode || availableOptions[0]?.key || "");
    const [fieldValues, setFieldValues] = useState({});
    const [notes, setNotes] = useState("");
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    if (!open) return null;

    const schema = getTransportOption(mode);

    const setField = (key, value) => setFieldValues((f) => ({ ...f, [key]: value }));

    const handleSubmit = async () => {
        setError(null);
        if (!mode) { setError("Please select a transport method."); return; }
        const missing = (schema?.fields || []).filter((f) => f.required && !String(fieldValues[f.key] || "").trim());
        if (missing.length) {
            setError(`Please fill in: ${missing.map((f) => f.label).join(", ")}.`);
            return;
        }

        const formData = new FormData();
        formData.append("mode", mode);
        formData.append("fields", JSON.stringify(fieldValues));
        if (notes.trim()) formData.append("notes", notes.trim());
        if (file) formData.append("proof", file);

        setSubmitting(true);
        const res = await onConfirm(formData);
        setSubmitting(false);
        if (!res?.success) setError(res?.message || "Couldn't confirm the order.");
    };

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 sm:items-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                onClick={onClose}
            >
                <motion.div
                    className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-xl sm:rounded-2xl"
                    initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="flex items-center gap-1.5 text-[15px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                                <Truck className="h-4 w-4" style={{ color: C.secondary }} /> Confirm order & transport
                            </p>
                            <p className="mt-0.5 text-[12px] font-semibold tracking-wide" style={{ color: C.muted }}>{order?.order_number}</p>
                        </div>
                        <button onClick={onClose} className="shrink-0 rounded-full p-1 hover:bg-black/5"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                    </div>

                    {lockedMode ? (
                        <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: `${C.secondary}0f` }}>
                            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: C.secondary }} />
                            <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: C.secondary }}>
                                Buyer requested <b>{getTransportOption(lockedMode)?.label}</b> for this order.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4">
                            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Transport method</label>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {availableOptions.map((t) => (
                                    <button key={t.key} type="button" onClick={() => { setMode(t.key); setFieldValues({}); }}
                                        className="rounded-full border px-3 py-1.5 text-[12px] font-bold tracking-wide transition-colors"
                                        style={mode === t.key ? { borderColor: C.secondary, background: `${C.secondary}14`, color: C.secondary } : { borderColor: C.hair, color: C.muted }}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            {!availableOptions.length && (
                                <p className="mt-1.5 text-[12px] font-semibold" style={{ color: C.primary }}>
                                    You haven't enabled any transport methods yet — add one from Shop Settings.
                                </p>
                            )}
                        </div>
                    )}

                    {schema && (
                        <div className="mt-4 flex flex-col gap-3">
                            {schema.fields.map((f) => (
                                <div key={f.key} className="flex flex-col gap-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                                        {f.label}{f.required && <span style={{ color: C.primary }}> *</span>}
                                    </label>
                                    {f.type === "textarea" ? (
                                        <textarea rows={2} value={fieldValues[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)}
                                            className="w-full resize-none rounded-lg border px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#006F83]" style={{ borderColor: C.hair }} />
                                    ) : (
                                        <input value={fieldValues[f.key] || ""} onChange={(e) => setField(f.key, e.target.value)}
                                            className="w-full rounded-lg border px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#006F83]" style={{ borderColor: C.hair }} />
                                    )}
                                </div>
                            ))}

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Proof / receipt (optional)</label>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[12.5px] font-semibold" style={{ borderColor: C.hair, color: C.muted }}>
                                    <Upload className="h-3.5 w-3.5" />
                                    {file ? file.name : "Upload a file (image or PDF)"}
                                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                                </label>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>Note to buyer (optional)</label>
                                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional info…"
                                    className="w-full resize-none rounded-lg border px-3 py-2 text-[13.5px] font-medium outline-none focus:border-[#006F83]" style={{ borderColor: C.hair }} />
                            </div>
                        </div>
                    )}

                    {error && <p className="mt-3 text-[12.5px] font-semibold" style={{ color: C.primary }}>{error}</p>}

                    <button onClick={handleSubmit} disabled={submitting || !schema}
                        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13.5px] font-bold tracking-wide text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #006F83 0%, #047084 100%)" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm order"}
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
