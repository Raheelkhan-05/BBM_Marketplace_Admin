// hooks/useConversations.js
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { fetchConversations } from "../utils/chatApi.js";

export default function useConversations() {
    const { token } = useAuth();
    const { socket } = useSocket();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        if (!token) return;
        fetchConversations(token).then((res) => {
            if (res?.success) setConversations(res.conversations);
            setLoading(false);
        });
    }, [token]);

    useEffect(() => { reload(); }, [reload]);

    useEffect(() => {
        if (!socket) return;
        // targeted refresh, not a full-list reload storm on every keystroke
        // of activity — debounced trailing edge is enough for an inbox list
        let t;
        const onUpdate = () => { clearTimeout(t); t = setTimeout(reload, 150); };
        socket.on("message:new", onUpdate);
        socket.on("conversation:updated", onUpdate);
        return () => {
            clearTimeout(t);
            socket.off("message:new", onUpdate);
            socket.off("conversation:updated", onUpdate);
        };
    }, [socket, reload]);

    return { conversations, loading, unreadTotal: conversations.filter((c) => c.unread).length, reload };
}