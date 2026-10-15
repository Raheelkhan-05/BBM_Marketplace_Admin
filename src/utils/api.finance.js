// utils/api.finance.js
// NOTE: if your other api.*.js files use a shared base-URL/fetch helper, swap `BASE` + `request` for it.
const BASE = import.meta.env?.VITE_API_BASE_URL || "";

function qs(params = {}) {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : "";
}

async function request(token, path, params, signal) {
    try {
        const res = await fetch(`${BASE}/admin/finance${path}${qs(params)}`, {
            headers: { Authorization: `Bearer ${token}` }, signal,
        });
        return { res };
    } catch (e) {
        if (e?.name === "AbortError") return { aborted: true };
        return { error: "Network error. Please check your connection." };
    }
}

async function json(token, path, params, signal) {
    const r = await request(token, path, params, signal);
    if (r.aborted) return { aborted: true };
    if (r.error) return { success: false, message: r.error };
    try { return await r.res.json(); } catch { return { success: false, message: "Unexpected server response." }; }
}

export const fetchFinanceOverview = (token, params, signal) => json(token, "/overview", params, signal);
export const fetchFinanceTransactions = (token, params, signal) => json(token, "/transactions", params, signal);
export const fetchFinanceTransactionDetail = (token, kind, id) => json(token, `/transactions/${kind}/${id}`);
export const fetchPendingPayouts = (token) => json(token, "/pending-payouts");
export const fetchFinanceHealth = (token) => json(token, "/health");

// Returns { blob, filename } or { success:false, message }
export async function downloadFinanceCsv(token, params) {
    const r = await request(token, "/export.csv", params);
    if (r.error) return { success: false, message: r.error };
    if (!r.res.ok) {
        try { return await r.res.json(); } catch { return { success: false, message: "Export failed." }; }
    }
    const name = /filename="([^"]+)"/.exec(r.res.headers.get("Content-Disposition") || "")?.[1] || "transactions.csv";
    return { success: true, blob: await r.res.blob(), filename: name };
}