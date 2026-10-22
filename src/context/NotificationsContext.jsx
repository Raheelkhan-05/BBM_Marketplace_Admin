// context/NotificationsContext.jsx
//
// Single source of truth for notifications, shared by NotificationBell,
// the "My Orders" nav badge (Header + BottomNavStrip), the Purchase/Sales
// tab counts on OrdersPage, and OrderNotificationToast — so there's one
// fetch + one socket subscription instead of each of those re-doing it.
//
// Notifications are split into buckets by LINK (see
// utils/notificationTypes.js for why link and not `type`):
//   - "order" notifications (purchase + sales) never appear in the bell,
//     and toast from the center of the screen (OrderNotificationToast).
//   - credit notifications never appear in the bell; they toast via
//     CreditNotificationToast (subscribeCredit).
//   - everything else stays in the bell dropdown and keeps the existing
//     bell-origin toast (NotificationIsland).
//
// The bell itself is admin-only (see Header.jsx). Non-admin users should
// neither see the bell nor be interrupted by it, so its sound and its
// toast/dropdown dispatch are both gated on profile.role === "admin" here
// — notifications are still fetched/stored/markable for everyone, just
// not surfaced through the bell's UI for non-admins.
//
// TEAM MODE: a team member is signed in as the company, so they share the company's notification
// list. Two team-only notification types are audience-limited here (see audienceOk).
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import { fetchNotifications, markNotificationRead as apiMarkRead, markAllNotificationsRead as apiMarkAllRead } from "../utils/api.js";
import { playNotificationSound } from "../utils/notificationSound.js";
import {
    isOrderNotification, isPurchaseOrderNotification, isSalesOrderNotification, isChatNotification,
    isListingsSectionNotification, isAutoApprovedListingNotification,
    isListingApprovedNotification, isListingRejectedNotification,
    isWalletTopupNotification, isWalletLowBalanceNotification,
    extractHighlightId, orderIdFromLink, isTransportProposalNotification,
    isCreditNotification,
} from "../utils/notificationTypes.js";


const NotificationsContext = createContext(null);

export function useNotifications() {
    const ctx = useContext(NotificationsContext);
    if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
    return ctx;
}

// TEAM: who a team-only notification is meant for.
//   team_seller_enabled -> members only ("your team can now sell"); the admin did it, so no extra message.
//   team_member_joined  -> the admin only.
function audienceOk(n, teamRole) {
    if (n?.type === "team_seller_enabled") return teamRole === "member";
    if (n?.type === "team_member_joined") return teamRole !== "member";
    return true;
}

