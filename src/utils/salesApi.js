import * as api from "./api.js";
const API_BASE = api.API_BASE || import.meta.env?.VITE_API_BASE_URL || "/api";

async function call(path, { token, method = "GET", body, signal, params } = {}) {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null).map(([k, v]) => [k, String(v)])).toString() : "";
    try {
        const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
            method, signal,
            headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = {};
        try { data = await res.json(); } catch { /* non-JSON */ }
        return { ...data, status: res.status, success: res.ok && data?.success !== false };
    } catch (e) {
        if (e?.name === "AbortError") throw e;
        return { success: false, status: 0, message: "Network error. Check your connection." };
    }
}

// salesperson
export const fetchSalesSummary = (token, signal) => call("/sales/summary", { token, signal });
export const fetchSalesCustomers = (token, { q, filter, limit, offset, signal } = {}) =>
    call("/sales/customers", { token, signal, params: { q, filter, limit, offset } });
export const lookupSalesCustomer = (token, gstin) => call("/sales/customers/lookup", { token, method: "POST", body: { gstin } });
export const addSalesCustomer = (token, payload) => call("/sales/customers", { token, method: "POST", body: payload });

// admin (Grow > Customers)
export const fetchCustomersAdmin = (token, { q, filter, limit, offset, sync, assignee, signal } = {}) =>
    call("/seller/customers", { token, signal, params: { q, filter, limit, offset, sync, assignee } });
export const fetchSalespeople = (token) => call("/seller/customers/salespeople", { token });
export const assignCustomerTo = (token, id, salespersonId) =>
    call(`/seller/customers/${id}/assign`, { token, method: "PUT", body: { salespersonId } });