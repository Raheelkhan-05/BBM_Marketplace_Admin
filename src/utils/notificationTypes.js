// utils/notificationTypes.js
//
// Classifies a notification as "purchase" (buyer-facing order update) or
// "sales" (seller-facing order update) by its LINK, not its `type` string.
//
// Why link and not type: most order notifications do use a
// "order_status_*" / "order_placed" type convention, but that convention
// isn't reliable on its own — e.g. cancelMyOrder() in orders.controller.js
// sends a notification typed "order_status_cancelled" to the SELLER (with
// link "/seller/orders/:id"), which would land in the wrong bucket if we
// classified by type prefix. The link the notification points to is always
// correct for "which orders list does this belong on", since it's built
// from the exact route the recipient is meant to land on.
const PURCHASE_LINK_RE = /^\/orders\/[^/?#]+/;
const SALES_LINK_RE = /^\/seller\/orders\/[^/?#]+/;
const CHAT_LINK_RE = /^\/chat\/[^/?#]+/;
const LISTINGS_LINK_RE = /^\/seller\/listings/;
const WALLET_LINK_RE = /^\/seller\/wallet/;



export function isPurchaseOrderNotification(n) {
    return typeof n?.link === "string" && PURCHASE_LINK_RE.test(n.link);
}

export function isSalesOrderNotification(n) {
    return typeof n?.link === "string" && SALES_LINK_RE.test(n.link);
}

export function isOrderNotification(n) {
    return isPurchaseOrderNotification(n) || isSalesOrderNotification(n);
}

export function orderIdFromLink(link) {
    if (typeof link !== "string") return null;
    const m = link.match(/^\/(?:seller\/)?orders\/([^/?#]+)/);
    return m ? m[1] : null;
}

export function isChatNotification(n) {
    return typeof n?.link === "string" && CHAT_LINK_RE.test(n.link);
}

// Manual admin decisions only — NOT the auto-approve-on-create path.
export function isListingApprovedNotification(n) {
    return n?.type === "listing_approved";
}
export function isListingRejectedNotification(n) {
    return n?.type === "listing_rejected";
}
// Deliberately excluded from every badge/count below — the instant
// "product already approved elsewhere, yours went live automatically"
// case never involved a human review, so it shouldn't count as a
// pending-attention item anywhere.
export function isAutoApprovedListingNotification(n) {
    return n?.type === "listing_live_auto";
}
export function isWalletTopupNotification(n) {
    return n?.type === "wallet_topup_success";
}
export function isWalletLowBalanceNotification(n) {
    return n?.type === "wallet_low_balance";
}
// Everything that belongs on "My Products" instead of the bell.
export function isListingsSectionNotification(n) {
    return isListingApprovedNotification(n) || isListingRejectedNotification(n)
        || isWalletTopupNotification(n) || isWalletLowBalanceNotification(n);
}

// The three transport-library lifecycle events (see notifyUser calls in
// transportLibrary.controller.js): a buyer proposing a new route to a
// seller, and a buyer's own proposal getting approved/rejected. Matched
// by type rather than link — unlike orders, all three share the same kind
// of "/transport-library..." link shape (seller side always goes to
// ?tab=manage, buyer side to /orders), so link alone can't tell them apart
// from an ordinary transport-library page visit the way order links can.
export function isTransportProposalNotification(n) {
    return n?.type === "transport_proposal_received"
        || n?.type === "transport_proposal_approved"
        || n?.type === "transport_proposal_rejected";
}

// approveSellerSubmission/rejectSellerSubmission/notifySellerListingLive
// all embed the submission id as ?highlight=<id> in their link — this
// pulls it back out so the list page can flash the right row.
export function extractHighlightId(link) {
    if (typeof link !== "string") return null;
    const m = link.match(/[?&]highlight=([^&]+)/);
    return m ? m[1] : null;
}