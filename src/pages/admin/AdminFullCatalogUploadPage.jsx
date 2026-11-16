// pages/admin/AdminFullCatalogUploadPage.jsx
//
// Admin bulk upload of brand items across many categories / subcategories / generic products in ONE Excel file.
// Download template -> fill in -> upload -> check each product on screen -> "Confirm and next" adds it to the catalog.
// Names that already exist are reused; new ones are created. The workflow lives in AdminCatalogBulkUpload.
//
// Route (unchanged):
//   <Route path="/admin/catalog/bulk-upload" element={<AdminFullCatalogUploadPage />} />

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Layers } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { C } from "../../components/catalog/tokens";
import AdminCatalogBulkUpload from "../../components/admin/AdminCatalogBulkUpload.jsx";

export default function AdminFullCatalogUploadPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [toast, setToast] = useState("");
    const tt = useRef(null);

    const say = useCallback((m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 3200); }, []);
    useEffect(() => () => clearTimeout(tt.current), []);

    return (
        <main className="mx-auto min-h-screen w-full max-w-screen-2xl min-w-0 px-3 pb-24 pt-3 sm:px-5 md:px-6 lg:px-8">
            <style>{`.adm-embed .bar{position:sticky;bottom:0;left:auto;right:auto;width:100%}`}</style>

            <button onClick={() => navigate("/catalog")}
                className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold transition-colors hover:opacity-80" style={{ color: C.muted }}>
                <ArrowLeft className="h-4 w-4" /> Back to catalog
            </button>

            <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: C.hairSoft, color: C.ink }}><Layers className="h-5 w-5" /></span>
                <div className="min-w-0">
                    <h1 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-extrabold tracking-tight" style={{ color: C.ink }}>Bulk upload: Products</h1>
                    <p className="mt-1 max-w-2xl text-[13px] font-medium leading-relaxed sm:text-[14px]" style={{ color: C.muted }}>
                        Add many products in one file. Start from the product name. Products go live right away and wait under “Needs mapping” until you map them to a heirarchy.
                    </p>
                </div>
            </div>

            <div className="adm-embed mt-4">
                <AdminCatalogBulkUpload token={token} say={say} onExit={() => navigate("/catalog")} />
            </div>

            <div role="status" aria-live="polite"
                className={`pointer-events-none fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}>{toast}</div>
        </main>
    );
}