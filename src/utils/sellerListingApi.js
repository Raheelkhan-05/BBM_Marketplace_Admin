// utils/sellerListingApi.js
//
// New endpoints introduced by the seller-listing rework. Kept separate
// from utils/api.js (already 400+ lines) rather than merged in — import
// from both freely, they share the same API_BASE convention. Every
// existing function in utils/api.js (createSellerSubmission,
// updateSellerProductSubmission, createSellerListingForBrand,
// uploadSellerFile, etc.) is unchanged and still used as-is.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function authedJson(path, token, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
    });
    return res.json();
}

export async function fetchCommissionInfo() {
    const res = await fetch(`${API_BASE}/seller/catalog/commission-info`);
    return res.json(); // { success, commissionPercent }
}

// utils/sellerListingApi.js — additions
export async function searchEligibleBuyers(token, q, submissionId) {
    const params = new URLSearchParams({ q });
    if (submissionId) params.set("submissionId", submissionId);
    return authedJson(`/seller/catalog/buyers/search?${params}`, token);
}

export async function fetchListingAccess(token, submissionId) {
    return authedJson(`/seller/catalog/submissions/${submissionId}/access`, token);
}

export async function setListingVisibilityMode(token, submissionId, mode) {
    return authedJson(`/seller/catalog/submissions/${submissionId}/visibility-mode`, token, {
        method: "PATCH", body: JSON.stringify({ mode }),
    });
}

export async function addListingVisibilityBuyer(token, submissionId, buyerId) {
    return authedJson(`/seller/catalog/submissions/${submissionId}/visibility/buyers`, token, {
        method: "POST", body: JSON.stringify({ buyerId }),
    });
}

export async function removeListingVisibilityBuyer(token, submissionId, buyerId) {
    return authedJson(`/seller/catalog/submissions/${submissionId}/visibility/buyers/${buyerId}`, token, { method: "DELETE" });
}

export async function saveCustomPricingForBuyer(token, buyerId, items) {
    return authedJson(`/seller/custom-pricing/${buyerId}`, token, {
        method: "POST", body: JSON.stringify({ items }),
    });
}

export async function deleteCustomPricingForBuyer(token, buyerId, submissionId) {
    return authedJson(`/seller/custom-pricing/${buyerId}/${submissionId}`, token, { method: "DELETE" });
}

export async function fetchSubmissionDetail(token, id) {
    return authedJson(`/seller/catalog/submissions/${id}`, token);
}

// ---- Saved "groups" (Packaging / Delivery / Tax & Legal / Commercial
// Terms / Quality) — the Amazon-style reusable field sets ----

export async function fetchListingTemplates(token, groupType) {
    const qs = groupType ? `?groupType=${encodeURIComponent(groupType)}` : "";
    return authedJson(`/seller/catalog/templates${qs}`, token);
}

export async function fetchDefaultListingTemplates(token) {
    return authedJson(`/seller/catalog/templates/defaults`, token);
}

export async function createListingTemplate(token, { groupType, name, data, isDefault }) {
    return authedJson(`/seller/catalog/templates`, token, {
        method: "POST",
        body: JSON.stringify({ groupType, name, data, isDefault }),
    });
}

