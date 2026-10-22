// utils/paymentsApi.js
//
// Frontend side of the JioPay integration. API_BASE already ends in "/api" (see utils/api.js),
// so these paths map to /api/payments/... on the backend.
import { apiGet, apiPost } from "./api.js";

// The buyer is sent to JioPay's hosted page; we remember where they were so the return page
// can send them back to the right place afterwards (wallet vs cart vs order).
const RETURN_KEY = "bbm_payment_return_to";

const expectedBody = (expectedTotal) =>
    expectedTotal != null && Number.isFinite(Number(expectedTotal)) ? { expectedTotal: Number(expectedTotal) } : {};

export const startOrderPayment = (token, orderId, expectedTotal = null) =>
    apiPost(`/payments/orders/${encodeURIComponent(orderId)}/checkout`, token, expectedBody(expectedTotal));

export const startGroupPayment = (token, groupId, expectedTotal = null) =>
    apiPost(`/payments/groups/${encodeURIComponent(groupId)}/checkout`, token, expectedBody(expectedTotal));

export const startWalletPayment = (token, amount) =>
    apiPost(`/payments/wallet/checkout`, token, { amount: String(amount) });

export const fetchPaymentStatus = (token, ref) =>
    apiGet(`/payments/attempts/${encodeURIComponent(ref)}`, token);

export function rememberPaymentReturnPath() {
    try { sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search); } catch { /* private mode */ }
}

// Only same-site absolute paths are ever returned (never "//host" or full URLs).
export function takePaymentReturnPath() {
    try {
        const v = sessionStorage.getItem(RETURN_KEY);
        return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
    } catch { return null; }
}

// Navigates the whole window to the gateway. Returns false (and does nothing) unless the URL is https.
export function redirectToGateway(url) {
    try {
        if (new URL(url).protocol !== "https:") return false;
    } catch { return false; }
    rememberPaymentReturnPath();
    window.location.assign(url);
    return true;
}