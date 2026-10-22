// context/NotificationActionsContext.jsx
//
// One source of truth for "what is still waiting for the seller's decision", used by the Console
// (quick action buttons on notifications) AND by the Sales Orders / Order detail / Transport pages.
//
//   - pending orders    : seller orders in `pending_confirmation`            (one request)
//   - pending proposals : buyer transport-route proposals awaiting a decision (one request)
//
// A notification only shows buttons while its order / proposal is in these live lists. Acting from
// ANYWHERE removes it from the list at once, so the buttons vanish in the Console and on the page,
// the notification is marked read, and the pages reload when the action came from the Console.
//
// Fetching is lazy: nothing is requested unless a relevant notification exists. It re-validates when
// a new related notification arrives (socket -> NotificationsContext), when the Console opens, and
// when the tab regains focus.
//
// MOUNT this provider inside AuthProvider, SocketProvider, NotificationsProvider and
// TransportLibraryProvider, and above BottomNavStrip and the /grow routes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useNotifications } from "./NotificationsContext.jsx";
import { useTransportLibrary } from "./TransportLibraryContext.jsx";
import { fetchSellerOrders, confirmSellerOrder, rejectSellerOrder } from "../utils/api.js";
import {
    fetchPendingProposals, approveProposal as apiApproveProposal, rejectProposal as apiRejectProposal,
} from "../utils/api.transport.js";
import {
    isOrderPlacedNotification, isProposalReceivedNotification, sellerOrderIdFromLink, matchProposals,
} from "../utils/notificationActions.js";

const EMPTY = Object.freeze({});
const MIN_REFRESH_GAP_MS = 8000;

// Tolerate a missing TransportLibraryProvider (the hook may throw outside it): actions still work,
// only the header's pending-proposals count is not synced.
function useTransportLibrarySafe() {
    try { return useTransportLibrary() || EMPTY; } catch { return EMPTY; }
}

const NOOP = {
    getAction: () => null,
    busy: EMPTY,
    confirmOrder: async () => ({ ok: false, message: "" }),
    rejectOrder: async () => ({ ok: false, message: "" }),
    approveProposal: async () => ({ ok: false, message: "" }),
    rejectProposal: async () => ({ ok: false, message: "" }),
    markOrderHandled: () => { },
    markProposalHandled: () => { },
    refresh: () => { },
    ordersVersion: 0,
    transportVersion: 0,
};

const NotificationActionsContext = createContext(null);

// Never throws: without the provider the Console simply shows no quick actions.
export function useNotificationActions() {
    return useContext(NotificationActionsContext) || NOOP;
}

