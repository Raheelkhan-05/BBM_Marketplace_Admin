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

// Loads EVERY listing of the seller (the server returns at most 100 per page).
// Page 1 is reported at once through onFirstPage so the screen fills quickly; the rest load in parallel.
export async function fetchAllMySubmissions(token, { onFirstPage } = {}) {
    const PAGE_SIZE = 100, MAX_PAGES = 30;
    const url = (p) => `/seller/catalog/submissions?page=${p}&pageSize=${PAGE_SIZE}`;

    const first = await authedJson(url(1), token);
    if (!first?.success) return { success: false, message: first?.message || "Couldn't load listings." };

    const items = [...(first.items || [])];
    onFirstPage?.(items.slice());

    const totalPages = Math.min(first.pagination?.totalPages || 1, MAX_PAGES);
    if (totalPages > 1) {
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => authedJson(url(i + 2), token)));
        for (const r of rest) {
            if (!r?.success) return { success: false, message: r?.message || "Couldn't load listings." };
            items.push(...(r.items || []));
        }
    }
    // a listing created while we were loading can shift pages: never show the same one twice
    const seen = new Set();
    return { success: true, items: items.filter((it) => (seen.has(it.id) ? false : seen.add(it.id))) };
}

export async function bulkUpdateMarketing(token, { submissionIds, mode, services }) {
    return authedJson(`/seller/catalog/marketing/bulk`, token, {
        method: "PATCH", body: JSON.stringify({ submissionIds, mode, services }),
    });
}