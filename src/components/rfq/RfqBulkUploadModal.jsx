// components/rfq/RfqBulkUploadModal.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Download, UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { C, EASE } from "../seller/listingForm/FormPrimitives.jsx";
import { useBuyerAddress } from "../../context/BuyerAddressContext.jsx";
import { bulkCreateRfq } from "../../utils/rfqApi.js";
import { parseCsv, csvToForms, buildTemplateCsv, downloadText, toPayload } from "../../utils/rfqUtils.js";

const MAX_ROWS = 50;
const MAX_FILE_BYTES = 1024 * 1024;

export default function RfqBulkUploadModal({ token, onClose, onUploaded }) {
    let addr = null;
    try { addr = useBuyerAddress()?.selectedAddress || null; } catch { /* no prefill */ }

    const [fileName, setFileName] = useState("");
    const [parsed, setParsed] = useState(null); // { rows } | null
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [drag, setDrag] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const handleFile = async (file) => {
        setError(null); setParsed(null);
        if (!file) return;
        if (!/\.(csv|txt)$/i.test(file.name)) { setError("Please upload a .csv file. In Excel use File → Save As → CSV."); return; }
        if (file.size > MAX_FILE_BYTES) { setError("That file is too large (max 1 MB)."); return; }
        setFileName(file.name);
        const text = await file.text();
        const out = csvToForms(parseCsv(text), { pincode: addr?.pincode, city: addr?.city, state: addr?.state });
        if (out.error) { setError(out.error); return; }
        if (!out.rows.length) { setError("No enquiries found in the file."); return; }
        if (out.rows.length > MAX_ROWS) { setError(`That file has ${out.rows.length} rows. Please upload up to ${MAX_ROWS} at a time.`); return; }
        setParsed(out);
    };

    const { valid, invalid } = useMemo(() => {
        const rows = parsed?.rows || [];
        return { valid: rows.filter((r) => !Object.keys(r.errors).length), invalid: rows.filter((r) => Object.keys(r.errors).length) };
    }, [parsed]);

    const submit = async () => {
        if (!valid.length || submitting) return;
        setSubmitting(true); setError(null);
        try {
            const res = await bulkCreateRfq(token, valid.map((r) => toPayload(r.form)));
            if (!res.success) {
                const first = res.errors?.[0];
                setError(first ? `Row ${first.row}: ${first.message}` : res.message || "Upload failed. Please try again.");
                return;
            }
            onUploaded?.(res, invalid.length);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={submitting ? undefined : onClose}>
            <motion.div data-lenis-prevent className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-white sm:rounded-[24px]"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5" style={{ borderColor: C.hair }}>
                    <div>
                        <p className="text-[18px] font-extrabold tracking-wide" style={{ color: C.ink }}>Bulk upload enquiries</p>
                        {/* <p className="mt-0.5 text-[12px] font-medium tracking-wide" style={{ color: C.muted }}>Add up to {MAX_ROWS} enquiries from one CSV file.</p> */}
                    </div>
                    <button onClick={onClose} disabled={submitting} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.05]">
                        <X className="h-4 w-4" style={{ color: C.muted }} />
                    </button>
                </div>

                <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3" style={{ background: C.hairSoft }}>
                            <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug tracking-wide" style={{ color: C.ink }}>
                                1. Download the template, fill one enquiry per row, save as CSV. Delivery location defaults to your saved address when left blank.
                            </p>
                            <button type="button" onClick={() => downloadText("rfq-bulk-template.csv", buildTemplateCsv())}
                                className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[12.5px] font-bold tracking-wide" style={{ borderColor: C.hair, color: C.ink }}>
                                <Download className="h-3.5 w-3.5" /> Template
                            </button>
                        </div>

                        <label
                            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                            onDragLeave={() => setDrag(false)}
                            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
                            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors"
                            style={{ borderColor: drag ? C.ink : C.hair, background: drag ? "rgba(11,17,22,0.03)" : "#fff", color: C.muted }}>
                            <UploadCloud className="h-6 w-6" />
                            <span className="text-[13px] font-bold tracking-wide" style={{ color: C.ink }}>{fileName || "2. Choose or drop your CSV file"}</span>
                            <span className="text-[11.5px] font-medium">Product images can be added later by editing an enquiry, or via the image_url column.</span>
                            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                        </label>

                        {error && (
                            <p className="flex items-start gap-1.5 rounded-xl px-3.5 py-3 text-[12px] font-semibold leading-snug" style={{ background: "rgba(199,31,17,0.08)", color: C.danger }}>
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                            </p>
                        )}

                        {parsed && (
                            <div className="flex flex-col gap-2">
                                <p className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                                    <CheckCircle2 className="h-4 w-4" style={{ color: "#15803d" }} /> {valid.length} ready
                                    {invalid.length > 0 && <span style={{ color: C.danger }}> · {invalid.length} with issues (will be skipped)</span>}
                                </p>
                                <div className="max-h-72 overflow-auto rounded-xl border" style={{ borderColor: C.hair }}>
                                    <table className="w-full min-w-[520px] text-left text-[12px]">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="text-[10.5px] font-extrabold uppercase tracking-wider" style={{ color: C.muted }}>
                                                <th className="px-2.5 py-2">Row</th><th className="px-2.5 py-2">Product</th>
                                                <th className="px-2.5 py-2">Qty</th><th className="px-2.5 py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsed.rows.map((r) => {
                                                const errs = Object.values(r.errors);
                                                return (
                                                    <tr key={r.line} className="border-t font-semibold" style={{ borderColor: C.hairSoft, color: C.ink }}>
                                                        <td className="px-2.5 py-2 tabular-nums">{r.line}</td>
                                                        <td className="max-w-[220px] truncate px-2.5 py-2">{r.form.productName || "—"}</td>
                                                        <td className="px-2.5 py-2 tabular-nums">{r.form.quantity || "—"} {r.form.unit}</td>
                                                        <td className="px-2.5 py-2" style={{ color: errs.length ? C.danger : "#15803d" }}>{errs.length ? errs[0] : "OK"}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t px-4 py-3 sm:px-5" style={{ borderColor: C.hair }}>
                    <button type="button" onClick={submit} disabled={!valid.length || submitting}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-[13.5px] font-bold tracking-wider text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #2e2e2eff 0%, #000000 100%)" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : valid.length ? `Submit ${valid.length} enquir${valid.length === 1 ? "y" : "ies"} for review` : "Upload a file to continue"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}