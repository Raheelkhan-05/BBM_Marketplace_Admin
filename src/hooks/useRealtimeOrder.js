// hooks/useRealtimeOrder.js
//
// FIX (real bug, not the transport-mode one): this used to subscribe via
// useAuth().subscribeUserEvent, which is wired to a Supabase Realtime
// broadcast channel (see AuthContext.jsx: supabase.channel(`user-${chanToken}`)).
// Nothing on the backend ever publishes to Supabase Realtime — every
// order-status push actually goes out through this app's own Socket.IO
// server instead (services/realtimeBroadcast.js's notifyOrderChanged /
// notifyUserOrdersChanged, both calling getIO().to(`user:${userId}`).emit(...)).
// Those are two separate pub/sub systems that never talk to each other,
// so this hook was subscribed to a channel nothing could ever reach —
// the DB write and the notification-bell toast (which goes through the
// real socket via useRealtimeNotifications.js) landed instantly, but
// this hook never heard about it.
//
// Fix: subscribe directly on the same socket.io-client connection chat
// and notifications already use successfully (SocketContext.jsx /
// useRealtimeNotifications.js) — same pattern, no new plumbing.
//
// Also added: the same tab-visibility "resync" safety net
// SellerManageListingsPage already relies on. A broadcast over a
// websocket can always be missed (backgrounded tab, laptop sleep, brief
// network loss) — this guarantees the page is never more than a
// reconnect/focus away from correct, without needing a separate
// per-order Socket.IO room with its own join/leave lifecycle.
import { useEffect, useCallback, useState, useRef } from "react";
import { useSocket } from "../context/SocketContext.jsx";

export default function useRealtimeOrder({ orderId, fetcher }) {
    const { socket } = useSocket();
    const [order, setOrder] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (opts = {}) => {
        if (!orderId) return;
        if (!opts.silent) setLoading(true);
        try {
            const res = await fetcher(orderId);
            setOrder(res?.order || null);
            setEvents(res?.events || []);
        } finally {
            setLoading(false);
        }
    }, [orderId, fetcher]);

    // Kept in a ref so the socket/visibility listeners below can always
    // call the LATEST load() without needing to be torn down and
    // re-attached every time `fetcher`/`orderId` identity changes.
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);

    useEffect(() => { load(); }, [load]);

    // Live updates: the backend emits "orders_changed" to the current
    // user's own room (`user:${userId}`) on every status transition
    // (place, cancel, confirm/reject/process/ship/deliver). Reloading
    // this one order on any "orders_changed" event is cheap.
    useEffect(() => {
        if (!socket) return;
        const onOrdersChanged = () => loadRef.current({ silent: true });
        socket.on("orders_changed", onOrdersChanged);
        return () => socket.off("orders_changed", onOrdersChanged);
    }, [socket]);

    // Safety net — catches anything missed while the tab was backgrounded
    // or the socket briefly dropped.
    useEffect(() => {
        function onVisible() {
            if (document.visibilityState === "visible") loadRef.current({ silent: true });
        }
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        window.addEventListener("online", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
            window.removeEventListener("online", onVisible);
        };
    }, []);

    return { order, events, loading, reload: load };
}