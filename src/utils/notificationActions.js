// utils/notificationActions.js
//
// Helpers that decide WHICH notifications can carry quick actions in the Console, and
// which live entity (order / transport proposal) each one belongs to.
//
// Whether a notification is still actionable is never decided here from the notification
// itself (it is just a message and stays the same forever). It is decided in
// NotificationActionsContext from the live list of orders / proposals that are still waiting
// for the seller, so an action taken anywhere makes the buttons disappear everywhere.
import { routeTransportModeLabel } from "../../shared/routeTransportFields.js";

const SELLER_ORDER_LINK_RE = /^\/(?:seller|grow)\/orders\/([^/?#]+)/;

export function sellerOrderIdFromLink(link) {
    if (typeof link !== "string") return null;
    const m = link.match(SELLER_ORDER_LINK_RE);
    return m ? m[1] : null;
}

// "New order: BBM-..." (sent to the seller when payment is confirmed / the order is placed).
export function isOrderPlacedNotification(n) {
    return n?.type === "order_placed" && !!sellerOrderIdFromLink(n.link);
}

// "New transport route proposed" (sent to the seller when a buyer proposes a route).
export function isProposalReceivedNotification(n) {
    return n?.type === "transport_proposal_received";
}

const stampMs = (o) => {
    const v = o?.created_at ?? o?.createdAt ?? o?.timestamp ?? null;
    const t = v ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : null;
};

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// The exact proposal id, when the server provides it (preferred — see the backend note:
// put `?proposal=<id>` in the notification link, or the id in the notification data).
export function proposalIdFromNotification(n) {
    if (!n) return null;
    const direct =
        n.proposal_id ?? n.proposalId ??
        n.data?.proposalId ?? n.data?.proposal_id ??
        n.meta?.proposalId ?? n.meta?.proposal_id ??
        n.metadata?.proposalId ?? n.metadata?.proposal_id ??
        n.payload?.proposalId ?? n.payload?.proposal_id ?? null;
    if (direct != null && direct !== "") return String(direct);
    if (typeof n.link === "string") {
        const m = n.link.match(/[?&](?:proposal|proposalId|proposal_id)=([^&#]+)/);
        if (m) return decodeURIComponent(m[1]);
    }
    return null;
}

// Words that identify a proposal inside a notification text: its places, its mode and the
// values of its fields (company / train / airline name ...).
function proposalTokens(p) {
    const origin = [p.origin_city, p.origin_state].map(norm).filter((t) => t.length >= 3);
    const dest = [p.dest_city, p.dest_state].map(norm).filter((t) => t.length >= 3);
    const what = [
        norm(routeTransportModeLabel(p.mode)),
        norm(String(p.mode || "").replace(/_/g, " ")),
        ...Object.values(p.fields || {}).map((v) => (typeof v === "string" ? norm(v) : "")),
    ].filter((t) => t.length >= 3);
    return { origin, dest, what: [...new Set(what)] };
}

// Maps notification id -> pending proposal. Exact when the notification carries the id,
// otherwise a careful text match that gives up (no buttons) rather than guess wrong.
export function matchProposals(notifications, proposals) {
    const out = new Map();
    if (!notifications?.length || !proposals?.length) return out;
    const byId = new Map(proposals.map((p) => [String(p.id), p]));
    const tokens = new Map(proposals.map((p) => [String(p.id), proposalTokens(p)]));

    for (const n of notifications) {
        const exact = proposalIdFromNotification(n);
        if (exact) {
            const p = byId.get(exact);
            if (p) out.set(n.id, p); // not pending any more -> no entry -> no buttons
            continue;
        }

        const text = norm(`${n.title || ""} ${n.body || ""}`);
        if (!text) continue;
        const nAt = stampMs(n);

        let best = [];
        let bestScore = 0;
        for (const p of proposals) {
            const t = tokens.get(String(p.id));
            const o = t.origin.filter((x) => text.includes(x)).length;
            const d = t.dest.filter((x) => text.includes(x)).length;
            const w = t.what.filter((x) => text.includes(x)).length;
            if (!o || !d || !w) continue; // all three parts must be present
            const score = o + d + w;
            if (score > bestScore) { best = [p]; bestScore = score; }
            else if (score === bestScore) best.push(p);
        }

        if (best.length === 1) { out.set(n.id, best[0]); continue; }
        if (best.length > 1 && nAt != null) {
            const close = best.filter((p) => {
                const pAt = stampMs(p);
                return pAt != null && Math.abs(pAt - nAt) <= 10 * 60 * 1000;
            });
            if (close.length === 1) out.set(n.id, close[0]);
        }
    }
    return out;
}