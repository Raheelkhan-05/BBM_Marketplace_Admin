// utils/api.imageStudio.js
export const API_BASE = import.meta.env?.VITE_API_BASE_URL || "";
const ROOT = `${API_BASE}/admin/image-studio`;

async function call(token, method, path, body) {
    try {
        const headers = { Authorization: `Bearer ${token}` };
        if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
        const res = await fetch(`${ROOT}${path}`, {
            method, headers,
            body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
        });
        try { return await res.json(); } catch { return { success: false, message: "Unexpected server response." }; }
    } catch {
        return { success: false, message: "Network error. Please check your connection." };
    }
}

export const proxyUrlFor = (url) => `${ROOT}/proxy?url=${encodeURIComponent(url)}`;

export const fetchStudioProducts = (token, { q = "", filter = "todo", page = 1, pageSize = 24 } = {}) =>
    call(token, "GET", `/products?${new URLSearchParams({ q, filter, page, pageSize })}`);
export const planStudioBatch = (token, brandItemIds, options) => call(token, "POST", "/plan", { brandItemIds, options });
export const uploadCutout = (token, assetId, blob) => {
    const fd = new FormData();
    fd.append("file", blob, "cutout.png");
    return call(token, "POST", `/assets/${assetId}/process`, fd);
};
export const failStudioAsset = (token, assetId, error) => call(token, "POST", `/assets/${assetId}/fail`, { error });
export const retryStudioItem = (token, itemId) => call(token, "POST", `/items/${itemId}/retry`);
export const applyStudioItems = (token, itemIds, allOrNothing) => call(token, "POST", "/apply", { itemIds, allOrNothing });
export const revertStudioItem = (token, itemId) => call(token, "POST", `/items/${itemId}/revert`);
export const discardStudioBatch = (token, batchId) => call(token, "DELETE", `/batches/${batchId}`);