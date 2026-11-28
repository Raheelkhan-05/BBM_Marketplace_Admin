// utils/api.adminListings.js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const CHUNK = 25;
const IMG_CHUNK = 150;
const DEL_CHUNK = 150;
const RENEW_CHUNK = 1000;

async function call(path, token, { method = "GET", body, keepalive = false } = {}) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            method, keepalive,
            headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok) return { success: false, status: res.status, code: json?.code, message: json?.message || "Request failed." };
        return json || { success: true };
    } catch {
        return { success: false, message: "Network error. Check your connection and try again." };
    }
}
const B = "/admin/seller-listings";
const q = (gstin) => `?gstin=${encodeURIComponent(gstin)}`;

export const lookupSeller = (token, gstin) => call(`${B}/lookup${q(gstin)}`, token);
export const startSellerSession = (token, gstin) => call(`${B}/session`, token, { method: "POST", body: { gstin } });

export const stageListing = (token, gstin, payload) => call(`${B}/staged`, token, { method: "POST", body: { gstin, payload } });
export const fetchStaged = (token, gstin) => call(`${B}/staged${q(gstin)}`, token);
export const deleteStaged = (token, id) => call(`${B}/staged/${id}`, token, { method: "DELETE" });
export const publishStagedNow = (token, gstin) => call(`${B}/staged/publish`, token, { method: "POST", body: { gstin } });

export const fetchDrafts = (token, gstin) => call(`${B}/drafts${q(gstin)}`, token);
export const patchDraft = (token, id, data, opts) => call(`${B}/drafts/${id}`, token, { method: "PATCH", body: { data }, ...opts });
export const deleteDraft = (token, id) => call(`${B}/drafts/${id}`, token, { method: "DELETE" });
export const clearDrafts = (token, gstin) => call(`${B}/drafts${q(gstin)}`, token, { method: "DELETE" });
export async function saveDrafts(token, { gstin, batchId, fileName, rows }) {
    const items = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await call(`${B}/drafts`, token, { method: "POST", body: { gstin, batchId, fileName, items: rows.slice(i, i + CHUNK) } });
        if (!r?.success) return r;
        items.push(...(r.items || []));
    }
    items.sort((a, b) => a.row_no - b.row_no);
    return { success: true, items };
}

// Kept for compatibility. The admin screens now use bulkDelete("live", ...) so listings are soft-deleted, never erased.
export const deleteListing = (sellerToken, id) => call(`/seller/catalog/submissions/${id}`, sellerToken, { method: "DELETE" });

// Same photos on many products. kind: "live" (seller listings) | "staged" (waiting list) | "drafts" (unfinished bulk upload).
// mode: "add" (keep existing, max 5) | "replace". `items` always holds what was saved so far, even if a later batch failed.
//   live/staged items: { id, images }      drafts items: { id, im }
export async function bulkImages(kind, adminToken, gstin, ids, images, mode = "add", onProgress) {
    const path = { live: "/listings/images", staged: "/staged/images", drafts: "/drafts/images" }[kind];
    const items = [];
    let updated = 0, skipped = 0;
    for (let i = 0; i < ids.length; i += IMG_CHUNK) {
        onProgress?.(i, ids.length);
        const r = await call(`${B}${path}`, adminToken, { method: "POST", body: { gstin, ids: ids.slice(i, i + IMG_CHUNK), images, mode } });
        if (!r?.success) {
            const done = updated ? ` ${updated} product${updated === 1 ? " was" : "s were"} updated before the error.` : "";
            return { success: false, updated, skipped, items, message: `${r?.message || "Could not apply the photos."}${done}` };
        }
        updated += r.updated || 0; skipped += r.skipped || 0;
        items.push(...(r.items || []));
    }
    return { success: true, updated, skipped, items };
}

// Remove many products. kind: "live" (SOFT delete of seller listings) | "staged" (waiting list) | "drafts" (unfinished upload).
// `ids` in the result are the ones actually removed, even if a later batch failed.
export async function bulkDelete(kind, adminToken, gstin, ids, onProgress) {
    const path = { live: "/listings/delete", staged: "/staged/delete", drafts: "/drafts/delete" }[kind];
    const gone = [];
    for (let i = 0; i < ids.length; i += DEL_CHUNK) {
        onProgress?.(i, ids.length);
        const r = await call(`${B}${path}`, adminToken, { method: "POST", body: { gstin, ids: ids.slice(i, i + DEL_CHUNK) } });
        if (!r?.success) {
            const done = gone.length ? ` ${gone.length} product${gone.length === 1 ? " was" : "s were"} removed before the error.` : "";
            return { success: false, deleted: gone.length, ids: gone, message: `${r?.message || "Could not remove the products."}${done}` };
        }
        gone.push(...(r.ids || []));
    }
    onProgress?.(ids.length, ids.length);
    return { success: true, deleted: gone.length, skipped: ids.length - gone.length, ids: gone };
}

// Renew EXPIRED live listings. The server renews them in one database statement.
//   target: { all: true }  -> every expired listing of the seller (one request)
//           { ids: [...] } -> only those listings (1000 per request)
// validityHours: null keeps each listing's own saved validity; a number sets the same validity on all of them.
// `items` always holds what was renewed so far, even if a later request failed:
//   { id, is_active, validity_hours, valid_from, expires_at, expired_at }
export async function bulkRenew(adminToken, gstin, target, validityHours = null) {
    const extra = validityHours != null ? { validityHours } : {};
    const parts = target?.all ? [{ all: true }] : Array.from({ length: Math.ceil((target?.ids?.length || 0) / RENEW_CHUNK) }, (_, i) => ({ ids: target.ids.slice(i * RENEW_CHUNK, (i + 1) * RENEW_CHUNK) }));
    const items = [];
    let renewed = 0, skipped = 0;
    for (const part of parts) {
        const r = await call(`${B}/listings/renew`, adminToken, { method: "POST", body: { gstin, ...part, ...extra } });
        if (!r?.success) {
            if (r?.status === 404) { skipped += part.ids?.length || 0; continue; } // nothing here is expired any more
            const done = renewed ? ` ${renewed} listing${renewed === 1 ? " was" : "s were"} renewed before the error.` : "";
            return { success: false, renewed, skipped, items, message: `${r?.message || "Could not renew the listings."}${done}` };
        }
        renewed += r.renewed || 0; skipped += r.skipped || 0;
        for (const x of r.items || []) items.push({ ...x, is_active: true, valid_from: r.valid_from, expired_at: null });
    }
    if (!renewed && skipped) return { success: false, renewed, skipped, items, message: "None of these listings are expired any more. Refresh the page and try again." };
    return { success: true, renewed, skipped, items };
}

// Set (or clear, parentId = null) the generic product waiting items will be mapped to when they go live.
export async function bulkMapStaged(adminToken, gstin, ids, parentId) {
    const done = [];
    for (let i = 0; i < ids.length; i += DEL_CHUNK) {
        const r = await call(`${B}/staged/map`, adminToken, { method: "POST", body: { gstin, ids: ids.slice(i, i + DEL_CHUNK), parentId } });
        if (!r?.success) return { success: false, updated: done.length, ids: done, message: r?.message || "Could not save the mapping." };
        done.push(...(r.ids || []));
    }
    return { success: true, updated: done.length, skipped: ids.length - done.length, ids: done };
}