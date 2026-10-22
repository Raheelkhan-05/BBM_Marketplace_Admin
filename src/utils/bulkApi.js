// src/utils/bulkApi.js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const CHUNK = 25; // keeps every request far below the server's JSON body limit

async function call(path, token, { method = "GET", body, keepalive = false } = {}) {
    try {
        const res = await fetch(`${API_BASE}/seller/bulk${path}`, {
            method, keepalive,
            headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON body */ }
        if (!res.ok) return { success: false, status: res.status, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}

export const fetchBulkSummary = (token) => call("/summary", token);
export const fetchBulkItems = (token) => call("/items", token);
export const patchBulkItem = (token, id, data, opts) => call(`/items/${id}`, token, { method: "PATCH", body: { data }, ...opts });
export const markBulkItem = (token, id, body) => call(`/items/${id}/mark`, token, { method: "POST", body });
export const deleteBulkItem = (token, id) => call(`/items/${id}`, token, { method: "DELETE" });
export const clearBulkItems = (token) => call("/items", token, { method: "DELETE" });

// rows: [{ rowNo, data }]. Same batchId on a retry makes the save idempotent.
export async function saveBulkItems(token, { batchId, fileName, rows }) {
    const items = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await call("/items", token, { method: "POST", body: { batchId, fileName, items: rows.slice(i, i + CHUNK) } });
        if (!r?.success) return r;
        items.push(...(r.items || []));
    }
    items.sort((a, b) => a.row_no - b.row_no);
    return { success: true, items };
}