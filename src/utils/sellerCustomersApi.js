// Same base as rfqApi.js (BASE already includes /api there).
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function call(token, prefix, path, { method = "GET", body, signal } = {}) {
    try {
        const res = await fetch(`${BASE}${prefix}${path}`, {
            method, signal,
            headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        return { ...data, success: res.ok && data.success !== false, status: res.status };
    } catch (e) {
        if (e?.name === "AbortError") throw e;
        return { success: false, message: "Network error. Please try again." };
    }
}
const cust = (token, path, opts) => call(token, "/seller/customers", path, opts);
const cred = (token, path, opts) => call(token, "/credit", path, opts); // existing credit routes, reused as-is

const qs = (o) => {
    const p = new URLSearchParams();
    Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
    const s = p.toString();
    return s ? `?${s}` : "";
};

// ---- customers -------------------------------------------------------------
export const fetchCustomers = (token, { q, filter, limit, offset, sync, signal }) => cust(token, qs({ q, filter, limit, offset, sync }), { signal });
export const lookupCustomer = (token, gstin, signal) => cust(token, "/lookup", { method: "POST", body: { gstin }, signal });
export const addCustomer = (token, gstin) => cust(token, "", { method: "POST", body: { gstin } });
export const bulkAddCustomers = (token, gstins) => cust(token, "/bulk", { method: "POST", body: { gstins } });
export const markCustomerInvited = (token, id) => cust(token, `/${id}/invite`, { method: "POST" });
export const removeCustomer = (token, id) => cust(token, `/${id}`, { method: "DELETE" });

// ---- credit (same endpoints the old Credit page used) -----------------------
// Seller approves a buyer's pending request with a limit.
export const approveCredit = (token, creditId, creditLimit) =>
    cred(token, `/${creditId}/decide`, { method: "POST", body: { decision: "approved", creditLimit } });
export const declineCredit = (token, creditId) =>
    cred(token, `/${creditId}/decide`, { method: "POST", body: { decision: "rejected" } });
// Seller gives credit with no request (also undoes a decline / turn-off with a fresh limit).
export const grantCredit = (token, buyerId, creditLimit) =>
    cred(token, "/grant", { method: "POST", body: { buyerId, creditLimit } });
// Change the limit but KEEP this month's usage (resetUsed:false).
export const changeCreditLimit = (token, creditId, newLimit) =>
    cred(token, `/${creditId}/update-limit`, { method: "POST", body: { newLimit, resetUsed: false } });
export const declineLimitIncrease = (token, creditId) =>
    cred(token, `/${creditId}/decline-increase`, { method: "POST", body: {} });
export const setCreditEnabled = (token, buyerId, enabled) =>
    cred(token, "/toggle", { method: "POST", body: { buyerId, enabled } });

// Share (or copy) an invite message. Resolves "shared" | "copied" | "cancelled" | "failed".
export async function shareInvite({ shopName, slug, customerName }) {
    const url = slug ? `${window.location.origin}/shop/${slug}` : window.location.origin;
    const text = `${customerName ? `Hi ${customerName}, ` : ""}${shopName || "We"} invite${shopName ? "s" : ""} you to order on BBM Marketplace. Join here: ${url}`;
    if (navigator.share) {
        try { await navigator.share({ title: "Join BBM Marketplace", text, url }); return "shared"; }
        catch (e) { if (e?.name === "AbortError") return "cancelled"; }
    }
    try { await navigator.clipboard.writeText(text); return "copied"; }
    catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand("copy"); ta.remove();
            return ok ? "copied" : "failed";
        } catch { return "failed"; }
    }
}