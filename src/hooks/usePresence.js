// hooks/usePresence.js
import { useEffect, useState, useCallback } from "react";
import { useSocket } from "../context/SocketContext.jsx";

export default function usePresence(userIds = []) {
    const { socket, connected } = useSocket();
    const [presenceMap, setPresenceMap] = useState({}); // userId -> { online, lastSeenAt }

    const refresh = useCallback(() => {
        if (!socket || !connected || userIds.length === 0) return;
        socket.emit("presence:query_many", userIds, (result) => {
            setPresenceMap((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(result).map(([id, online]) => [id, { ...prev[id], online }])) }));
        });
    }, [socket, connected, JSON.stringify(userIds)]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!socket) return;
        const onUpdate = ({ userId, online, lastSeenAt }) => {
            setPresenceMap((prev) => ({ ...prev, [userId]: { online, lastSeenAt: lastSeenAt || prev[userId]?.lastSeenAt } }));
        };
        socket.on("presence:update", onUpdate);
        return () => socket.off("presence:update", onUpdate);
    }, [socket]);

    return presenceMap;
}