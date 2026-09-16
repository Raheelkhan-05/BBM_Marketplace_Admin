// utils/api.js
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function request(path, token, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    // network failure — keep the shape consistent so callers can just check `.success`
    return { success: false, message: "Couldn't reach the server. Check your connection." };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    // still return the server's own message/code if it sent one, don't swallow it
    return body && typeof body === "object" ? { success: false, ...body } : { success: false, message: `Request failed (${res.status}).` };
  }
  return body;
}

export function apiGet(path, token) {
  return request(path, token, { method: "GET" });
}
export function apiPost(path, token, body) {
  return request(path, token, { method: "POST", body: body != null ? JSON.stringify(body) : undefined });
}
export function apiPatch(path, token, body) {
  return request(path, token, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined });
}
export function apiDelete(path, token) {
  return request(path, token, { method: "DELETE" });
}

export async function requestOtp(identifier) {
  const res = await fetch(`${API_BASE}/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  return res.json();
}

export async function verifyOtp(identifier, otp) {
  const res = await fetch(`${API_BASE}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, otp }),
  });
  return res.json();
}

export async function fetchMe(token) {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    // console.log("fetch me data : ", data);
    return { ...data, status: res.status, success: res.ok && data?.success !== false };
  } catch (e) {
    return { success: false, status: 0, message: "Network error." };
  }
}

export async function lookupGstin(token, gstin) {
  const res = await fetch(`${API_BASE}/auth/gst-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gstin }),
  });
  return res.json();
}

export async function completeProfile(token, payload) {
  const res = await fetch(`${API_BASE}/auth/complete-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function requestContactOtp(token, field, value) {
  const res = await fetch(`${API_BASE}/auth/contact/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ field, value }),
  });
  return res.json();
}

export async function verifyContactOtp(token, field, value, otp) {
  const res = await fetch(`${API_BASE}/auth/contact/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ field, value, otp }),
  });
  return res.json();
}

export async function saveProgress(token, payload) {
  const res = await fetch(`${API_BASE}/auth/save-progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchSellerOnboarding(token) {
  const res = await fetch(`${API_BASE}/seller/onboarding`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function saveSellerProgress(token, payload) {
  const res = await fetch(`${API_BASE}/seller/onboarding/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function requestSellerWhatsappOtp(token, whatsapp_number) {
  const res = await fetch(`${API_BASE}/seller/onboarding/whatsapp/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ whatsapp_number }),
  });
  return res.json();
}

export async function verifySellerWhatsappOtp(token, whatsapp_number, otp) {
  const res = await fetch(`${API_BASE}/seller/onboarding/whatsapp/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ whatsapp_number, otp }),
  });
  return res.json();
}

