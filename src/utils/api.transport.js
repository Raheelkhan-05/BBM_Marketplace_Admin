// utils/api.transport.js
//
// New API functions for the Transport Library. These follow whatever
// base-fetch/auth-header pattern your existing utils/api.js already uses
// (that file wasn't in scope for this pass, so this is written as a
// standalone module with its own thin `request` helper — merge these
// functions into your existing api.js and swap `request` for your
// existing fetch wrapper, e.g. one that already injects auth headers
// from the token/cookie your other api.js functions use).
import { API_BASE } from "./api.js";

const BASE = API_BASE;

async function request(path, { method = "GET", body, token, isForm = false } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!isForm && body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        credentials: "include",
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    try {
        return await res.json();
    } catch {
        return { success: false, message: "Unexpected response from server." };
    }
}


// ---- Buyer-facing ----
export function fetchSellerRouteOptions({ sellerId, originState, originCity, destState, destCity }) {
    const qs = new URLSearchParams({ sellerId, originState, originCity, destState, destCity });
    return request(`/transport-library/route-options?${qs.toString()}`);
}

export function fetchRouteSuggestions({ originState, originCity, destState, destCity }) {
    const qs = new URLSearchParams({ originState, originCity, destState, destCity });
    return request(`/transport-library/route-suggestions?${qs.toString()}`);
}

export function proposeRouteOption({ sellerId, originState, originCity, destState, destCity, mode, fields, note }, token) {
    return request(`/transport-library/propose`, { method: "POST", token, body: { sellerId, originState, originCity, destState, destCity, mode, fields, note } });
}

export function browseTransportLibrary({ originCity, destCity, q }) {
    const qs = new URLSearchParams();
    if (originCity) qs.set("originCity", originCity);
    if (destCity) qs.set("destCity", destCity);
    if (q) qs.set("q", q);
    return request(`/transport-library/browse?${qs.toString()}`);
}

// ---- Seller-facing (manage page) ----
export function fetchMyRouteOptions(token) {
    return request(`/transport-library/mine`, { token });
}

export function fetchPendingProposals(token) {
    return request(`/transport-library/proposals`, { token });
}

export function createOwnRouteOption({ originState, originCity, destState, destCity, mode, fields }, token) {
    return request(`/transport-library/options`, { method: "POST", token, body: { originState, originCity, destState, destCity, mode, fields } });
}

export function updateOwnRouteOption(id, fields, token) {
    return request(`/transport-library/options/${id}`, { method: "PATCH", token, body: { fields } });
}

export function deleteOwnRouteOption(id, token) {
    return request(`/transport-library/options/${id}`, { method: "DELETE", token });
}

export function approveProposal(id, token) {
    return request(`/transport-library/proposals/${id}/approve`, { method: "POST", token });
}

export function rejectProposal(id, reason, token) {
    return request(`/transport-library/proposals/${id}/reject`, { method: "POST", token, body: { reason } });
}

// ---- Ship step (seller order detail — add alongside your other
// order API functions in utils/api.js, using your existing auth pattern) ----
//
// FIXED: this was the one function in the file hitting a bare relative
// path (`/seller/orders/${orderId}/ship`) instead of `${BASE}${path}`
// like every other function here. If your API isn't served from the
// same origin as your frontend, that request was silently going
// somewhere else entirely (a different host/route with no auth
// middleware, or your frontend's own server) — which is exactly what
// produces "unauthorized" on this call while every other (correctly
// prefixed) call works fine.
export async function shipSellerOrderWithTransport(token, orderId, formData) {
    const res = await fetch(`${BASE}/seller/orders/${orderId}/ship`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        body: formData, // multipart: lrNumber, lrNotes, lr_proof, bill
    });
    try { return await res.json(); } catch { return { success: false, message: "Couldn't reach the server." }; }
}

export function fetchBuyerTransportPreference(sellerId, destState, destCity, token, checkProposalId) {
    const qs = new URLSearchParams({ sellerId, destState: destState || "", destCity: destCity || "" });
    if (checkProposalId) qs.set("checkProposalId", checkProposalId);
    return request(`/transport-library/buyer-preference?${qs.toString()}`, { token });
}

export function saveBuyerTransportPreference({ sellerId, destState, destCity, preference }, token) {
    return request("/transport-library/buyer-preference", {
        method: "POST",
        body: { sellerId, destState, destCity, preference },
        token,
    });
}

export function fetchBuyerFallbackLocation(token) {
    return request(`/geo/buyer-fallback-location`, { token });
}