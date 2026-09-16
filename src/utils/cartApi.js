import { API_BASE } from "./api.js";

async function request(method, path, token, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
}

export async function fetchCart(token) {
    return request("GET", "/cart", token);
}

export async function addToCart(token, { submissionId, quantity, purchaseBasis }) {
    return request("POST", "/cart/items", token, { submissionId, quantity, purchaseBasis });
}

export async function updateCartItem(token, submissionId, body) {
    return request("PATCH", `/cart/items/${submissionId}`, token, body);
}

export async function removeFromCart(token, submissionId) {
    return request("DELETE", `/cart/items/${submissionId}`, token);
}

export async function checkoutCart(token, { shippingAddressId, notes }) {
    return request("POST", "/cart/checkout", token, { shippingAddressId, notes });
}

// utils/cartApi.js  (updated payment-related exports — merge into your existing file)

export async function fetchGroupPaymentInstructions(token, groupId) {
    const res = await fetch(`${API_BASE}/cart/groups/${groupId}/payment-instructions`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) {
        console.error("fetchGroupPaymentInstructions failed:", res.status, body);
        return { success: false, message: body?.message || "Couldn't load payment details.", status: body?.status };
    }
    return body;
}

export async function submitGroupPaymentProof(token, groupId, { utr, method, screenshotFile }) {
    const form = new FormData();
    form.append("utr", utr);
    form.append("payment_method", method || "upi");
    if (screenshotFile) form.append("screenshot", screenshotFile);
    const res = await fetch(`${API_BASE}/cart/groups/${groupId}/payment-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("submitGroupPaymentProof failed:", res.status, text.slice(0, 200));
        return { success: false, message: "Couldn't submit payment proof." };
    }
    return res.json();
}

// export async function submitGroupPaymentProof(token, groupId, { utr, screenshotUrl }) {
//     return request("POST", `/cart/groups/${groupId}/payment-proof`, token, { utr, screenshotUrl });
// }