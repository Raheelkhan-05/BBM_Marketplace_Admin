const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const CHUNK = 25;

async function call(path, token, { method = "GET", body, keepalive = false } = {}) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method, keepalive,
            headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok) return { success: false, status: res.status, code: json?.code, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}
const B = "/admin/seller-listings";
const q = (gstin) => `?gstin=${encodeURIComponent(gstin)}`;

export const lookupSeller = (token, gstin) => call(`${B}/lookup${q(gstin)}`, token);
export const startSellerSession = (token, gstin) => call(`${B}/session`, token, { method: "POST", body: { gstin } });

export const stageListing = (token, gstin, payload) => call(`${B}/staged`, token, { method: "POST", body: { gstin, payload } });
export const fetchStaged = (token, gstin) => call(`${B}/staged${q(gstin)}`, token);
export const deleteStaged = (token, id) => call(`${B}/staged/${id}`, token, { method: "DELETE" });
export const publishStagedNow = (token, gstin) => call(`${B}/staged/publish`, token, { method: "POST", body: { gstin } });

export const fetchDrafts = (token, gstin) => call(`${B}/drafts${q(gstin)}`, token);
export const patchDraft = (token, id, data, opts) => call(`${B}/drafts/${id}`, token, { method: "PATCH", body: { data }, ...opts });
export const deleteDraft = (token, id) => call(`${B}/drafts/${id}`, token, { method: "DELETE" });
export const clearDrafts = (token, gstin) => call(`${B}/drafts${q(gstin)}`, token, { method: "DELETE" });
export async function saveDrafts(token, { gstin, batchId, fileName, rows }) {
    const items = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await call(`${B}/drafts`, token, { method: "POST", body: { gstin, batchId, fileName, items: rows.slice(i, i + CHUNK) } });
        if (!r?.success) return r;
        items.push(...(r.items || []));
    }
    items.sort((a, b) => a.row_no - b.row_no);
    return { success: true, items };
}

// uses the "act as seller" token
export const deleteListing = (sellerToken, id) => call(`/seller/catalog/submissions/${id}`, sellerToken, { method: "DELETE" });