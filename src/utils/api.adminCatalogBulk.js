// utils/api.adminCatalogBulk.js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

// Maps many catalog brand items to one generic product in a single request.
// Used by components/admin/BulkMapModal.jsx
export async function adminBulkMapBrandItems(token, brandItemIds, parentId) {
    try {
        const res = await fetch(`${API_BASE}/admin/catalog-bulk/map-brand-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: brandItemIds, parentId }),
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok) return { success: false, status: res.status, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}


const B = "/admin/catalog-bulk";
const CHUNK = 25;
const IMG_CHUNK = 150;
const DEL_CHUNK = 150;
const AI_CHUNK = 150;
const UPLOAD_FOLDER = "catalog";

async function call(path, token, { method = "GET", body, keepalive = false } = {}) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method, keepalive,
            headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok) return { success: false, status: res.status, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}

export const fetchCatalogBulkMeta = (token) => call(`${B}/meta`, token);

// rows: [{ n, b }] (max 200). Returns items[i] = { dup } (is this name + brand already in the catalog?).
// The old category fields and the `similar` option are no longer used.
export const checkCatalogRows = (token, rows, similar = false) => call(`${B}/check`, token, { method: "POST", body: { rows, similar } });

export const fetchCatalogDrafts = (token) => call(`${B}/drafts`, token);
export const patchCatalogDraft = (token, id, data, opts) => call(`${B}/drafts/${id}`, token, { method: "PATCH", body: { data }, ...opts });
export const deleteCatalogDraft = (token, id) => call(`${B}/drafts/${id}`, token, { method: "DELETE" });
export const clearCatalogDrafts = (token) => call(`${B}/drafts`, token, { method: "DELETE" });

export async function saveCatalogDrafts(token, { batchId, fileName, rows }) {
    const items = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await call(`${B}/drafts`, token, { method: "POST", body: { batchId, fileName, items: rows.slice(i, i + CHUNK) } });
        if (!r?.success) return r;
        items.push(...(r.items || []));
    }
    items.sort((a, b) => a.row_no - b.row_no);
    return { success: true, items };
}

// Same photos on many drafts. items = [{ id, im }] holds what was saved so far, even if a later batch failed.
export async function bulkCatalogDraftImages(token, ids, images, mode = "add", onProgress) {
    const items = [];
    let updated = 0, skipped = 0;
    for (let i = 0; i < ids.length; i += IMG_CHUNK) {
        onProgress?.(i, ids.length);
        const r = await call(`${B}/drafts/images`, token, { method: "POST", body: { ids: ids.slice(i, i + IMG_CHUNK), images, mode } });
        if (!r?.success) {
            const done = updated ? ` ${updated} product${updated === 1 ? " was" : "s were"} updated before the error.` : "";
            return { success: false, updated, skipped, items, message: `${r?.message || "Could not apply the photos."}${done}` };
        }
        updated += r.updated || 0; skipped += r.skipped || 0;
        items.push(...(r.items || []));
    }
    return { success: true, updated, skipped, items };
}

// Remove many drafts. `ids` in the result are the ones actually removed, even if a later batch failed.
export async function bulkCatalogDraftDelete(token, ids, onProgress) {
    const gone = [];
    for (let i = 0; i < ids.length; i += DEL_CHUNK) {
        onProgress?.(i, ids.length);
        const r = await call(`${B}/drafts/delete`, token, { method: "POST", body: { ids: ids.slice(i, i + DEL_CHUNK) } });
        if (!r?.success) {
            const done = gone.length ? ` ${gone.length} product${gone.length === 1 ? " was" : "s were"} removed before the error.` : "";
            return { success: false, deleted: gone.length, ids: gone, message: `${r?.message || "Could not remove the products."}${done}` };
        }
        gone.push(...(r.ids || []));
    }
    onProgress?.(ids.length, ids.length);
    return { success: true, deleted: gone.length, skipped: ids.length - gone.length, ids: gone };
}

// ids: max 50 per call. Server adds the products and removes the finished drafts.
export const submitCatalogDrafts = (token, ids) => call(`${B}/drafts/submit`, token, { method: "POST", body: { ids } });

/* ---------------------------------- AI product images (background queue) ---------------------------------- */

// Queues many products. Sent in batches; { queued, skipped } are totals. Safe to close the page afterwards.
export async function enqueueCatalogImages(token, ids, { useReference = true } = {}) {
    let queued = 0, skipped = 0;
    for (let i = 0; i < ids.length; i += AI_CHUNK) {
        const r = await call(`${B}/ai-images/enqueue`, token, { method: "POST", body: { ids: ids.slice(i, i + AI_CHUNK), useReference } });
        if (!r?.success) {
            const done = queued ? ` ${queued} product${queued === 1 ? " was" : "s were"} already queued.` : "";
            return { success: false, queued, skipped, message: `${r?.message || "Could not start image generation."}${done}` };
        }
        queued += r.queued || 0; skipped += r.skipped || 0;
    }
    return { success: true, queued, skipped };
}
export const fetchCatalogImageJobs = (token) => call(`${B}/ai-images/jobs`, token);
export const ackCatalogImages = (token, ids) => call(`${B}/ai-images/ack`, token, { method: "POST", body: { ids } });
// { ids } stop these (and with failed:true also clear their failed state) | { all:true } stop everything
// | { all:true, failed:true, active:false } clear every failed one only
export const cancelCatalogImages = (token, opts = {}) => call(`${B}/ai-images/cancel`, token, { method: "POST", body: opts });

// Image upload for admins. Always resolves to { success, url?, message? }.
// Calls POST /admin/catalog/upload (multer field "file") directly, so no other import is needed.
export async function uploadCatalogImage(token, file) {
    try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", UPLOAD_FOLDER); // ignored by the server if it does not use it

        // No Content-Type header: the browser sets the multipart boundary itself.
        const res = await fetch(`${API_BASE}/admin/catalog/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });

        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }

        if (!res.ok) {
            return { success: false, status: res.status, message: json?.message || `Upload failed (${res.status}). Please try again.` };
        }

        const url = json?.url || json?.imageUrl || json?.image || json?.data?.url || json?.data?.imageUrl || null;
        return json?.success !== false && url
            ? { success: true, url }
            : { success: false, message: json?.message || "Upload finished but no image link came back." };
    } catch (e) {
        console.error("[uploadCatalogImage]", e);
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}