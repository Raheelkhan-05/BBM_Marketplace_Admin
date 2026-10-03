// components/rfq/RfqQuoteModal.jsx — PREVIEW ONLY: nothing is saved or sent yet (next phase).
import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Info } from "lucide-react";
import { C, EASE, TextField } from "../seller/listingForm/FormPrimitives.jsx";
import { fmtNum } from "../../utils/rfqUtils.js";

export default function RfqQuoteModal({ enquiry, onClose, onDone }) {
    const [price, setPrice] = useState("");
    const [days, setDays] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(false);

    const submit = () => {
        if (!(Number(price) > 0)) { setErr(true); return; }
        setBusy(true);
        setTimeout(() => { setBusy(false); onDone?.(); }, 500); // simulated
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div className="w-full max-w-md rounded-t-[28px] bg-white p-5 sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[17px] font-extrabold tracking-wide" style={{ color: C.ink }}>Submit your quote</p>
                        <p className="mt-0.5 truncate text-[12.5px] font-semibold tracking-wide" style={{ color: C.muted }}>
                            {enquiry.productName} · {fmtNum(enquiry.quantity)} Pack{enquiry.quantity === 1 ? "" : "s"} of {fmtNum(enquiry.packSize)} {enquiry.unit}
                        </p>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <p className="mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-snug tracking-wide" style={{ background: C.hairSoft, color: C.ink }}>
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Preview: quotes aren't delivered to the buyer yet. Full quoting arrives in the next update.
                </p>

                <div className="mt-3 flex flex-col gap-2.5">
                    <TextField required dense label="Your price per Pack (₹)" inputMode="decimal" value={price} error={err && !(Number(price) > 0)}
                        onChange={(v) => setPrice(v.replace(/[^\d.]/g, ""))} placeholder="e.g. 1250" />
                    <TextField dense label="Delivery time (days)" inputMode="numeric" value={days} onChange={(v) => setDays(v.replace(/\D/g, ""))} placeholder="Optional" />
                    <TextField dense label="Note" value={note} onChange={setNote} placeholder="Brand offered, validity, terms… (optional)" />
                </div>

                <button type="button" onClick={submit} disabled={busy}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold tracking-wider text-white disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #2e2e2eff 0%, #000000 100%)" }}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit quote"}
                </button>
            </motion.div>
        </motion.div>
    );
}