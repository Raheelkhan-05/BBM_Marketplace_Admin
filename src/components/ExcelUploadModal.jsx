import { useState } from "react";
import { X, Download, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { adminDownloadCatalogTemplate, adminBulkUploadCatalog } from "../utils/api.js";

// Reusable for category / subcategory / generic_product / brand_item.
// `label` is just for copy; `level` + `parentId` drive the actual calls.
export default function ExcelUploadModal({ token, isOpen, onClose, level, label, parentId, onDone }) {
    const [file, setFile] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    function reset() { setFile(null); setResult(null); setError(""); }
    function handleClose() { reset(); onClose(); }

    async function handleTemplateDownload() {
        setDownloading(true);
        try {
            const blob = await adminDownloadCatalogTemplate(token, level);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${level}-upload-template.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message);
        } finally {
            setDownloading(false);
        }
    }

    async function handleUpload() {
        if (!file) return setError("Choose a file first.");
        setError(""); setUploading(true); setResult(null);
        try {
            const res = await adminBulkUploadCatalog(token, level, file, parentId);
            if (!res?.success) throw new Error(res?.message || "Upload failed.");
            setResult(res);
            onDone?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={handleClose}>
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-md sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 className="text-[16px] font-extrabold text-slate-900">Bulk upload — {label}</h3>
                    <button onClick={handleClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"><X className="h-4.5 w-4.5" /></button>
                </div>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                    <button onClick={handleTemplateDownload} disabled={downloading}
                        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download file format
                    </button>

                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-slate-400">
                        <Upload className="h-6 w-6" />
                        <span className="text-[12.5px] font-semibold text-slate-500">{file ? file.name : "Choose .xlsx file to upload"}</span>
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
                    </label>
                    {level === "brand_item" && (
                        <div className="flex flex-col gap-1">
                            <p className="text-[11.5px] font-medium text-slate-400">
                                Columns: Product Name, Brand Name, Manufacturer, Model/Part No/SKU (all required),
                                Grade/Variant (optional), Specifications (optional), and Image Links.
                            </p>
                            <p className="text-[11.5px] font-medium text-slate-400">
                                For multiple photos, separate the links with a comma in the "Image Links" column. The first link becomes the cover photo.
                            </p>
                            <p className="text-[11.5px] font-medium text-slate-400">
                                For Specifications, use "Key: Value" pairs separated by a semicolon — e.g. "Material: Stainless Steel 304; Finish: Matte; Weight: 1.2kg".
                            </p>
                        </div>
                    )}

                    {error && <p className="text-[12.5px] font-semibold text-[#c71f11]">{error}</p>}

                    {result && (
                        <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                            <div className="flex items-center gap-2 text-[12.5px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" /> {result.createdCount} added
                            </div>
                            {result.skippedCount > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 text-[12.5px] font-bold text-amber-700">
                                        <AlertTriangle className="h-4 w-4" /> {result.skippedCount} skipped
                                    </div>
                                    <div className="max-h-40 overflow-y-auto rounded-lg bg-white p-2 text-[11.5px] text-slate-500">
                                        {result.skipped.map((s, i) => (
                                            <div key={i} className="border-b border-slate-100 py-1 last:border-0">
                                                <span className="font-bold text-slate-700">Row {s.row} — {s.name}:</span> {s.reasons.join("; ")}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
                    <button onClick={handleClose} className="rounded-lg px-3.5 py-2 text-[13px] font-bold text-slate-500">Close</button>
                    <button onClick={handleUpload} disabled={uploading || !file}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Upload
                    </button>
                </div>
            </div>
        </div>
    );
}