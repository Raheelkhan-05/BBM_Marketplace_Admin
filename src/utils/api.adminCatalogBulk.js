// Image upload for admins. Always resolves to { success, url?, message? }.
// Calls POST /admin/catalog/upload (multer field "file") directly, so no other import is needed.
const UPLOAD_FOLDER = "catalog";

export async function uploadCatalogImage(token, file) {
    try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", UPLOAD_FOLDER); // ignored by the server if it does not use it

        // No Content-Type header: the browser sets the multipart boundary itself.
        const res = await fetch(`${API_BASE}/admin/catalog/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });

        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }

        if (!res.ok) {
            return { success: false, status: res.status, message: json?.message || `Upload failed (${res.status}). Please try again.` };
        }

        const url = json?.url || json?.imageUrl || json?.image || json?.data?.url || json?.data?.imageUrl || null;
        return json?.success !== false && url
            ? { success: true, url }
            : { success: false, message: json?.message || "Upload finished but no image link came back." };
    } catch (e) {
        console.error("[uploadCatalogImage]", e);
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}