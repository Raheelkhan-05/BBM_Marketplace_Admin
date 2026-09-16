// components/orders/ShipOrderModal.jsx
//
// Opens when the seller taps "Mark as shipped" on a confirmed order.
// Replaces the old bare status flip: the seller must attach the LR
// document (for the buyer's reference — what was shipped, when, how to
// track/collect it) and the bill for this order before the status can
// move to "shipped". Carries an explicit liability warning per the
// product requirement: incomplete/undelivered orders without these
// details on file are treated as the seller's fault.
//
// The transport COMPANY (mode + fields) was already agreed before
// purchase via the Transport Library — this modal only shows that as
// read-only context and collects the per-shipment LR number + files.
import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Upload, AlertTriangle, FileText, Receipt, Truck } from "lucide-react";
import { routeOptionSummary, routeTransportModeLabel } from "../../../shared/routeTransportFields.js";

const C = {
    ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
};
const EASE = [0.16, 1, 0.3, 1];

function FileDrop({ label, hint, file, onChange, accept = "image/*,application/pdf" }) {
    return (
        <label className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-dashed p-3.5" style={{ borderColor: file ? C.secondary : C.hair, background: file ? `${C.secondary}08` : "#fff" }}>
            <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" style={{ color: file ? C.secondary : C.muted }} />
                <span className="text-[13px] font-bold" style={{ color: C.ink }}>{label}</span>
            </span>
            {file ? (
                <span className="truncate text-[11.5px] font-semibold" style={{ color: C.secondary }}>{file.name}</span>
            ) : (
                <span className="text-[11px] font-medium" style={{ color: C.muted }}>{hint}</span>
            )}
            <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        </label>
    );
}

export default function ShipOrderModal({ open, order, onClose, onConfirm }) {
    const [lrNumber, setLrNumber] = useState("");
    const [lrNotes, setLrNotes] = useState("");
    const [lrFile, setLrFile] = useState(null);
    const [billFile, setBillFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    if (!open) return null;

    const transportSummary = order?.transport_mode
        ? routeOptionSummary(order.transport_mode, order.transport_fields || {})
        : "Not agreed pre-purchase";

    const canSubmit = lrNumber.trim() && lrFile && billFile;

    const handleSubmit = async () => {
        if (!canSubmit) {
            setError("Please fill in the LR number and attach both files.");
            return;
        }
        setSubmitting(true);
        setError(null);
        const formData = new FormData();
        formData.append("lrNumber", lrNumber.trim());
        formData.append("lrNotes", lrNotes.trim());
        formData.append("lr_proof", lrFile);
        formData.append("bill", billFile);

        const res = await onConfirm(formData);
        setSubmitting(false);
        if (!res?.success) setError(res?.message || "Couldn't mark this order as shipped.");
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div
                className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[20px]"
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }} onClick={(e) => e.stopPropagation()}>

                <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.hair }}>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-wider" style={{ color: C.secondary }}>Mark as shipped</p>
                        <h2 className="mt-0.5 truncate text-[16px] font-bold tracking-wide" style={{ color: C.ink }}>{order?.order_number}</h2>
                    </div>
                    <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4.5 w-4.5" style={{ color: C.muted }} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "#fffbbeff" }}>
                        <AlertTriangle className="mt-[1px] h-4 w-4 shrink-0" style={{ color: "#c57600ff" }} />
                        <p className="text-[12px] font-semibold leading-snug tracking-wide" style={{ color: "#c57600ff" }}>
                            Upload the LR details and bill before shipping. If this order doesn't get delivered completely, or these details aren't uploaded properly, you (the seller) will be considered at fault.
                        </p>
                    </div>

                    <div className="mt-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-3" style={{ borderColor: C.hairSoft }}>
                        <Truck className="h-4 w-4 shrink-0" style={{ color: C.secondary }} />
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold tracking-wider" style={{ color: C.muted }}>Agreed transport</p>
                            <p className="truncate text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>
                                {transportSummary}{order?.transport_mode ? ` · ${routeTransportModeLabel(order.transport_mode)}` : ""}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>LR / tracking number <span style={{ color: C.primary }}>*</span></label>
                            <input value={lrNumber} onChange={(e) => setLrNumber(e.target.value)}
                                className="rounded-lg border px-3 py-2 text-[13.5px] font-medium focus:outline-none focus:ring-2 tracking-wide"
                                style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }} placeholder="e.g. LR-48213" />
                        </div>

                        <FileDrop label="LR document (buyer reference)" hint="Photo or PDF of the LR/consignment note" file={lrFile} onChange={setLrFile} />
                        <FileDrop label="Bill for this order" hint="Photo or PDF of the invoice/bill" file={billFile} onChange={setBillFile} />

                        <div className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-wide" style={{ color: C.ink }}>Notes for the buyer (optional)</label>
                            <textarea rows={2} value={lrNotes} onChange={(e) => setLrNotes(e.target.value)}
                                className="w-full resize-none rounded-lg border bg-white px-3 py-2 text-[13px] font-medium focus:outline-none focus:ring-2 tracking-wide"
                                style={{ borderColor: C.hair, ["--tw-ring-color"]: `${C.secondary}22` }}
                                placeholder="Pickup point, expected transit time, etc." />
                        </div>

                        {error && <p className="text-[12px] font-semibold" style={{ color: "#B3261E" }}>{error}</p>}
                    </div>
                </div>

                <div className="shrink-0 border-t px-5 py-4" style={{ borderColor: C.hairSoft }}>
                    <button onClick={handleSubmit} disabled={!canSubmit || submitting}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold text-white disabled:opacity-50 tracking-wide"
                        style={{ background: "linear-gradient(135deg, #006F83 0%, #047084 100%)" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm shipment"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}