export function NotificationsProvider({ children }) {
    const { token, profile } = useAuth();
    const isAdmin = profile?.role === "admin";
    const teamRole = profile?.team ? (profile.team.isAdmin ? "admin" : "member") : "solo";
    const teamRoleRef = useRef(teamRole);
    teamRoleRef.current = teamRole;
    const { socket } = useSocket();
    const [allNotifications, setAllNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    // Everything below this line works off the audience-filtered list.
    const notifications = useMemo(
        () => allNotifications.filter((n) => audienceOk(n, teamRole)),
        [allNotifications, teamRole]
    );

    // Callback registries for "a new notification of this kind just
    // arrived" — NotificationBell subscribes to non-order, and
    // OrderNotificationToast subscribes to order, so each can run its own
    // one-at-a-time toast queue without both listening to the raw socket.
    const nonOrderListenersRef = useRef(new Set());
    const orderListenersRef = useRef(new Set());
    const chatListenersRef = useRef(new Set());
    const creditListenersRef = useRef(new Set());

    const announcedRef = useRef(new Set());   // ids already toasted / sounded
    const firstLoadDoneRef = useRef(false);

    const announceCredit = useCallback((n) => {
        if (!n?.id || announcedRef.current.has(n.id)) return;
        announcedRef.current.add(n.id);
        playNotificationSound();
        creditListenersRef.current.forEach((cb) => cb(n)); // CreditNotificationToast
    }, []);

    const load = useCallback(async () => {
        if (!token) { setAllNotifications([]); setLoading(false); firstLoadDoneRef.current = false; return; }
        setLoading(true);
        const res = await fetchNotifications(token);
        if (res?.success) {
            const list = res.notifications || [];
            if (!firstLoadDoneRef.current) {
                // first load = history, never announce it
                list.forEach((n) => announcedRef.current.add(n.id));
                firstLoadDoneRef.current = true;
            } else {
                list.filter((n) => isCreditNotification(n) && !n.read).forEach(announceCredit);
            }
            setAllNotifications(list);
        }
        setLoading(false);
    }, [token, announceCredit]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!socket) return;
        const onNotif = (payload) => {
            if (!payload?.id) return;
            if (isCreditNotification(payload)) {
                setAllNotifications((prev) => (prev.some((n) => n.id === payload.id) ? prev : [payload, ...prev]));
                announceCredit(payload);
                return;
            }
            if (isChatNotification(payload)) {
                chatListenersRef.current.forEach((cb) => cb(payload));
                return;
            }
            // Auto-approvals never needed a human review — don't count them
            // anywhere, don't toast them, don't store them.
            if (isAutoApprovedListingNotification(payload)) return;

            setAllNotifications((prev) => (prev.some((n) => n.id === payload.id) ? prev : [payload, ...prev]));

            // Stored (so counts/history stay right if the role changes) but never sounded or toasted
            // for someone it isn't addressed to.
            if (!audienceOk(payload, teamRoleRef.current)) return;

            const isOrder = isOrderNotification(payload);
            const isTransportProposal = isTransportProposalNotification(payload);
            const routeAsOrder = isOrder || isTransportProposal;

            // Bell notifications (sound + toast/dropdown dispatch) are
            // admin-only. Order-style notifications toast center-screen for everyone.
            if (routeAsOrder || isAdmin) playNotificationSound();

            const targets = routeAsOrder ? orderListenersRef.current : nonOrderListenersRef.current;
            // Listings/wallet notifications still get stored (so markRead/history
            // work) but never dispatched to the bell's own toast/dropdown listeners.
            if (!isListingsSectionNotification(payload) && (routeAsOrder || isAdmin)) {
                targets.forEach((cb) => cb(payload));
            }
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket, isAdmin, announceCredit]);

    const subscribeChat = useCallback((cb) => {
        chatListenersRef.current.add(cb);
        return () => chatListenersRef.current.delete(cb);
    }, []);

    const subscribeNonOrder = useCallback((cb) => {
        nonOrderListenersRef.current.add(cb);
        return () => nonOrderListenersRef.current.delete(cb);
    }, []);
    const subscribeOrder = useCallback((cb) => {
        orderListenersRef.current.add(cb);
        return () => orderListenersRef.current.delete(cb);
    }, []);
    const subscribeCredit = useCallback((cb) => {
        creditListenersRef.current.add(cb);
        return () => creditListenersRef.current.delete(cb);
    }, []);

    const markRead = useCallback(async (id) => {
        setAllNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        await apiMarkRead(token, id);
    }, [token]);

    const markAllRead = useCallback(async () => {
        setAllNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        await apiMarkAllRead(token);
    }, [token]);

    // Marks every unread notification pointing at this order as read —
    // called by OrderDetailPage / SellerOrderDetailPage on open. An order
    // can accumulate several notifications with the SAME link over its
    // lifecycle (confirmed, shipped, delivered all reuse "/orders/:id"),
    // so this clears all of them at once, not just one.
    const markOrderRead = useCallback(async (orderId, role) => {
        if (!orderId) return;
        const isMine = role === "seller" ? isSalesOrderNotification : isPurchaseOrderNotification;
        const matches = (n) => isMine(n) && orderIdFromLink(n.link) === String(orderId);
        const toMark = notifications.filter((n) => !n.read && matches(n));
        if (toMark.length === 0) return;
        setAllNotifications((prev) => prev.map((n) => (matches(n) ? { ...n, read: true } : n)));
        await Promise.all(toMark.map((n) => apiMarkRead(token, n.id)));
    }, [notifications, token]);

    // bellNotifications — exclude orders/chat/credit/listings/wallet
    const bellNotifications = useMemo(
        () => notifications.filter((n) => !isOrderNotification(n) && !isChatNotification(n) && !isCreditNotification(n) && !isListingsSectionNotification(n)),
        [notifications]
    );

    const listingApprovalUnreadCount = useMemo(
        () => notifications.filter((n) => isListingApprovedNotification(n) && !n.read).length,
        [notifications]
    );
    const listingRejectionUnreadCount = useMemo(
        () => notifications.filter((n) => isListingRejectedNotification(n) && !n.read).length,
        [notifications]
    );
    const walletTopupUnreadCount = useMemo(
        () => notifications.filter((n) => isWalletTopupNotification(n) && !n.read).length,
        [notifications]
    );
    // Deliberately NOT count-based — see ListingsContext for why the low-
    // balance badge is driven by live wallet state instead of read status.
    const unreadWalletLowBalanceNotifications = useMemo(
        () => notifications.filter((n) => isWalletLowBalanceNotification(n) && !n.read),
        [notifications]
    );

    // Clears every unread listing approval/rejection notification, and
    // returns the submission ids they pointed at so the caller can flash
    // those specific rows. Called once by SellerManageListingsPage on mount.
    const markListingsViewed = useCallback(async () => {
        const toMark = notifications.filter((n) => !n.read && (isListingApprovedNotification(n) || isListingRejectedNotification(n)));
        if (!toMark.length) return [];
        const ids = toMark.map((n) => extractHighlightId(n.link)).filter(Boolean);
        setAllNotifications((prev) => prev.map((n) => (toMark.includes(n) ? { ...n, read: true } : n)));
        await Promise.all(toMark.map((n) => apiMarkRead(token, n.id)));
        return ids;
    }, [notifications, token]);

    const markWalletTopupViewed = useCallback(async () => {
        const toMark = notifications.filter((n) => !n.read && isWalletTopupNotification(n));
        if (!toMark.length) return;
        setAllNotifications((prev) => prev.map((n) => (toMark.includes(n) ? { ...n, read: true } : n)));
        await Promise.all(toMark.map((n) => apiMarkRead(token, n.id)));
    }, [notifications, token]);

    const creditUnreadCount = useMemo(
        () => notifications.filter((n) => isCreditNotification(n) && !n.read).length,
        [notifications]
    );

    const markCreditViewed = useCallback(async () => {
        const toMark = notifications.filter((n) => !n.read && isCreditNotification(n));
        if (!toMark.length) return;
        setAllNotifications((prev) => prev.map((n) => (toMark.includes(n) ? { ...n, read: true } : n)));
        await Promise.all(toMark.map((n) => apiMarkRead(token, n.id)));
    }, [notifications, token]);

    const bellUnreadCount = useMemo(() => bellNotifications.filter((n) => !n.read).length, [bellNotifications]);
    const purchaseUnreadCount = useMemo(
        () => notifications.filter((n) => isPurchaseOrderNotification(n) && !n.read).length,
        [notifications]
    );
    const salesUnreadCount = useMemo(
        () => notifications.filter((n) => isSalesOrderNotification(n) && !n.read).length,
        [notifications]
    );

    const transportProposalNotification = useMemo(
        () => notifications.filter((n) => isTransportProposalNotification(n) && !n.read).length,
        [notifications]
    );

    const purchaseOrderUnreadCounts = useMemo(() => {
        const map = new Map();
        for (const n of notifications) {
            if (n.read || !isPurchaseOrderNotification(n)) continue;
            const oid = orderIdFromLink(n.link);
            if (oid) map.set(oid, (map.get(oid) || 0) + 1);
        }
        return map;
    }, [notifications]);

    const salesOrderUnreadCounts = useMemo(() => {
        const map = new Map();
        for (const n of notifications) {
            if (n.read || !isSalesOrderNotification(n)) continue;
            const oid = orderIdFromLink(n.link);
            if (oid) map.set(oid, (map.get(oid) || 0) + 1);
        }
        return map;
    }, [notifications]);

    const orderUnreadCount = purchaseUnreadCount + salesUnreadCount;

    const value = {
        notifications, loading, reload: load,
        bellNotifications, bellUnreadCount,
        purchaseUnreadCount, salesUnreadCount, orderUnreadCount,
        purchaseOrderUnreadCounts, salesOrderUnreadCounts,
        markRead, markAllRead, markOrderRead,
        creditUnreadCount, markCreditViewed,
        subscribeNonOrder, subscribeOrder, subscribeChat, subscribeCredit,
        listingApprovalUnreadCount, listingRejectionUnreadCount,
        walletTopupUnreadCount, unreadWalletLowBalanceNotifications,
        markListingsViewed, markWalletTopupViewed, transportProposalNotification
    };

    return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}