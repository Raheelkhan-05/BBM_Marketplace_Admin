// pages/admin/AdminFullCatalogUploadPage.jsx
//
// Lets an admin upload ONE Excel file containing brand items across many
// different categories / subcategories / generic products at once. The
// hierarchy is resolved (and created, if it doesn't exist yet) purely
// from the names in the sheet — hierarchy-level images are optional.
//
// Wire this up in your router, e.g.:
//   <Route path="/admin/catalog/bulk-upload" element={<AdminFullCatalogUploadPage />} />
//
// Uses two api.js helpers you'll need to add — see the snippet at the
// bottom of this file / the accompanying instructions.

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, UploadCloud, Download, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Layers } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { downloadFullCatalogTemplate, uploadFullCatalogFile } from "../../utils/api.js";

const HIERARCHY_LEVEL_LABEL = {
    category: "Categories",
    subcategory: "Subcategories",
    generic_product: "Generic Products",
};

export default function AdminFullCatalogUploadPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [selectedFile, setSelectedFile] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null); // { createdCount, skippedCount, created, skipped, hierarchyStats }
    const [error, setError] = useState("");

    async function handleDownloadTemplate() {
        setDownloading(true);
        try {
            const blob = await downloadFullCatalogTemplate(token);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "full-catalog-upload-template.xlsx";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            setError("Couldn't download the template. Please try again.");
        } finally {
            setDownloading(false);
        }
    }

    function handleFileChange(e) {
        setSelectedFile(e.target.files?.[0] || null);
        setResult(null);
        setError("");
    }

    async function handleUpload() {
        if (!selectedFile) return;
        setUploading(true);
        setError("");
        setResult(null);
        try {
            const res = await uploadFullCatalogFile(token, selectedFile);
            if (!res?.success) throw new Error(res?.message || "Upload failed.");
            setResult(res);
        } catch (e) {
            setError(e.message || "Upload failed. Please check the file and try again.");
        } finally {
            setUploading(false);
        }
    }

    function resetFile() {
        setSelectedFile(null);
        setResult(null);
        setError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    return (
        <div className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-6 sm:px-6">
            <button
                onClick={() => navigate("/catalog")}
                className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition-colors hover:text-[#047084]"
            >
                <ArrowLeft className="h-4 w-4" /> Back to catalog
            </button>

            <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#047084]/10">
                    <Layers className="h-5 w-5 text-[#047084]" />
                </div>
                <div>
                    <h1 className="text-[20px] font-extrabold text-slate-900 sm:text-[22px]">Bulk upload — full hierarchy</h1>
                    <p className="text-[13px] font-medium text-slate-500">
                        Upload products across many categories, subcategories &amp; generic products in one file.
                    </p>
                </div>
            </div>

            {/* How it works */}
            <div className="mt-6 rounded-xl border border-slate-100 bg-white p-5">
                <p className="text-[13px] font-bold text-slate-700">How it works</p>
                <ul className="mt-2.5 space-y-1.5 text-[12.5px] font-medium text-slate-500">
                    <li>• Each row is one product, plus the Category / Subcategory / Generic Product it belongs to.</li>
                    <li>• If a Category/Subcategory/Generic Product name already exists, it's reused — nothing gets duplicated.</li>
                    <li>• If it doesn't exist yet, it's created automatically from the name alone.</li>
                    <li>• Images for Category/Subcategory/Generic Product are optional. The product's own images are still required.</li>
                </ul>
            </div>

            {/* Step 1: template */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-5">
                <p className="text-[13px] font-bold text-slate-700">1. Download the template</p>
                <p className="mt-1 text-[12.5px] font-medium text-slate-400">
                    Fill it in — one row per product. Category/Subcategory/Generic Product names repeat on every
                    row that belongs to them.
                </p>
                <button
                    onClick={handleDownloadTemplate}
                    disabled={downloading}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download template
                </button>
            </div>

            {/* Step 2: upload */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-white p-5">
                <p className="text-[13px] font-bold text-slate-700">2. Upload your filled-in file</p>

                <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center hover:border-[#047084]/40 hover:bg-slate-50">
                    <UploadCloud className="h-7 w-7 text-slate-300" />
                    <span className="text-[13px] font-bold text-slate-600">
                        {selectedFile ? selectedFile.name : "Click to choose an .xlsx file"}
                    </span>
                    <span className="text-[11.5px] font-medium text-slate-400">or drag and drop</span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </label>

                <div className="mt-3 flex items-center gap-2">
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#047084] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-[#047084]/20 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                        {uploading ? "Uploading…" : "Upload & map"}
                    </button>
                    {selectedFile && !uploading && (
                        <button onClick={resetFile} className="text-[12.5px] font-bold text-slate-400 hover:text-slate-600">
                            Clear
                        </button>
                    )}
                </div>

                {error && (
                    <p className="mt-3 rounded-lg border border-[#c71f11]/15 bg-[#c71f11]/5 px-3.5 py-2.5 text-[12.5px] font-semibold text-[#c71f11]">
                        {error}
                    </p>
                )}
            </div>

            {/* Results */}
            {result && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard label="Products created" value={result.createdCount} tone="good" />
                        <StatCard label="Rows skipped" value={result.skippedCount} tone={result.skippedCount ? "bad" : "neutral"} />
                        {Object.entries(result.hierarchyStats || {}).map(([level, s]) => (
                            <StatCard
                                key={level}
                                label={HIERARCHY_LEVEL_LABEL[level] || level}
                                value={`${s.created} new / ${s.reused} reused`}
                                tone="neutral"
                                small
                            />
                        ))}
                    </div>

                    {result.created?.length > 0 && (
                        <div className="rounded-xl border border-slate-100 bg-white p-5">
                            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Created ({result.created.length})
                            </p>
                            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                                {result.created.map((item) => (
                                    <div key={item.id} className="py-2 text-[12.5px]">
                                        <p className="font-bold text-slate-800">{item.name}</p>
                                        <p className="font-medium text-slate-400">
                                            {item.category} → {item.subcategory} → {item.genericProduct}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {result.skipped?.length > 0 && (
                        <div className="rounded-xl border border-slate-100 bg-white p-5">
                            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                                <XCircle className="h-4 w-4 text-[#c71f11]" /> Skipped ({result.skipped.length})
                            </p>
                            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                                {result.skipped.map((item, i) => (
                                    <div key={i} className="py-2 text-[12.5px]">
                                        <p className="font-bold text-slate-800">
                                            Row {item.row} — {item.name}
                                        </p>
                                        <p className="font-medium text-[#c71f11]">{item.reasons.join("; ")}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}

function StatCard({ label, value, tone = "neutral", small }) {
    const toneClass = {
        good: "bg-emerald-50 text-emerald-700",
        bad: "bg-[#c71f11]/5 text-[#c71f11]",
        neutral: "bg-slate-50 text-slate-700",
    }[tone];
    return (
        <div className={`rounded-xl px-3.5 py-3 ${toneClass}`}>
            <p className={`font-extrabold ${small ? "text-[13px]" : "text-[19px]"}`}>{value}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
        </div>
    );
}