// utils/api.groupBanners.js
// Same BASE convention as api.finance.js. Adjust if your other api files use a shared helper.
const BASE = import.meta.env?.VITE_API_BASE_URL || "";

/* ── public (Home page) → { banners, plan } ── */
export async function fetchGroupBanners({ signal } = {}) {
    try {
        // "no-cache" = always revalidate with the ETag, so admin changes show up immediately but unchanged data costs a 304.
        const res = await fetch(`${BASE}/catalog/group-banners`, { signal, cache: "no-cache" });
        if (!res.ok) return { success: false };
        return await res.json();
    } catch (e) {
        if (e?.name === "AbortError") return { aborted: true };
        return { success: false };
    }
}

// Category / subcategory banners (future use). Returns { banners: { [id]: { [shape]: { image_url, alt_text } } } }
export async function fetchEntityBanners(type, ids = []) {
    try {
        const qs = ids.length ? `?ids=${ids.join(",")}` : "";
        const res = await fetch(`${BASE}/catalog/entity-banners/${type}${qs}`);
        if (!res.ok) return { success: false };
        return await res.json();
    } catch {
        return { success: false };
    }
}

/* ── admin ── */
async function call(token, method, base, path, { body, form, signal } = {}) {
    try {
        const headers = { Authorization: `Bearer ${token}` };
        let payload;
        if (form) payload = form;
        else if (body) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
        const res = await fetch(`${BASE}${base}${path}`, { method, headers, body: payload, signal });
        try { return await res.json(); } catch { return { success: false, message: "Unexpected server response." }; }
    } catch (e) {
        if (e?.name === "AbortError") return { aborted: true };
        return { success: false, message: "Network error. Please check your connection." };
    }
}
const G = "/admin/group-banners";
const E = "/admin/entity-banners";

export const fetchAdminGroupBanners = (token, signal) => call(token, "GET", G, "", { signal });
// form fields: wide | landscape | square | portrait (files), removeShapes, altText, isActive
export const saveGroupBanner = (token, groupId, form) => call(token, "PUT", G, `/${groupId}`, { form });
export const patchGroupBanner = (token, groupId, body) => call(token, "PATCH", G, `/${groupId}`, { body });
export const deleteGroupBanner = (token, groupId) => call(token, "DELETE", G, `/${groupId}`);
export const reorderGroupBanners = (token, groupIds) => call(token, "PUT", G, "/order", { body: { groupIds } });
export const scanGroupsNow = (token) => call(token, "POST", G, "/scan");

// type = "category" | "subcategory"
export const fetchAdminEntityBanners = (token, type) => call(token, "GET", E, `/${type}`);
export const saveEntityBanner = (token, type, id, form) => call(token, "PUT", E, `/${type}/${id}`, { form });
export const patchEntityBanner = (token, type, id, body) => call(token, "PATCH", E, `/${type}/${id}`, { body });
export const deleteEntityBanner = (token, type, id, shape) => call(token, "DELETE", E, `/${type}/${id}${shape ? `/${shape}` : ""}`);