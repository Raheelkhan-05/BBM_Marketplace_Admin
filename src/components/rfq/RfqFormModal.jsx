// components/rfq/RfqFormModal.jsx — buyer: post a new enquiry, or edit a pending/rejected one
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { C, EASE } from "../seller/listingForm/FormPrimitives.jsx";
import RfqFormFields from "./RfqFormFields.jsx";
import { useBuyerAddress } from "../../context/BuyerAddressContext.jsx";
import { createRfq, updateRfq } from "../../utils/rfqApi.js";
import { EMPTY_RFQ_FORM, validateRfqForm, toPayload, fromDto } from "../../utils/rfqUtils.js";

function useSavedAddress() {
    let addr = null;
    try { addr = useBuyerAddress()?.selectedAddress || null; } catch { /* provider not mounted: no prefill */ }
    return addr;
}

export default function RfqFormModal({ mode = "create", initial = null, token, onClose, onSubmitted }) {
    const addr = useSavedAddress();
    const [form, setForm] = useState(() => (initial ? fromDto(initial) : { ...EMPTY_RFQ_FORM }));
    const [attempted, setAttempted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Prefill the delivery location from the saved profile address (create mode, only fields still empty).
    useEffect(() => {
        if (mode !== "create" || !addr) return;
        setForm((f) => ({
            ...f,
            deliveryPincode: f.deliveryPincode || addr.pincode || "",
            deliveryCity: f.deliveryCity || addr.city || "",
            deliveryState: f.deliveryState || addr.state || "",
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, addr?.pincode, addr?.city, addr?.state]);

    useEffect(() => {
        const sw = window.innerWidth - document.documentElement.clientWidth;
        const { style } = document.body;
        const prevO = style.overflow, prevP = style.paddingRight;
        style.overflow = "hidden";
        if (sw > 0) style.paddingRight = `${sw}px`;
        return () => { style.overflow = prevO; style.paddingRight = prevP; };
    }, []);

    const errors = useMemo(() => (attempted ? validateRfqForm(form) : {}), [attempted, form]);

    const submit = async () => {
        if (submitting) return;
        setAttempted(true);
        const errs = validateRfqForm(form);
        const first = Object.keys(errs)[0];
        if (first) {
            setError("Please fix the highlighted fields.");
            document.getElementById(`rfq-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const payload = toPayload(form);
            const res = mode === "edit" ? await updateRfq(token, initial.id, payload) : await createRfq(token, payload);
            if (!res.success) { setError(res.message || "Couldn't submit. Please try again."); return; }
            onSubmitted?.(res);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={submitting ? undefined : onClose}>
            <motion.div data-lenis-prevent
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-[#F7F7F8] sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b bg-white px-4 py-3.5 sm:px-5" style={{ borderColor: C.hair }}>
                    <div className="min-w-0">
                        <p className="text-[18px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                            {mode === "edit" ? "Edit enquiry" : "Post a new enquiry"}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>
                            Our team reviews every enquiry before it goes live to suppliers.
                        </p>
                    </div>
                    <button onClick={onClose} disabled={submitting} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05] disabled:opacity-40">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
                    {mode === "edit" && initial?.status === "rejected" && initial?.reviewNote && (
                        <div className="mb-3 rounded-xl px-3.5 py-3 text-[12.5px] font-semibold leading-snug tracking-wide" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                            Why it wasn't approved: {initial.reviewNote}
                        </div>
                    )}
                    <RfqFormFields form={form} setForm={setForm} errors={errors} token={token} />
                </div>

                <div className="border-t bg-white px-4 py-3 sm:px-5" style={{ borderColor: C.hair }}>
                    {error && (
                        <p className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold" style={{ color: C.danger }}>
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                        </p>
                    )}
                    <button type="button" onClick={submit} disabled={submitting}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold tracking-wider text-white transition-opacity disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #2e2e2eff 0%, #000000 100%)" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "edit" ? "Save & resubmit for review" : "Submit for review"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}