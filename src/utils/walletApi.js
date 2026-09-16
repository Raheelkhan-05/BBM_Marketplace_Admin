// utils/walletApi.js
import { apiGet, API_BASE } from "./api.js";

export async function fetchWalletStatus(token) { return apiGet("/seller/wallet", token); }
export async function fetchWalletTransactions(token) { return apiGet("/seller/wallet/transactions", token); }
export async function fetchWalletPayments(token) { return apiGet("/seller/wallet/payments", token); }

// NEW — dummy QR details for a given top-up amount
export async function fetchWalletPaymentInstructions(token, amount) {
    const res = await fetch(`${API_BASE}/seller/wallet/payment-instructions?amount=${encodeURIComponent(amount)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) return { success: false, message: body?.message || "Couldn't load payment details." };
    return body;
}

// NEW — multipart submit (amount + utr + optional screenshot file), used
// by WalletPaymentQRModal. Kept separate from the old submitWalletPayment
// so nothing else that imports the JSON version breaks.
export async function submitWalletPaymentWithProof(token, { amount, utr, screenshotFile }) {
    const form = new FormData();
    form.append("amount", amount);
    form.append("utr", utr);
    if (screenshotFile) form.append("screenshot", screenshotFile);
    const res = await fetch(`${API_BASE}/seller/wallet/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) {
        let message = "Couldn't submit payment proof.";
        try { message = (await res.json())?.message || message; } catch { /* ignore */ }
        return { success: false, message };
    }
    return res.json();
}