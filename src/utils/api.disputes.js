// utils/api.disputes.js
//
// Thin wrappers over the new endpoints. JSON calls reuse your existing
// apiGet / apiPost from ./api.js (same signature as adminWalletApi.js:
// apiX(path, token, body)). The two multipart calls (evidence uploads)
// need a raw fetch — if your api.transport.js already has a multipart helper
// (shipSellerOrderWithTransport does), reuse its base-URL/header logic here.
import { apiGet, apiPost } from "./api.js";

const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "/api";

async function postForm(path, token, formData) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }, // let the browser set the multipart boundary
            body: formData,
        });
        return await res.json();
    } catch {
        return { success: false, message: "Network error. Please check your connection and try again." };
    }
}

// ---- buyer ----
export const cancelMyOrderWithReason = (token, orderId, { reasonCode, reasonText }) =>
    apiPost(`/orders/${orderId}/cancel`, token, { reasonCode, reasonText });
export const fetchBuyerDispute = (token, orderId) => apiGet(`/orders/${orderId}/dispute`, token);
export const raiseOrderDispute = (token, orderId, formData) => postForm(`/orders/${orderId}/dispute`, token, formData);

// ---- seller ----
export const fetchSellerDispute = (token, orderId) => apiGet(`/seller/orders/${orderId}/dispute`, token);
export const respondToDispute = (token, orderId, formData) => postForm(`/seller/orders/${orderId}/dispute/respond`, token, formData);

// ---- admin ----
export function fetchAdminDisputes(token, { status = "open", q = "", page = 1 } = {}) {
    const p = new URLSearchParams({ status, page: String(page) });
    if (q) p.set("q", q);
    return apiGet(`/admin/disputes?${p.toString()}`, token);
}
export const fetchAdminDispute = (token, id) => apiGet(`/admin/disputes/${id}`, token);
export const adminStartDisputeReview = (token, id) => apiPost(`/admin/disputes/${id}/review`, token, {});
export const adminPostDisputeMessage = (token, id, message) => apiPost(`/admin/disputes/${id}/message`, token, { message });
export const adminResolveDispute = (token, id, body) => apiPost(`/admin/disputes/${id}/resolve`, token, body);
export function fetchSettlementLedger(token, { type = "", page = 1 } = {}) {
    const p = new URLSearchParams({ page: String(page) });
    if (type) p.set("type", type);
    return apiGet(`/admin/disputes/ledger?${p.toString()}`, token);
}
export const runSettlementSweep = (token) => apiPost(`/admin/disputes/settlements/run`, token, {});