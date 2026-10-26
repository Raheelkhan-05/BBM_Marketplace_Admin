// utils/api.groupBanners.js
// Same BASE convention as api.finance.js. Adjust if your other api files use a shared helper.
const BASE = import.meta.env?.VITE_API_BASE_URL || "";

/* ── public (Home page) ── */
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

/* ── admin ── */
async function call(token, method, path, { body, form, signal } = {}) {
    try {
        const headers = { Authorization: `Bearer ${token}` };
        let payload;
        if (form) payload = form;
        else if (body) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
        const res = await fetch(`${BASE}/admin/group-banners${path}`, { method, headers, body: payload, signal });
        try { return await res.json(); } catch { return { success: false, message: "Unexpected server response." }; }
    } catch (e) {
        if (e?.name === "AbortError") return { aborted: true };
        return { success: false, message: "Network error. Please check your connection." };
    }
}

export const fetchAdminGroupBanners = (token, signal) => call(token, "GET", "", { signal });
export const saveGroupBanner = (token, groupId, form) => call(token, "PUT", `/${groupId}`, { form });
export const patchGroupBanner = (token, groupId, body) => call(token, "PATCH", `/${groupId}`, { body });
export const deleteGroupBanner = (token, groupId) => call(token, "DELETE", `/${groupId}`);
export const reorderGroupBanners = (token, groupIds) => call(token, "PUT", "/order", { body: { groupIds } });
export const scanGroupsNow = (token) => call(token, "POST", "/scan");