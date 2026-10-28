// utils/api.aiBanners.js
const BASE = import.meta.env?.VITE_API_BASE_URL || "";

async function call(token, method, path, body) {
    try {
        const headers = { Authorization: `Bearer ${token}` };
        if (body) headers["Content-Type"] = "application/json";
        const res = await fetch(`${BASE}/admin/ai-banners${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        try { return await res.json(); } catch { return { success: false, message: "Unexpected server response." }; }
    } catch {
        return { success: false, message: "Network error. Please check your connection." };
    }
}

export const fetchAiOverview = (token) => call(token, "GET", "");
// payload: { scope: "group"|"category"|"subcategory"|"all", publish } or { items: [{type,id,name,force}], publish }
export const enqueueAiBanners = (token, payload) => call(token, "POST", "/jobs", payload);
export const cancelAiBanners = (token) => call(token, "POST", "/cancel");