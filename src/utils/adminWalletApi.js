// utils/adminWalletApi.js
import { apiGet, apiPatch } from "./api.js";

export async function fetchAllSellerWallets(token, { search, billingMode } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (billingMode) params.set("billingMode", billingMode);
    return apiGet(`/admin/wallet/sellers?${params.toString()}`, token);
}
export async function updateSellerWalletSettings(token, sellerId, { billingMode, thresholdAmount }) {
    return apiPatch(`/admin/wallet/sellers/${sellerId}/settings`, token, { billingMode, thresholdAmount });
}