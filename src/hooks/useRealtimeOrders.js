// hooks/useRealtimeOrders.js
//
// Same root cause and same fix as useRealtimeOrder.js — see that file's
// header comment for the full explanation. In short: this subscribed to
// a dead Supabase Realtime channel via useAuth().subscribeUserEvent, but
// the backend only ever pushes order updates through Socket.IO
// (notifyUserOrdersChanged -> getIO().to(`user:${userId}`).emit("orders_changed", ...)).
// Nothing was ever actually delivered to the channel this listened on.
//
// Fix: subscribe on the real socket.io-client connection from
// SocketContext.jsx, same as useRealtimeNotifications.js already does
// successfully. `channelToken` is accepted-but-unused for backward
// compatibility with existing call sites (OrdersPage.jsx) — it's no
// longer needed since the socket already scopes events to the signed-in
// user via its own room join on the server.
//
// Also added the same tab-visibility resync safety net used elsewhere
// in the app (SellerManageListingsPage) and now in useRealtimeOrder.js.
import { useEffect, useCallback, useState, useRef } from "react";
import { useSocket } from "../context/SocketContext.jsx";

export default function useRealtimeOrders({ fetcher, channelToken }) { // eslint-disable-line no-unused-vars
    const { socket } = useSocket();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async (opts = {}) => {
        if (!opts.silent) setLoading(true);
        setError(null);
        try {
            setOrders((await fetcher()) || []);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }, [fetcher]);

    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!socket) return;
        const onOrdersChanged = () => loadRef.current({ silent: true });
        socket.on("orders_changed", onOrdersChanged);
        return () => socket.off("orders_changed", onOrdersChanged);
    }, [socket]);

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

    return { orders, loading, error, reload: load };
}