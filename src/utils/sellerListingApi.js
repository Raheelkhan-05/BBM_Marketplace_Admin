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