export async function updateListingTemplate(token, id, payload) {
    return authedJson(`/seller/catalog/templates/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
    });
}

export async function deleteListingTemplate(token, id) {
    return authedJson(`/seller/catalog/templates/${id}`, token, { method: "DELETE" });
}

export async function fetchApprovedCategories(token, q = "") {
    const params = new URLSearchParams({ q });
    return authedJson(`/seller/catalog/categories?${params}`, token);
}
export async function fetchApprovedSubcategories(token, categoryId, q = "") {
    const params = new URLSearchParams({ categoryId, q });
    return authedJson(`/seller/catalog/subcategories?${params}`, token);
}
export async function fetchApprovedGenericProducts(token, subcategoryId, q = "") {
    const params = new URLSearchParams({ subcategoryId, q });
    return authedJson(`/seller/catalog/generic-products?${params}`, token);
}
export async function createSellerCategoryEntry(token, name) {
    return authedJson(`/seller/catalog/categories`, token, { method: "POST", body: JSON.stringify({ name }) });
}
export async function createSellerSubcategoryEntry(token, name, categoryId) {
    return authedJson(`/seller/catalog/subcategories`, token, { method: "POST", body: JSON.stringify({ name, categoryId }) });
}
export async function createSellerGenericProductEntry(token, name, subcategoryId) {
    return authedJson(`/seller/catalog/generic-products`, token, { method: "POST", body: JSON.stringify({ name, subcategoryId }) });
}

export async function fetchListingPolicyOptions(kind) {
    const res = await fetch(`${API_BASE}/listing-policy-options?kind=${kind}`);
    // console.log(res);

    return res.json();
}

export async function searchBrandNames(token, q = "") {
    return authedJson(`/seller/catalog/brands?q=${encodeURIComponent(q)}`, token);
}

export async function findBrandItemMatch(token, { productName, brandName, brandNotApplicable }) {
    const params = new URLSearchParams({
        productName: productName || "",
        brandNotApplicable: String(Boolean(brandNotApplicable)),
    });
    if (!brandNotApplicable) params.set("brandName", brandName || "");
    return authedJson(`/seller/catalog/brand-item-match?${params}`, token);
}

export async function searchGeoLocations(q) {
    const res = await fetch(`${API_BASE}/geo/search?q=${encodeURIComponent(q)}`);
    return res.json();
}
export async function fetchGeoCities(stateId, q = "") {
    const res = await fetch(`${API_BASE}/geo/cities?stateId=${stateId}&q=${encodeURIComponent(q)}`);
    return res.json();
}
export async function fetchGeoCountries() {
    const res = await fetch(`${API_BASE}/geo/countries`);
    return res.json();
}
export async function fetchGeoStates(countryId, q = "") {
    const res = await fetch(`${API_BASE}/geo/states?countryId=${countryId}&q=${encodeURIComponent(q)}`);
    return res.json();
}
export async function lookupPincode(pincode) {
    const res = await fetch(`${API_BASE}/geo/pincode/${pincode}`);
    return res.json();
}
export async function fetchPincodeLookup(pincode) {
    const res = await fetch(`/api/geo/pincode/${pincode}`);
    return res.json();
}
export async function searchGeoLocationsByType(q, type) {
    const params = new URLSearchParams({ q, ...(type ? { type } : {}) });
    const res = await fetch(`${API_BASE}/geo/search?${params}`);
    return res.json();
}

// REPLACE the existing fetchAllMySubmissions in src/utils/sellerListingApi.js with this block
// (keep authedJson as it is). The old paginated loader stays as the fallback.

const inflightAll = new Map(); // token -> promise: callers that ask at the same moment share one request

// One request for everything (server cached + ETag, so a repeat visit is a tiny 304).
// Falls back to the old paginated loader if the server doesn't have /submissions/all yet.
async function loadAllListings(token) {
    try {
        const res = await authedJson("/seller/catalog/submissions/all", token);
        if (res?.success) return { success: true, items: res.items || [] };
    } catch { /* route missing or network hiccup: use the paged loader */ }
    return loadAllListingsPaged(token);
}

async function loadAllListingsPaged(token) {
    const PAGE_SIZE = 100, MAX_PAGES = 30;
    const url = (p) => `/seller/catalog/submissions?page=${p}&pageSize=${PAGE_SIZE}`;
    const first = await authedJson(url(1), token);
    if (!first?.success) return { success: false, message: first?.message || "Couldn't load listings." };
    const items = [...(first.items || [])];
    const totalPages = Math.min(first.pagination?.totalPages || 1, MAX_PAGES);
    if (totalPages > 1) {
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => authedJson(url(i + 2), token)));
        for (const r of rest) {
            if (!r?.success) return { success: false, message: r?.message || "Couldn't load listings." };
            items.push(...(r.items || []));
        }
    }
    const seen = new Set();
    return { success: true, items: items.filter((it) => (seen.has(it.id) ? false : seen.add(it.id))) };
}

export function fetchAllMySubmissions(token, { onFirstPage } = {}) {
    let run = inflightAll.get(token);
    if (!run) {
        run = loadAllListings(token).finally(() => inflightAll.delete(token));
        inflightAll.set(token, run);
    }
    // onFirstPage and the final result carry the SAME array, so the page doesn't render twice.
    return run.then((res) => { if (res?.success) onFirstPage?.(res.items); return res; });
}

export async function bulkUpdateMarketing(token, { submissionIds, mode, services }) {
    return authedJson(`/seller/catalog/marketing/bulk`, token, {
        method: "PATCH", body: JSON.stringify({ submissionIds, mode, services }),
    });
}

export async function fetchPickerBrands(token, { q = "", limit = 36, offset = 0, signal } = {}) {
    const p = new URLSearchParams({ q, limit, offset });
    return authedJson(`/seller/catalog/picker/brands?${p}`, token, { signal });
}

export async function fetchPickerItems(token, { brand = "", none = false, q = "", limit = 30, offset = 0, signal } = {}) {
    const p = new URLSearchParams({ q, limit, offset });
    if (none) p.set("none", "1"); else p.set("brand", brand);
    return authedJson(`/seller/catalog/picker/items?${p}`, token, { signal });
}

// APPEND to the bottom of src/utils/sellerListingApi.js
// (authedJson and bulkUpdateMarketing are already defined in that file)

const BULK_CHUNK = 100; // ids per request (server accepts up to 200); keeps URLs and payloads small

// Sends a big selection as several requests and merges the results.
// Stops at the first failed request and reports what had already been saved.
async function bulkChunked(path, token, ids, extra) {
    const updated = [], skipped = [];
    let visibilityMode = null;
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        let res = null;
        try {
            res = await authedJson(path, token, {
                method: "PATCH",
                body: JSON.stringify({ ...extra, submissionIds: ids.slice(i, i + BULK_CHUNK) }),
            });
        } catch { res = null; }
        if (!res?.success) {
            return { success: false, partial: updated.length > 0, updated, skipped, visibilityMode, message: res?.message || "Network error. Check your connection and try again." };
        }
        updated.push(...(res.updated || []));
        skipped.push(...(res.skipped || []));
        if (res.visibilityMode) visibilityMode = res.visibilityMode;
    }
    return { success: true, updated, skipped, visibilityMode };
}

// percent > 0 raises prices, percent < 0 lowers them
export const bulkChangePrice = (token, ids, percent) =>
    bulkChunked("/seller/catalog/bulk/price", token, ids, { percent });

export const bulkSetActive = (token, ids, isActive) =>
    bulkChunked("/seller/catalog/bulk/active", token, ids, { isActive });

// payload: { action: "add", buyerIds, discountPercent?, makeRestricted? }
//        | { action: "remove", buyerIds, clearPrice? }
//        | { action: "set_mode", mode: "public" | "restricted" }
export const bulkVisibility = (token, ids, payload) =>
    bulkChunked("/seller/catalog/bulk/visibility", token, ids, payload);

// Same chunking for the existing marketing endpoint.
export async function bulkMarketingChunked(token, { ids, mode, services }) {
    const updated = [], skipped = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        let res = null;
        try { res = await bulkUpdateMarketing(token, { submissionIds: ids.slice(i, i + BULK_CHUNK), mode, services }); } catch { res = null; }
        if (res?.items?.length) updated.push(...res.items);
        if (!res?.success) {
            return { success: false, partial: updated.length > 0, updated, skipped, message: res?.message || "Network error. Check your connection and try again." };
        }
        for (let k = 0; k < (Number(res.skipped) || 0); k++) skipped.push({ id: null, reason: "Listing not found." });
    }
    return { success: true, updated, skipped };
}

/* ---------- product photo requests ---------- */
export const fetchProductImageRequests = (token, submissionId) =>
    authedJson(`/seller/catalog/submissions/${submissionId}/image-requests`, token);

export const createProductImageRequest = (token, submissionId, payload) =>
    authedJson(`/seller/catalog/submissions/${submissionId}/image-requests`, token, { method: "POST", body: JSON.stringify(payload) });

export const cancelProductImageRequest = (token, submissionId, requestId) =>
    authedJson(`/seller/catalog/submissions/${submissionId}/image-requests/${requestId}`, token, { method: "DELETE" });

// admin
export const adminListImageRequests = (token, { status = "pending", limit = 30, offset = 0 } = {}) =>
    authedJson(`/admin/product-image-requests?${new URLSearchParams({ status, limit, offset })}`, token);

export const adminApproveImageRequest = (token, id) =>
    authedJson(`/admin/product-image-requests/${id}/approve`, token, { method: "POST" });

export const adminRejectImageRequest = (token, id, reason) =>
    authedJson(`/admin/product-image-requests/${id}/reject`, token, { method: "POST", body: JSON.stringify({ reason }) });

export const adminImageAuditLog = (token, { brandItemId, requestId, limit = 50, offset = 0 } = {}) => {
    const p = new URLSearchParams({ limit, offset });
    if (brandItemId) p.set("brandItemId", brandItemId);
    if (requestId) p.set("requestId", requestId);
    return authedJson(`/admin/product-image-requests/audit?${p}`, token);
};

export const adminRollbackPreview = (token, brandItemId) =>
    authedJson(`/admin/product-image-requests/rollback-preview?${new URLSearchParams({ brandItemId })}`, token);

export const adminRollbackImages = (token, brandItemId, logId) =>
    authedJson(`/admin/product-image-requests/rollback`, token, { method: "POST", body: JSON.stringify({ brandItemId, logId }) });