export function NotificationActionsProvider({ children }) {
    const { token } = useAuth();
    const { notifications, markRead } = useNotifications();
    const transport = useTransportLibrarySafe();

    const [orders, setOrders] = useState({ loaded: false, byId: EMPTY });
    const [proposals, setProposals] = useState({ loaded: false, list: [] });
    const [outcomes, setOutcomes] = useState(EMPTY);   // notification id -> "confirmed" | "rejected" | "approved" | "declined"
    const [busy, setBusy] = useState(EMPTY);           // "order:<id>" / "proposal:<id>" -> true
    const [ordersVersion, setOrdersVersion] = useState(0);       // bumps when the CONSOLE changes an order
    const [transportVersion, setTransportVersion] = useState(0); // bumps when the CONSOLE changes a proposal

    const ordersSeq = useRef(0);
    const proposalsSeq = useRef(0);
    const busyRef = useRef({});
    const lastRefreshRef = useRef(0);

    // Latest values for callbacks (so callbacks stay stable).
    const ordersRef = useRef(orders); ordersRef.current = orders;
    const proposalsRef = useRef(proposals); proposalsRef.current = proposals;
    const notifsRef = useRef(notifications); notifsRef.current = notifications;
    const transportRef = useRef(transport); transportRef.current = transport;
    const markReadRef = useRef(markRead); markReadRef.current = markRead;

    /* ------------------------------------------------------------ loading */

    const loadOrders = useCallback(async () => {
        if (!token) return;
        const seq = ++ordersSeq.current;
        try {
            const res = await fetchSellerOrders(token, "pending_confirmation");
            if (seq !== ordersSeq.current) return; // an action (or a newer load) superseded this one
            if (res?.success) {
                const byId = {};
                for (const o of res.orders || []) {
                    if (o?.id != null && (!o.status || o.status === "pending_confirmation")) byId[String(o.id)] = o;
                }
                setOrders({ loaded: true, byId });
            } else {
                setOrders((p) => ({ loaded: true, byId: p.byId }));
            }
        } catch {
            if (seq === ordersSeq.current) setOrders((p) => ({ loaded: true, byId: p.byId }));
        }
    }, [token]);

    const loadProposals = useCallback(async () => {
        if (!token) return;
        const seq = ++proposalsSeq.current;
        try {
            const res = await fetchPendingProposals(token);
            if (seq !== proposalsSeq.current) return;
            const list = res?.proposals;
            if (Array.isArray(list)) {
                setProposals({ loaded: true, list });
                transportRef.current.syncPendingCount?.(list.length);
            } else {
                setProposals((p) => ({ loaded: true, list: p.list }));
            }
        } catch {
            if (seq === proposalsSeq.current) setProposals((p) => ({ loaded: true, list: p.list }));
        }
    }, [token]);

    // A different account (or sign-out): forget everything.
    useEffect(() => {
        ordersSeq.current += 1;
        proposalsSeq.current += 1;
        busyRef.current = {};
        setOrders({ loaded: false, byId: EMPTY });
        setProposals({ loaded: false, list: [] });
        setOutcomes(EMPTY);
        setBusy(EMPTY);
    }, [token]);

    // Fetch only when a related notification exists; re-validate when a new related one arrives.
    const orderKey = useMemo(() => {
        const list = notifications || [];
        if (!list.some(isOrderPlacedNotification)) return "";
        return list.filter((n) => sellerOrderIdFromLink(n.link)).map((n) => n.id).join("|");
    }, [notifications]);

    const proposalKey = useMemo(() => {
        const list = notifications || [];
        if (!list.some(isProposalReceivedNotification)) return "";
        return list.filter((n) => typeof n?.type === "string" && n.type.startsWith("transport_proposal_")).map((n) => n.id).join("|");
    }, [notifications]);

    const orderKeyRef = useRef(orderKey); orderKeyRef.current = orderKey;
    const proposalKeyRef = useRef(proposalKey); proposalKeyRef.current = proposalKey;

    useEffect(() => { if (token && orderKey) loadOrders(); }, [token, orderKey, loadOrders]);
    useEffect(() => { if (token && proposalKey) loadProposals(); }, [token, proposalKey, loadProposals]);

    // Re-validate on demand (Console opens) and when the tab/app comes back to the foreground.
    const refresh = useCallback((opts = {}) => {
        if (!token) return;
        const now = Date.now();
        if (!opts.force && now - lastRefreshRef.current < MIN_REFRESH_GAP_MS) return;
        if (opts.force && now - lastRefreshRef.current < 1500) return;
        lastRefreshRef.current = now;
        if (orderKeyRef.current) loadOrders();
        if (proposalKeyRef.current) loadProposals();
    }, [token, loadOrders, loadProposals]);

    useEffect(() => {
        if (!token) return undefined;
        const onBack = () => { if (document.visibilityState === "visible") refresh(); };
        document.addEventListener("visibilitychange", onBack);
        window.addEventListener("focus", onBack);
        return () => {
            document.removeEventListener("visibilitychange", onBack);
            window.removeEventListener("focus", onBack);
        };
    }, [token, refresh]);

    /* ------------------------------------------------- notification matching */

    const proposalByNotif = useMemo(
        () => (proposals.loaded
            ? matchProposals((notifications || []).filter(isProposalReceivedNotification), proposals.list)
            : new Map()),
        [notifications, proposals]
    );
    const proposalByNotifRef = useRef(proposalByNotif); proposalByNotifRef.current = proposalByNotif;

    const getAction = useCallback((n) => {
        if (!n) return null;

        if (isOrderPlacedNotification(n)) {
            if (!orders.loaded) return null;
            const id = sellerOrderIdFromLink(n.link);
            const order = orders.byId[id];
            if (order) {
                const dueAt = order.seller_response_due_at ? Date.parse(order.seller_response_due_at) : NaN;
                return { kind: "order", key: `order:${id}`, id, order, expired: Number.isFinite(dueAt) && dueAt <= Date.now() };
            }
            if (outcomes[n.id]) return { kind: "order", key: `order:${id}`, id, outcome: outcomes[n.id] };
            return null;
        }

        if (isProposalReceivedNotification(n)) {
            if (!proposals.loaded) return null;
            const proposal = proposalByNotif.get(n.id);
            if (proposal) return { kind: "proposal", key: `proposal:${proposal.id}`, id: proposal.id, proposal };
            if (outcomes[n.id]) return { kind: "proposal", key: `proposal:${n.id}`, id: null, outcome: outcomes[n.id] };
            return null;
        }
        return null;
    }, [orders, proposals.loaded, proposalByNotif, outcomes]);

    /* ------------------------------------------------------ applying results */

    // `external` = the action was taken on a page (which reloads itself), not from the Console.
    const applyOrderHandled = useCallback((orderId, outcome, { external = false } = {}) => {
        const id = String(orderId);
        ordersSeq.current += 1; // discard any in-flight list that still contains this order
        setOrders((p) => {
            if (!p.byId[id]) return p;
            const rest = { ...p.byId };
            delete rest[id];
            return { ...p, byId: rest };
        });
        const mine = (notifsRef.current || []).filter((n) => sellerOrderIdFromLink(n.link) === id);
        if (outcome) {
            setOutcomes((p) => {
                const next = { ...p };
                mine.filter(isOrderPlacedNotification).forEach((n) => { next[n.id] = outcome; });
                return next;
            });
        }
        mine.filter((n) => !n.read).forEach((n) => markReadRef.current?.(n.id));
        if (!ordersRef.current.loaded) loadOrders();
        if (!external) setOrdersVersion((v) => v + 1);
    }, [loadOrders]);

    const applyProposalHandled = useCallback((proposalId, outcome, { external = false } = {}) => {
        const id = String(proposalId);
        proposalsSeq.current += 1;
        const notifIds = [];
        proposalByNotifRef.current.forEach((p, nid) => { if (String(p.id) === id) notifIds.push(nid); });
        const remaining = proposalsRef.current.list.filter((p) => String(p.id) !== id);

        setProposals((p) => ({ ...p, list: p.list.filter((x) => String(x.id) !== id) }));
        if (outcome && notifIds.length) {
            setOutcomes((p) => {
                const next = { ...p };
                notifIds.forEach((nid) => { next[nid] = outcome; });
                return next;
            });
        }
        (notifsRef.current || [])
            .filter((n) => notifIds.includes(n.id) && !n.read)
            .forEach((n) => markReadRef.current?.(n.id));

        if (!proposalsRef.current.loaded) loadProposals();
        if (!external) {
            transportRef.current.markProposalResolved?.();
            transportRef.current.syncPendingCount?.(remaining.length);
            setTransportVersion((v) => v + 1);
        }
    }, [loadProposals]);

    // For pages that perform the action themselves.
    const markOrderHandled = useCallback((orderId, outcome = null) => applyOrderHandled(orderId, outcome, { external: true }), [applyOrderHandled]);
    const markProposalHandled = useCallback((proposalId, outcome = null) => applyProposalHandled(proposalId, outcome, { external: true }), [applyProposalHandled]);

    /* --------------------------------------------------------------- actions */

    const withBusy = useCallback(async (key, fn) => {
        if (busyRef.current[key]) return { ok: false, message: "" };
        busyRef.current = { ...busyRef.current, [key]: true };
        setBusy(busyRef.current);
        try {
            return await fn();
        } finally {
            const rest = { ...busyRef.current };
            delete rest[key];
            busyRef.current = rest;
            setBusy(rest);
        }
    }, []);

    const confirmOrder = useCallback((orderId) => withBusy(`order:${orderId}`, async () => {
        let res = null;
        try { res = await confirmSellerOrder(token, orderId); } catch { res = null; }
        if (res?.success) {
            applyOrderHandled(orderId, "confirmed");
            return { ok: true };
        }
        loadOrders(); // it may have been handled elsewhere / expired: resync the buttons
        return { ok: false, message: res?.message || "Couldn't confirm this order. Please try again." };
    }), [token, withBusy, applyOrderHandled, loadOrders]);

    const rejectOrder = useCallback((orderId, reason = "") => withBusy(`order:${orderId}`, async () => {
        let res = null;
        try { res = await rejectSellerOrder(token, orderId, String(reason || "").trim()); } catch { res = null; }
        if (res?.success) {
            applyOrderHandled(orderId, "rejected");
            return { ok: true };
        }
        loadOrders();
        return { ok: false, message: res?.message || "Couldn't reject this order. Please try again." };
    }), [token, withBusy, applyOrderHandled, loadOrders]);

    const approveProposal = useCallback((proposalId) => withBusy(`proposal:${proposalId}`, async () => {
        let res = null;
        let threw = false;
        try { res = await apiApproveProposal(proposalId, token); } catch { threw = true; }
        if (!threw && res?.success !== false) {
            applyProposalHandled(proposalId, "approved");
            return { ok: true };
        }
        loadProposals();
        return { ok: false, message: res?.message || "Couldn't approve this proposal. Please try again." };
    }), [token, withBusy, applyProposalHandled, loadProposals]);

    const rejectProposal = useCallback((proposalId, reason = "") => withBusy(`proposal:${proposalId}`, async () => {
        let res = null;
        let threw = false;
        try { res = await apiRejectProposal(proposalId, String(reason || "").trim(), token); } catch { threw = true; }
        if (!threw && res?.success !== false) {
            applyProposalHandled(proposalId, "declined");
            return { ok: true };
        }
        loadProposals();
        return { ok: false, message: res?.message || "Couldn't decline this proposal. Please try again." };
    }), [token, withBusy, applyProposalHandled, loadProposals]);

    const value = useMemo(() => ({
        getAction, busy,
        confirmOrder, rejectOrder, approveProposal, rejectProposal,
        markOrderHandled, markProposalHandled,
        refresh, ordersVersion, transportVersion,
    }), [
        getAction, busy, confirmOrder, rejectOrder, approveProposal, rejectProposal,
        markOrderHandled, markProposalHandled, refresh, ordersVersion, transportVersion,
    ]);

    return <NotificationActionsContext.Provider value={value}>{children}</NotificationActionsContext.Provider>;
}