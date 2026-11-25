// utils/adminAdsApi.js — admin client for /api/admin/ads (mounted behind requireAuth + requireAdmin).
// Resolves to the server JSON; never throws.
import { API_BASE } from "./api.js";

async function call(token, method, path, { body, signal } = {}) {
    try {
        const headers = { Authorization: `Bearer ${token}` };
        let payload;
        if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
        const res = await fetch(`${API_BASE}/admin/ads${path}`, { method, headers, body: payload, signal });
        try { return { status: res.status, ...(await res.json()) }; }
        catch { return { success: false, status: res.status, message: "Unexpected server response." }; }
    } catch (e) {
        if (e?.name === "AbortError") return { aborted: true, success: false };
        return { success: false, message: "Network error. Please check your connection." };
    }
}
const qs = (o) => {
    const p = new URLSearchParams();
    Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
    const s = p.toString();
    return s ? `?${s}` : "";
};

export const adminGetPlacements = (token, signal) => call(token, "GET", "/placements", { signal });
export const adminPatchPlacement = (token, id, body) => call(token, "PATCH", `/placements/${id}`, { body });
export const adminPatchSettings = (token, body) => call(token, "PATCH", "/settings", { body });
export const adminGetOverrides = (token, placementId, signal) => call(token, "GET", `/overrides${qs({ placementId })}`, { signal });
export const adminCreateOverride = (token, body) => call(token, "POST", "/overrides", { body });
export const adminDeleteOverride = (token, id) => call(token, "DELETE", `/overrides/${id}`);
export const adminGetPricing = (token, placementId, day, signal) => call(token, "GET", `/pricing${qs({ placementId, day })}`, { signal });
export const adminGetBookings = (token, params, signal) => call(token, "GET", `/bookings${qs(params)}`, { signal });
export const adminRemoveBooking = (token, id, { reason, refundMode }) =>
    call(token, "POST", `/bookings/${id}/remove`, { body: { reason, refundMode } });