// Salesperson RFQ calls. Swap BASE for whatever salesApi.js uses if it differs.
const BASE = String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

async function call(token, path, { method = "GET", body, signal } = {}) {
    try {
        const res = await fetch(`${BASE}/sales${path}`, {
            method, signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => null);
        return data || { success: false, message: "Unexpected server response." };
    } catch (e) {
        if (e?.name === "AbortError") throw e;
        return { success: false, message: "Network error. Check your connection." };
    }
}

export const fetchSalesEnquiries = (token, { q = "", status = "", mine = false, limit = 12, offset = 0, signal } = {}) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (mine) p.set("mine", "1");
    return call(token, `/enquiries?${p}`, { signal });
};
export const createSalesEnquiry = (token, payload) => call(token, "/enquiries", { method: "POST", body: payload });
export const updateSalesEnquiry = (token, id, payload) => call(token, `/enquiries/${id}`, { method: "PATCH", body: payload });
export const closeSalesEnquiry = (token, id) => call(token, `/enquiries/${id}/close`, { method: "POST", body: {} });