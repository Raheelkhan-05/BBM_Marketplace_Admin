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

            <div className="adm-embed mt-4">
                <AdminCatalogBulkUpload token={token} say={say} onExit={() => navigate("/catalog")} />
            </div>

            <div role="status" aria-live="polite"
                className={`pointer-events-none fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}>{toast}</div>
        </main>
    );
}