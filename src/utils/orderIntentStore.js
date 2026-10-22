// utils/orderIntentStore.js
//
// Persists "I was mid-checkout, waiting on a transport proposal" so that
// when the seller acts (approve/reject), we can resume the buyer exactly
// where they left off — even after a page reload, tab close, or app kill.
//
// Keyed by the PROPOSAL's routeOptionId (the id returned by proposeRouteOption /
// carried on the pendingProposal object), because that's the one stable
// identifier shared between the buyer's pending record and the
// transport_proposal_approved / transport_proposal_rejected socket payloads.
//
// Multiple intents can coexist (buyer proposes for product A, then browses
// and proposes for product B before seller acts on either) — this is an
// array, not a single slot.

const KEY = "bbm_pending_order_intents_v1";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days — stale intents self-expire

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        const now = Date.now();
        // Drop anything too old on every read, so the list never grows unbounded
        // and a buyer never gets yanked into a months-old half-finished order.
        return list.filter((i) => now - (i.savedAt || 0) < MAX_AGE_MS);
    } catch {
        return [];
    }
}

function writeAll(list) {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
        // Storage full / disabled — degrade silently, nothing here is critical-path.
    }
}

/**
 * @param {object} intent
 *   source: "buynow" | "cart"
 *   proposalRouteOptionId: string   (REQUIRED — the join key)
 *   sellerId: string
 *   sellerName: string
 *   destCity / destState: string
 *   // buynow-specific:
 *   offerId, productId, productName, quantity, basis, orderMode,
 *   notes, addressId
 *   // cart-specific:
 *   cartSellerId
 */
export function savePendingIntent(intent) {
    if (!intent?.proposalRouteOptionId) return;
    const list = readAll().filter((i) => i.proposalRouteOptionId !== intent.proposalRouteOptionId);
    list.push({ ...intent, savedAt: Date.now(), status: "pending" });
    writeAll(list);
}

export function getPendingIntent(proposalRouteOptionId) {
    return readAll().find((i) => i.proposalRouteOptionId === proposalRouteOptionId) || null;
}

export function getAllPendingIntents() {
    return readAll();
}

// Called when the approval/rejection notification lands. Marks the intent
// resolved (approved/rejected + reason) instead of deleting it immediately —
// the UI needs to read the reason back out once, then the caller explicitly
// clears it via clearIntent() after the buyer has seen/acted on it.
export function markIntentResolved(proposalRouteOptionId, { status, reason, resolvedRouteOptionId, resolvedMode, resolvedFields } = {}) {
    const list = readAll();
    const idx = list.findIndex((i) => i.proposalRouteOptionId === proposalRouteOptionId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], status, reason: reason || null, resolvedRouteOptionId, resolvedMode, resolvedFields, resolvedAt: Date.now() };
    writeAll(list);
    return list[idx];
}

export function clearIntent(proposalRouteOptionId) {
    writeAll(readAll().filter((i) => i.proposalRouteOptionId !== proposalRouteOptionId));
}

// Everything still "pending" or "approved-but-not-yet-resumed" —
// what OrderResumeContext shows as re-entry prompts on app load / nav.
export function getActionableIntents() {
    return readAll().filter((i) => i.status === "pending" || i.status === "approved" || i.status === "rejected");
}