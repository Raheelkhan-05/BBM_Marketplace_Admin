// src/utils/rfqQuoteApi.js — seller quote endpoints (see rfq.routes.js)
// If utils/rfqApi.js already has a shared base-URL / fetch helper, point API_BASE at the same value.
const API_BASE = (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function call(token, path, { method = "GET", body, signal } = {}) {
    try {
        const res = await fetch(`${API_BASE}/rfq${path}`, {
            method, signal,
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        return { ...json, success: !!json.success && res.ok, status: res.status };
    } catch (e) {
        if (e?.name === "AbortError") throw e;
        return { success: false, status: 0, message: "Network error. Check your connection and try again." };
    }
}

export const fetchQuoteOptions = (token, enquiryId, signal) => call(token, `/${enquiryId}/quote-options`, { signal });
export const submitQuote = (token, enquiryId, payload) => call(token, `/${enquiryId}/quotes`, { method: "POST", body: payload });
export const withdrawQuote = (token, enquiryId) => call(token, `/${enquiryId}/quotes/withdraw`, { method: "POST" });
export const fetchEnquiryQuotes = (token, enquiryId, signal) => call(token, `/${enquiryId}/quotes`, { signal });