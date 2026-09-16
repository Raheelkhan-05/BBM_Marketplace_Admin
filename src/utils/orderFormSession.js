// utils/orderFormSession.js
//
// Persists a snapshot of BuyNowModal's fields (quantity, basis, address,
// notes, order mode — plus the seller/product data needed to re-render
// the modal at all) at the exact moment "Place order" succeeds.
//
// This exists specifically for the case where PaymentQRModal gets resumed
// by PendingPaymentGate after a full page reload — in that situation
// there is no live BuyNowModal instance left to fall back into if the
// buyer hits "close" on the QR screen. This snapshot is what lets us
// reconstruct that exact BuyNowModal instead of just dropping the buyer
// with nothing.
//
// When BuyNowModal is still mounted (the normal, non-reloaded case), this
// snapshot isn't even needed for restoring the form — component state
// already does that — but we keep it in sync regardless so both cases
// behave identically from the buyer's point of view.
import { PAYMENT_SESSION_TTL_MS } from "./paymentSession.js";

const STORAGE_KEY = "bbm_pending_order_form";

export function saveOrderFormSession({ orderId, seller, product, quantity, basis, selectedAddressId, showNewAddress, newAddress, notes, orderMode }) {
    const session = {
        orderId, seller, product, quantity, basis, selectedAddressId, showNewAddress, newAddress, notes, orderMode,
        startedAt: Date.now(),
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
        // localStorage can throw in private-browsing/quota-exceeded edge
        // cases — the buy flow still works, it just won't survive a reload.
    }
    return session;
}

// Returns the stored snapshot only if it matches the given orderId (when
// provided) and hasn't expired — mirrors the same 10-minute window as the
// payment session, since a form snapshot is only useful for as long as
// the order it belongs to is still awaiting payment.
export function loadOrderFormSession(orderId) {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    let session;
    try {
        session = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!session?.orderId || !session?.startedAt) return null;
    if (orderId && session.orderId !== orderId) return null;
    if (Date.now() - session.startedAt > PAYMENT_SESSION_TTL_MS) return null;

    return session;
}

export function clearOrderFormSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}