export async function submitSellerOnboarding(token, payload) {
  const res = await fetch(`${API_BASE}/seller/onboarding/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchSellerOrderTransportOptions(token) {
  const res = await fetch(`${API_BASE}/seller/orders/transport-options`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function fetchSellerTransportOptions(submissionId) {
  const res = await fetch(`${API_BASE}/orders/transport-options?submissionId=${submissionId}`);
  return res.json();
}

export async function confirmSellerOrderWithTransport(token, orderId, formData) {
  // NOTE: no "Content-Type" header — the browser sets the multipart
  // boundary itself when the body is a FormData instance.
  const res = await fetch(`${API_BASE}/seller/orders/${orderId}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return res.json();
}

export async function fetchSellerOwnTransportOptions(token) {
  const res = await fetch(`${API_BASE}/seller/orders/transport-options`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function fetchSellerBankDetails(token) {
  const res = await fetch(`${API_BASE}/seller/bank-details`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function saveSellerBankDetails(token, payload) {
  const res = await fetch(`${API_BASE}/seller/bank-details`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchBusinessProfile(token) {
  const res = await fetch(`${API_BASE}/buyer/business-profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function getAnonUploadId() {
  let id = localStorage.getItem("bbm_anon_upload_id");
  if (!id) {
    id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("bbm_anon_upload_id", id);
  }
  return id;
}

export async function uploadSellerFile(token, file, folder, bucket = "seller-assets") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  form.append("bucket", bucket);

  if (!token) {
    form.append("anonId", getAnonUploadId());
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const res = await fetch(`${API_BASE}/seller/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  return res.json();
}

export async function adminListSellers(token, status = "pending_review", q = "") {
  const params = new URLSearchParams({ status, ...(q ? { q } : {}) });
  const res = await fetch(`${API_BASE}/admin/sellers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminGetSeller(token, id) {
  const res = await fetch(`${API_BASE}/admin/sellers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminUpdateSeller(token, id, payload) {
  const res = await fetch(`${API_BASE}/admin/sellers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}
export async function adminApproveSeller(token, id) {
  const res = await fetch(`${API_BASE}/admin/sellers/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminRejectSeller(token, id, reason) {
  const res = await fetch(`${API_BASE}/admin/sellers/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  return res.json();
}
export async function fetchShopBySlug(slug) {
  const res = await fetch(`${API_BASE}/shop/${slug}`);
  return res.json();
}
export async function fetchNotifications(token) {
  const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function markNotificationRead(token, id) {
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminSearchUsers(token, q) {
  const res = await fetch(`${API_BASE}/admin/users/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminPromoteUser(token, userId) {
  const res = await fetch(`${API_BASE}/admin/admins/promote`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId }),
  });
  return res.json();
}

export async function fetchSellerDashboard(token) {
  const res = await fetch(`${API_BASE}/seller/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function updateSellerProfile(token, payload) {
  const res = await fetch(`${API_BASE}/seller/profile`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function updateSellerTheme(token, payload) {
  const res = await fetch(`${API_BASE}/seller/theme`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function addSellerPhoto(token, category, url) {
  const res = await fetch(`${API_BASE}/seller/photos`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ category, url }),
  });
  return res.json();
}
export async function deleteSellerPhoto(token, id) {
  const res = await fetch(`${API_BASE}/seller/photos/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function addSellerCertification(token, payload) {
  const res = await fetch(`${API_BASE}/seller/certifications`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function deleteSellerCertification(token, id) {
  const res = await fetch(`${API_BASE}/seller/certifications/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function fetchSellerProducts(token) {
  const res = await fetch(`${API_BASE}/seller/products`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function createSellerProduct(token, payload) {
  const res = await fetch(`${API_BASE}/seller/products`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function updateSellerProduct(token, id, payload) {
  const res = await fetch(`${API_BASE}/seller/products/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function deleteSellerProduct(token, id) {
  const res = await fetch(`${API_BASE}/seller/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function searchShops(query, limit = 8) {
  const params = new URLSearchParams({ q: query, limit });
  const res = await fetch(`${API_BASE}/shop/search?${params}`);
  return res.json();
}

async function get(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const res = await fetch(`${API_BASE}${path}?${query}`);
  return res.json();
}

export async function searchCategories(q = "", limit = 20) {
  return get("/search/categories", { q, limit });
}

export async function searchSubcategories(categoryId, q = "", limit = 30) {
  return get("/search/subcategories", { categoryId, q, limit });
}

export async function searchProductsInSubcategory(subcategoryId, q = "", limit = 30) {
  return get("/search/products", { subcategoryId, q, limit });
}

export async function searchBrandsForProduct(productId, q = "", limit = 30) {
  return get("/search/brands", { productId, q, limit });
}

export async function searchSellersForProduct(productId, q = "", limit = 30, brandId) {
  return get("/search/sellers", { productId, brandId, q, limit });
}

// Single convenience call used by useHierarchySearch — avoids branching
// on which of the four functions above to call.
export async function searchHierarchyLevel(level, parentId, q = "", limit = 30, productId) {
  const params = { level, q, limit };
  if (level === "subcategory") params.categoryId = parentId;
  if (level === "product") params.subcategoryId = parentId;
  if (level === "brand") params.productId = parentId;
  if (level === "seller") {
    // parentId here is the brand id; productId comes separately from the
    // hook, since sellers are filtered by product (required) + brand (optional).
    params.productId = productId;
    params.brandId = parentId;
  }
  return get("/search/hierarchy", params);
}

// Cross-level search — searches categories + subcategories + products at
// once. Used as a fallback when a scoped search at the current level is
// empty, so e.g. typing a product name while browsing a different category
// still finds it and can jump straight there.
export async function searchSmart(q, limit = 5) {
  return get("/search/smart", { q, limit });
}

// Last-resort AI classification — called automatically by
// useHierarchySearch once scoped + smart search both come up empty.
export async function resolveWithAI({ query, level, parentId }) {
  const res = await fetch(`${API_BASE}/search/ai-resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, level, parentId }),
  });
  return res.json();
}

// Image search — identifies the product in a photo AND resolves it
// server-side (embedding cascade against existing products/subcategories/
// categories, falling back to AI creation). Returns a ready-to-display
// breadcrumb stack, not just a raw search term.
// imageBase64 has no "data:" prefix (use resizeImageForSearch first).
export async function searchByImage(imageBase64, mimeType) {
  const res = await fetch(`${API_BASE}/search/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  return res.json();
}

export async function fetchImageStatuses(pendingImages) {
  const ids = pendingImages.map((p) => `${p.level}:${p.id}`).join(",");
  return get("/search/image-status", { ids });
}

// Fast pure-DB typeahead suggestions — no AI. Accepts an AbortSignal so
// the caller can truly cancel an in-flight request (not just ignore its
// response), which keeps rapid typing feeling instant.
export async function fetchAutocomplete(q, limit = 8, signal) {
  const params = new URLSearchParams({ q, limit });
  const res = await fetch(`${API_BASE}/catalog-search/autocomplete?${params}`, { signal });
  return res.json();
}

export async function fetchProductSearchMerged(q, { limit = 20, offset = 0, categoryId, signal } = {}) {
  const params = new URLSearchParams({ q, limit, offset });
  if (categoryId) params.set("categoryId", categoryId);
  const res = await fetch(`${API_BASE}/catalog-search/products-merged?${params}`, { signal });
  return res.json();
}

export async function fetchProductDetail(id) {
  const res = await fetch(`${API_BASE}/search/products/${id}`);
  return res.json();
}

export async function fetchCategoryLanding(idOrSlug) {
  const res = await fetch(`${API_BASE}/catalog/category/${idOrSlug}`);
  return res.json();
}

export async function fetchSubcategoryLanding(idOrSlug) {
  const res = await fetch(`${API_BASE}/catalog/subcategory/${idOrSlug}`);
  return res.json();
}

export async function adminGetCatalogEntry(token, level, id) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminApproveCatalogEntry(token, level, id, corrections) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/${id}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corrections || {}),
  });
  return res.json();
}
export async function adminRejectCatalogEntry(token, level, id, reason) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/${id}/reject`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason }),
  });
  return res.json();
}
export async function adminGetCatalogOptions(token, level, parentId, q = "", scope = "scoped") {
  const params = new URLSearchParams({ level, ...(parentId ? { parentId } : {}), ...(q ? { q } : {}), scope });
  const res = await fetch(`${API_BASE}/admin/catalog/options?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminCreateCatalogOption(token, level, name, parentId) {
  const res = await fetch(`${API_BASE}/admin/catalog/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ level, name, parentId }),
  });
  return res.json();
}

export async function adminGetPickerOptions(token, pickerLevel, parentId, q = "") {
  const params = new URLSearchParams({ pickerLevel, ...(parentId ? { parentId } : {}), ...(q ? { q } : {}) });
  const res = await fetch(`${API_BASE}/admin/catalog/options?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminCreatePickerOption(token, pickerLevel, name, parentId) {
  const res = await fetch(`${API_BASE}/admin/catalog/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pickerLevel, name, parentId }),
  });
  return res.json();
}

export async function adminUpdateCatalogEntry(token, level, id, payload) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function adminSearchCatalogEverywhere(token, q) {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/admin/catalog/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function adminListUnmappedCatalog(token, level, q = "") {
  const params = new URLSearchParams({ level, ...(q ? { q } : {}) });
  const res = await fetch(`${API_BASE}/admin/catalog/unmapped?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function adminGetUnmappedCounts(token) {
  const res = await fetch(`${API_BASE}/admin/catalog/unmapped/counts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// utils/api.js — additions
export async function uploadCatalogFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  console.log("Uploading File...");
  const res = await fetch(`${API_BASE}/catalogs/import`, { method: "POST", body: formData });
  console.log("Done File... ", res);
  return res.json(); // { success, jobId }
}

export async function fetchImportStatus(jobId, signal) {
  const res = await fetch(`${API_BASE}/catalogs/import/${jobId}/status`, { signal });
  return res.json(); // { status: 'processing'|'done'|'failed', progress, landing, summary }
}

export async function fetchBrandDetail(idOrSlug) {
  const res = await fetch(`${API_BASE}/catalog/brand/${idOrSlug}`);
  return res.json();
}

// frontend fetch helper (place alongside your other search fetch functions)
export async function fetchBrandFamily(brandName, { limit } = {}) {
  const params = new URLSearchParams({ brandName });
  if (limit) params.set("limit", limit);

  const res = await fetch(`${API_BASE}/search/brand-family?${params.toString()}`);
  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || "Failed to fetch brand family.");
  }

  return data; // { brandName, totalMatches, totalProducts, categories }
}

// Append these to your existing utils/api.js — they follow the exact same
// fetch/JSON pattern as the functions already in that file.

// ---- seller self-publish: access + pickers ----

export async function fetchSellerAccessStatus(token) {
  const res = await fetch(`${API_BASE}/seller/catalog/access-status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.json();
}

export async function fetchApprovedCategories(q = "") {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/seller/catalog/categories?${params}`);
  return res.json();
}

export async function fetchApprovedSubcategories(categoryId, q = "") {
  const params = new URLSearchParams({ categoryId, q });
  const res = await fetch(`${API_BASE}/seller/catalog/subcategories?${params}`);
  return res.json();
}


// ---- seller self-publish: listing CRUD ---
export async function adminUploadCatalogImage(token, file, folder) {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const res = await fetch(`${API_BASE}/admin/catalog/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

export async function fetchApprovedGenericProducts(subcategoryId, q = "") {
  const params = new URLSearchParams({ subcategoryId, q });
  const res = await fetch(`${API_BASE}/seller/catalog/generic-products?${params}`);
  return res.json();
}

export async function createSellerSubmission(token, payload) {
  const res = await fetch(`${API_BASE}/seller/catalog/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchMySellerSubmissions(token, status) {
  const params = new URLSearchParams(status ? { status } : {});
  const res = await fetch(`${API_BASE}/seller/catalog/submissions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log("fetchMySellerSubmissions", data);
  return data;
}

export async function fetchSellerSubmissionDetail(token, id) {
  const res = await fetch(`${API_BASE}/seller/catalog/submissions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function adminListSellerSubmissions(token, status = "pending_review", q = "") {
  const params = new URLSearchParams({ status, ...(q ? { q } : {}) });
  const res = await fetch(`${API_BASE}/admin/seller-submissions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminGetSellerSubmission(token, id) {
  const res = await fetch(`${API_BASE}/admin/seller-submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminUpdateSellerSubmission(token, id, payload) {
  const res = await fetch(`${API_BASE}/admin/seller-submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function adminApproveSellerSubmission(token, id) {
  const res = await fetch(`${API_BASE}/admin/seller-submissions/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function adminRejectSellerSubmission(token, id, reason) {
  const res = await fetch(`${API_BASE}/admin/seller-submissions/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  return res.json();
}

// Now accepts a free-text q for the search box, and returns BOTH
// approved and pending_review entries — admin needs to see items a
// seller already proposed so they select the existing one instead of
// creating a near-duplicate.
export async function adminListCatalog(token, { level, parentId, q = "" }) {
  const params = new URLSearchParams({ level, ...(parentId ? { parentId } : {}), ...(q ? { q } : {}) });
  const res = await fetch(`${API_BASE}/admin/catalog?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Dedupe-aware create — mirrors the seller-side create endpoints.
// If a matching name already exists (approved or pending) under the
// same parent, the backend returns that entry instead of making a new
// one, exactly like HierarchyCombobox expects: {success, duplicate, entry, message}.
export async function adminCreateCatalogEntry(token, level, { name, parentId }) {
  const res = await fetch(`${API_BASE}/admin/catalog`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ level, name, parentId }),
  });
  return res.json();
}
export async function adminDeleteCatalogEntry(token, level, id) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function adminDownloadCatalogTemplate(token, level) {
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/excel-template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Couldn't download the template.");
  return res.blob();
}

export async function adminBulkUploadCatalog(token, level, file, parentId) {
  const form = new FormData();
  form.append("file", file);
  if (parentId) form.append("parentId", parentId);
  const res = await fetch(`${API_BASE}/admin/catalog/${level}/excel-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

// ---- New admin-approved catalog hierarchy search ----
// Category -> Subcategory -> Generic Product -> Brand Item -> Sellers.
// Entirely separate endpoint namespace from the AI-resolver hierarchy
// search above — existing functions are untouched.
const CATALOG_SEARCH_BASE = `${API_BASE}/catalog-search`;

async function getV2(path, params = {}, token) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await fetch(`${CATALOG_SEARCH_BASE}${path}?${query}`, { headers });
  return res.json();
}

export async function searchCatalogSellers(brandItemId, q = "", limit = 30, offset = 0, token) {
  return getV2("/sellers", { brandItemId, q, limit, offset }, token);
}

export async function searchCatalogCategories(q = "", limit = 20, offset = 0) {
  return getV2("/categories", { q, limit, offset });
}
export async function searchCatalogSubcategories(categoryId, q = "", limit = 20, offset = 0) {
  return getV2("/subcategories", { categoryId, q, limit, offset });
}
export async function searchCatalogGenericProducts(subcategoryId, q = "", limit = 30, offset = 0) {
  return getV2("/generic-products", { subcategoryId, q, limit, offset });
}
export async function searchCatalogBrandItems(genericProductId, q = "", limit = 30, offset = 0) {
  return getV2("/brand-items", { genericProductId, q, limit, offset });
}

export async function searchCatalogHierarchyLevel(level, parentId, q = "", limit = 20, offset = 0) {
  const params = { level, q, limit, offset };
  if (parentId) params.parentId = parentId;
  return getV2("/hierarchy", params);
}

export async function searchCatalogSmart(q, limit = 5) {
  return getV2("/smart", { q, limit });
}

export async function fetchCatalogAutocomplete(q, limit = 8, signal) {
  const params = new URLSearchParams({ q, limit });
  const res = await fetch(`${CATALOG_SEARCH_BASE}/autocomplete?${params}`, { signal });
  return res.json();
}

export async function updateSellerProductSubmission(token, id, payload) {
  const res = await fetch(`${API_BASE}/seller/catalog/submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteSellerProductSubmission(token, id) {
  const res = await fetch(`${API_BASE}/seller/catalog/submissions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // console.log(res);

  return res.json();
}

export async function createSellerListingForBrand(token, payload) {
  const res = await fetch(`${API_BASE}/seller/catalog/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// utils/api.js
export async function createListingForExistingBrand(token, payload) {
  const res = await fetch(`${API_BASE}/seller/catalog/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ---- Checkout / Orders ----
export async function fetchCheckoutStatus(token) {
  const res = await fetch(`${API_BASE}/orders/checkout-status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return res.json();
}
export async function fetchOrderQuote(submissionId, quantity, opts = {}) {
  const { purchaseBasis = "per_pack", orderType = "standard", addressId } = opts;
  const params = new URLSearchParams({
    submissionId,
    quantity,
    purchaseBasis,
    orderType,
    ...(addressId ? { addressId } : {}),
  });
  const res = await fetch(`${API_BASE}/orders/quote?${params}`);
  return res.json();
}
export async function placeOrder(token, payload) {
  const res = await fetch(`${API_BASE}/orders`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function fetchMyOrders(token, status, orderType) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (orderType) params.set("orderType", orderType);
  const res = await fetch(`${API_BASE}/orders?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function cancelMyOrder(token, id, reason) {
  const res = await fetch(`${API_BASE}/orders/${id}/cancel`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason }),
  });
  return res.json();
}

export async function fetchOrderConstraints(submissionId) {
  const params = new URLSearchParams({ submissionId });
  const res = await fetch(`${API_BASE}/orders/order-constraints?${params}`);
  return res.json();
}

// ---- Seller order management ----
export async function fetchSellerOrders(token, status, orderType) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (orderType) params.set("orderType", orderType);
  const res = await fetch(`${API_BASE}/seller/orders?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
function sellerOrderAction(action) {
  return async (token, id, reason) => {
    const res = await fetch(`${API_BASE}/seller/orders/${id}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason }),
    });
    return res.json();
  };
}
export const confirmSellerOrder = sellerOrderAction("confirm");
export const rejectSellerOrder = sellerOrderAction("reject");
export const processSellerOrder = sellerOrderAction("process");
export const shipSellerOrder = sellerOrderAction("ship");
export const deliverSellerOrder = sellerOrderAction("deliver");

// ---- Buyer address book ----
export async function fetchBuyerAddresses(token) {
  const res = await fetch(`${API_BASE}/buyer/addresses`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function createBuyerAddress(token, payload) {
  const res = await fetch(`${API_BASE}/buyer/addresses`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchCreditStatus(token, { sellerId, submissionId, otherUserId } = {}) {
  const params = sellerId ? `sellerId=${sellerId}` : submissionId ? `submissionId=${submissionId}` : `otherUserId=${otherUserId}`;
  const res = await fetch(`${API_BASE}/credit/status?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function requestCredit(token, payload) {
  const res = await fetch(`${API_BASE}/credit/request`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  return res.json();
}
export async function decideCredit(token, creditId, decision, creditLimit) {
  const res = await fetch(`${API_BASE}/credit/${creditId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision, creditLimit }),   // creditLimit was missing
  });
  return res.json();
}

export async function requestCreditIncrease(token, creditId) {
  const res = await fetch(`${API_BASE}/credit/${creditId}/request-increase`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ creditId }),
  });
  return res.json();
}

export async function updateCreditLimit(token, creditId, newLimit, resetUsed = true) {
  const res = await fetch(`${API_BASE}/credit/${creditId}/update-limit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newLimit, resetUsed }),
  });
  return res.json();
}

export async function declineCreditIncrease(token, creditId, cooldownDays) {
  const res = await fetch(`${API_BASE}/credit/${creditId}/decline-increase`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cooldownDays }),
  });
  return res.json();
}

export async function toggleCredit(token, buyerId, enabled) {
  const res = await fetch(`${API_BASE}/credit/toggle`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ buyerId, enabled }),
  });
  return res.json();
}

export async function fetchOrderById(token, id) {
  const res = await fetch(`${API_BASE}/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
export async function fetchSellerOrderById(token, id) {
  const res = await fetch(`${API_BASE}/seller/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function markAllNotificationsRead(token) {
  const res = await fetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function fetchCatalogBrowse(params, signal, token) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    qs.set(k, Array.isArray(v) ? v.join(",") : v);
  });
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await fetch(`${API_BASE}/catalog-search/browse?${qs}`, { signal, headers });
  return res.json();
}

export async function setSellerSubmissionActive(token, id, isActive) {
  const res = await fetch(`${API_BASE}/seller/catalog/submissions/${id}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isActive }),
  });
  return res.json();
}

export async function adminListBrandItemSubmissions(token, brandItemId) {
  const res = await fetch(`${API_BASE}/admin/seller-submissions/by-brand-item/${brandItemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function fetchGenericProductBrowse(params, signal, token) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    qs.set(k, Array.isArray(v) ? v.join(",") : v);
  });
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const res = await fetch(`${API_BASE}/catalog-search/browse-products?${qs}`, { signal, headers });
  return res.json();
}

export async function fetchGenericProductSellers(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    qs.set(k, Array.isArray(v) ? v.join(",") : v);
  });
  const res = await fetch(`${API_BASE}/catalog-search/generic-product-sellers?${qs}`);
  return res.json();
}

export async function fetchPublicListingDetail(id) {
  const res = await fetch(`${API_BASE}/catalog-search/listing/${id}`);
  //Now log the response
  // console.log(res)
  return res.json();
}

export async function fetchApprovedBrandsForGenericProduct(genericProductId, q = "") {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/catalog-search/generic-products/${genericProductId}/brands?${params}`);
  return res.json();
}

export async function fetchHomeFeed(cursor = 0, limit = 3) {
  const params = new URLSearchParams({ cursor, limit });
  const res = await fetch(`${API_BASE}/catalog-search/home-feed?${params}`);
  return res.json();
}

export async function fetchCategoryGenericProducts(categoryId, { q = "", sort = "relevance", limit = 30, offset = 0, subcategoryIds, signal } = {}) {
  const params = new URLSearchParams({ q, sort, limit, offset });
  if (subcategoryIds?.length) params.set("subcategoryIds", subcategoryIds.join(","));

  const res = await fetch(
    `${API_BASE}/catalog/categories/${categoryId}/generic-products?${params}`,
    { signal }
  );

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchGenericProductBrands(genericProductId, { q = "", sort = "relevance", limit = 30, offset = 0, signal } = {}) {
  const params = new URLSearchParams({ q, sort, limit, offset });

  const res = await fetch(`${API_BASE}/catalog/generic-products/${genericProductId}/brands?${params}`, { signal });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchBrandItemsFeed({ categoryId = null, q = "", sort = "relevance", limit = 24, offset = 0, signal } = {}) {
  const params = new URLSearchParams({ q, sort, limit, offset });
  if (categoryId) params.set("categoryId", categoryId);

  const res = await fetch(`${API_BASE}/catalog/brand-items-feed?${params}`, { signal });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchBrandItemDetail(brandItemId, { signal } = {}) {
  const res = await fetch(`${API_BASE}/catalog/brand-items/${brandItemId}`, { signal });

  if (res.status === 404) {
    return { success: false, message: "Product not found." };
  }
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchBrandItemSellers(brandItemId, { sort = "relevance", limit = 24, offset = 0, signal } = {}) {
  const params = new URLSearchParams({ sort, limit, offset });
  // const t0 = performance.now();
  const res = await fetch(`${API_BASE}/catalog/brand-items/${brandItemId}/sellers?${params}`, { signal });
  // console.log(`[timing] sellers fetch: ${(performance.now() - t0).toFixed(0)}ms`);
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
}

export async function fetchGenericProductsFeed({ categoryId = null, q = "", sort = "relevance", limit = 24, offset = 0, subcategoryIds, signal } = {}) {
  const params = new URLSearchParams({ q, sort, limit, offset });
  if (categoryId) params.set("categoryId", categoryId);
  if (subcategoryIds?.length) params.set("subcategoryIds", subcategoryIds.join(","));

  const res = await fetch(`${API_BASE}/catalog/generic-products?${params}`, { signal });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchPaymentInstructions(token, orderId) {
  const res = await fetch(`${API_BASE}/orders/${orderId}/payment`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    console.error("fetchPaymentInstructions failed:", res.status, body);
    return { success: false, message: body?.message || "Couldn't load payment details.", status: body?.status };
  }
  return body;
}

export async function submitPaymentProof(token, orderId, { utr, method, screenshotFile }) {
  const form = new FormData();
  form.append("utr", utr);
  form.append("payment_method", method || "upi");
  if (screenshotFile) form.append("screenshot", screenshotFile);
  const res = await fetch(`${API_BASE}/orders/${orderId}/payment-proof`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("submitPaymentProof failed:", res.status, text.slice(0, 200));
    return { success: false, message: "Couldn't submit payment proof." };
  }
  return res.json();
}

export async function downloadFullCatalogTemplate(token) {
  const res = await fetch(`${API_BASE}/admin/catalog-bulk/excel-template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

export async function uploadFullCatalogFile(token, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/admin/catalog-bulk/excel-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return res.json();
}

// ---- Help request (support bulb) ----
export async function fetchHelpStatus(token) {
  try {
    const res = await fetch(`${API_BASE}/help/status`, { headers: { Authorization: `Bearer ${token}` } });
    return await res.json();
  } catch { return { success: false, message: "Network error." }; }
}
export async function markHelpResolutionSeen(token, id) {
  try {
    await fetch(`${API_BASE}/help/${id}/seen`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch { /* best-effort */ }
}
export async function triggerHelpRequest(token) {
  try {
    const res = await fetch(`${API_BASE}/help/trigger`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return { ...(await res.json()), status: res.status };
  } catch { return { success: false, message: "Network error." }; }
}
export async function adminListHelpRequests(token, status) {
  try {
    const res = await fetch(`${API_BASE}/help/admin/list?status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
    return await res.json();
  } catch { return { success: false, message: "Network error." }; }
}
export async function adminAcknowledgeHelpRequest(token, id, notes) {
  try {
    const res = await fetch(`${API_BASE}/help/admin/${id}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes }),
    });
    return await res.json();
  } catch { return { success: false, message: "Network error." }; }
}
export async function adminResolveHelpRequest(token, id, notes) {
  try {
    const res = await fetch(`${API_BASE}/help/admin/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes }),
    });
    return await res.json();
  } catch { return { success: false, message: "Network error." }; }
}

export function fetchSharedProductLink(submissionId) {
  return fetch(`${API_BASE}/catalog/shared/${submissionId}`).then((r) => r.json());
}

export async function requestAdminOtp(identifier) {
  const res = await fetch(`${API_BASE}/admin/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  return res.json();
}

export async function verifyAdminOtp(identifier, otp) {
  const res = await fetch(`${API_BASE}/admin/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, otp }),
  });
  return res.json();
}

export async function adminCreateAdmin(token, { phone, email, name }) {
  const res = await fetch(`${API_BASE}/admin/admins/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phone, email, name }),
  });
  return res.json();
}

export async function adminListAdmins(token) {
  const res = await fetch(`${API_BASE}/admin/admins`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function adminDemoteUser(token, adminId) {
  const res = await fetch(`${API_BASE}/admin/admins/demote`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ adminId }),
  });
  return res.json();
}