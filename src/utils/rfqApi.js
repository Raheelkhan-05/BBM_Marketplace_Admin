// utils/rfqApi.js
// If your project already has a shared request helper in utils/api.js, swap `request` for it —
// everything else here only depends on its { success, ...data } return shape.
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(token, path, { method = "GET", body, signal } = {}) {
    try {
        const res = await fetch(`${BASE}${path}`, {
            method,
            signal,
            headers: {
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        return { ...data, success: res.ok && data.success !== false, status: res.status };
    } catch (e) {
        if (e?.name === "AbortError") throw e;
        return { success: false, message: "Network error. Please try again." };
    }
}

const qs = (o) => {
    const p = new URLSearchParams();
    Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : "";
};

// ── user ──
export const fetchRfqList = (token, { scope, q, status, limit, offset, signal }) =>
    request(token, `/rfq${qs({ scope, q, status, limit, offset })}`, { signal });
export const createRfq = (token, payload) => request(token, "/rfq", { method: "POST", body: payload });
export const bulkCreateRfq = (token, rows) => request(token, "/rfq/bulk", { method: "POST", body: { rows } });
export const updateRfq = (token, id, payload) => request(token, `/rfq/${id}`, { method: "PATCH", body: payload });
export const closeRfq = (token, id) => request(token, `/rfq/${id}/close`, { method: "POST" });

// ── admin ──
export const adminListRfq = (token, { status, q, limit, offset, signal }) =>
    request(token, `/admin/rfq${qs({ status, q, limit, offset })}`, { signal });
export const adminGetRfq = (token, id) => request(token, `/admin/rfq/${id}`);
export const adminSaveRfq = (token, id, body) => request(token, `/admin/rfq/${id}`, { method: "PATCH", body });
export const adminApproveRfq = (token, id, body) => request(token, `/admin/rfq/${id}/approve`, { method: "POST", body });
export const adminRejectRfq = (token, id, reason) => request(token, `/admin/rfq/${id}/reject`, { method: "POST", body: { reason } });
export const adminGetRfqSettings = (token) => request(token, "/admin/rfq/settings");
export const adminSetRfqSettings = (token, requireHierarchy) =>
    request(token, "/admin/rfq/settings", { method: "PUT", body: { requireHierarchy } });
export const adminCatalogOptions = (token, { pickerLevel, parentId, q, signal }) =>
    request(token, `/admin/catalog/options${qs({ pickerLevel, parentId, q })}`, { signal });
export const adminCreateCatalogOption = (token, { pickerLevel, name, parentId }) =>
    request(token, "/admin/catalog/options", { method: "POST", body: { pickerLevel, name, parentId } });