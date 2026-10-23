// utils/api.adminCatalogBulk.js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

// Maps many catalog brand items to one generic product in a single request.
export async function adminBulkMapBrandItems(token, brandItemIds, parentId) {
    try {
        const res = await fetch(`${API_BASE}/admin/catalog-bulk/map-brand-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: brandItemIds, parentId }),
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok) return { success: false, status: res.status, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}