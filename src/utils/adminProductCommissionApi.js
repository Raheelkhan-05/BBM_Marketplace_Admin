// utils/adminProductCommissionApi.js
import { apiGet, apiPatch } from "./api.js";

export async function fetchProductCommissions(token, { search, overriddenOnly } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (overriddenOnly) params.set("overriddenOnly", "true");
    return apiGet(`/admin/products/commissions?${params.toString()}`, token);
}

export async function updateProductCommission(token, productId, commissionPercent) {
    return apiPatch(`/admin/products/${productId}/commission`, token, { commissionPercent });
}