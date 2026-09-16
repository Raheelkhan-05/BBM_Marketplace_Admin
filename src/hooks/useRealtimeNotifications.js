// hooks/useRealtimeNotifications.js
import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { fetchNotifications, markNotificationRead as apiMarkRead, markAllNotificationsRead as apiMarkAllRead } from "../utils/api.js";

export default function useRealtimeNotifications({ token, onNewNotification }) {
    const { socket } = useSocket();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        const res = await fetchNotifications(token);
        if (res?.success) setNotifications(res.notifications || []);
        setLoading(false);
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const onNewRef = useRef(onNewNotification);
    useEffect(() => { onNewRef.current = onNewNotification; }, [onNewNotification]);

    // THE FIX: listen on the same socket chat already uses, not a
    // separate (broken) realtime channel.
    useEffect(() => {
        if (!socket) return;
        const onNotif = (payload) => {
            setNotifications((prev) => (payload?.id && prev.some((n) => n.id === payload.id) ? prev : [payload, ...prev]));
            onNewRef.current?.(payload); // <- this is what fires the toast island + sound in NotificationBell
        };
        socket.on("notification:new", onNotif);
        return () => socket.off("notification:new", onNotif);
    }, [socket]);

    const markRead = async (id) => { setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))); await apiMarkRead(token, id); };
    const markAllRead = async () => { setNotifications((p) => p.map((n) => ({ ...n, read: true }))); await apiMarkAllRead(token); };

    return { notifications, unreadCount: notifications.filter((n) => !n.read).length, loading, markRead, markAllRead, reload: load };
}