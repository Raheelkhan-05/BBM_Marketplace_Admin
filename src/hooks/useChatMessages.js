// hooks/useChatMessages.js
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { fetchMessages, sendChatMessage, markConversationRead } from "../utils/chatApi.js";

function makeClientMessageId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function statusFromWatermarks(message, myId, wm) {
    if (message.sender_id !== myId) return undefined;
    if (!wm) return "sent";
    const t = new Date(message.created_at).getTime();
    if (wm.readAt && new Date(wm.readAt).getTime() >= t) return "read";
    if (wm.deliveredAt && new Date(wm.deliveredAt).getTime() >= t) return "delivered";
    return "sent";
}

export default function useChatMessages(conversationId, otherUserId) {
    const { token, profile } = useAuth();
    const { socket, connected } = useSocket();
    const myId = profile?.id;

    const [messageMap, setMessageMap] = useState(new Map());
    const [otherWatermarks, setOtherWatermarks] = useState({ deliveredAt: null, readAt: null });
    const [otherTyping, setOtherTyping] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [roomJoined, setRoomJoined] = useState(false);

    const oldestCursorRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const isOpenRef = useRef(true);

    const upsert = useCallback((msg) => {
        setMessageMap((prev) => {
            // dedup on BOTH server id and client_message_id — covers the
            // optimistic-bubble-reconciliation case AND the "same message
            // arrives via socket AND via the HTTP response" race.
            const next = new Map(prev);
            for (const [k, v] of next) {
                if (v.client_message_id && v.client_message_id === msg.client_message_id) next.delete(k);
            }
            next.set(msg.id, { ...next.get(msg.id), ...msg });
            return next;
        });
    }, []);

    useEffect(() => {
        if (!conversationId || !token) return;
        let cancelled = false;
        setLoading(true);
        fetchMessages(token, conversationId).then((res) => {
            if (cancelled || !res?.success) return;
            setMessageMap(new Map(res.messages.map((m) => [m.id, m])));
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.messages[0]?.created_at || null;
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [conversationId, token]);


    const loadOlder = useCallback(async () => {
        if (loadingOlder || !hasMore || !oldestCursorRef.current) return;
        setLoadingOlder(true);
        const res = await fetchMessages(token, conversationId, oldestCursorRef.current);
        if (res?.success) {
            setMessageMap((prev) => {
                const next = new Map(res.messages.map((m) => [m.id, m]));
                prev.forEach((v, k) => next.set(k, v));
                return next;
            });
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.messages[0]?.created_at || oldestCursorRef.current;
        }
        setLoadingOlder(false);
    }, [conversationId, token, hasMore, loadingOlder]);

    // THE FIX: depend on `connected`, not just presence of `socket`. A
    // stable-but-not-yet-connected socket object passes `if (!socket)`
    // fine and this effect would silently never re-run once it actually
    // connects, if connected weren't in the deps.

    // listeners just attach once the socket is connected.
    useEffect(() => {
        if (!socket || !connected || !conversationId) return;

        const onNew = (msg) => {
            if (msg.conversation_id !== conversationId) return;
            upsert(msg);
            if (msg.sender_id !== myId && isOpenRef.current) markConversationRead(token, conversationId);
        };

        const onStatus = ({ conversationId: cid, deliveredAt, readAt }) => {
            if (cid !== conversationId) return;
            setOtherWatermarks((prev) => ({ deliveredAt: deliveredAt || prev.deliveredAt, readAt: readAt || prev.readAt }));
        };
        const onTyping = ({ conversationId: cid, userId, typing }) => {
            if (cid !== conversationId || userId !== otherUserId) return;
            setOtherTyping(typing);
        };
        const onDeleted = ({ conversationId: cid, messageId, scope }) => {
            if (cid !== conversationId) return;
            if (scope === "everyone") {
                setMessageMap((prev) => {
                    const next = new Map(prev);
                    const m = next.get(messageId);
                    if (m) next.set(messageId, { ...m, deleted_at: new Date().toISOString(), body: null, attachment_url: null });
                    return next;
                });
            } else {
                setMessageMap((prev) => { const next = new Map(prev); next.delete(messageId); return next; });
            }
        };

        socket.on("message:new", onNew);
        socket.on("message:status", onStatus);
        socket.on("typing:update", onTyping);
        socket.on("message:deleted", onDeleted);
        return () => {
            socket.off("message:new", onNew);
            socket.off("message:status", onStatus);
            socket.off("typing:update", onTyping);
            socket.off("message:deleted", onDeleted);
        };
    }, [socket, connected, conversationId, myId, otherUserId, token, upsert]);

    // resync on regaining connection — covers "closed laptop, reopened
    // 10 minutes later" without a full page reload
    const prevConnectedRef = useRef(connected);
    useEffect(() => {
        if (connected && !prevConnectedRef.current && conversationId && token) {
            fetchMessages(token, conversationId).then((res) => {
                if (res?.success) setMessageMap((prev) => {
                    const next = new Map(prev);
                    res.messages.forEach((m) => next.set(m.id, m));
                    return next;
                });
            });
        }
        prevConnectedRef.current = connected;
    }, [connected, conversationId, token]);

    useEffect(() => {
        if (!conversationId || !token) return;
        isOpenRef.current = true;
        markConversationRead(token, conversationId);
        return () => { isOpenRef.current = false; };
    }, [conversationId, token]);

    const messages = Array.from(messageMap.values())
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((m) => ({ ...m, status: statusFromWatermarks(m, myId, otherWatermarks) }));

    const send = useCallback(async (body) => {
        if (!body?.trim() || !conversationId) return;
        setSending(true);
        const clientMessageId = makeClientMessageId();
        const tempId = `temp-${clientMessageId}`;
        upsert({ id: tempId, conversation_id: conversationId, sender_id: myId, body: body.trim(), created_at: new Date().toISOString(), status: "sending", client_message_id: clientMessageId });
        const res = await sendChatMessage(token, conversationId, body.trim(), null, clientMessageId);
        setSending(false);
        setMessageMap((prev) => {
            const next = new Map(prev);
            next.delete(tempId);
            if (res?.success) next.set(res.message.id, res.message);
            return next;
        });
    }, [conversationId, token, myId, upsert]);

    const notifyTyping = useCallback((isTyping) => {
        if (!socket || !connected || !conversationId) return;
        clearTimeout(typingTimeoutRef.current);
        socket.emit(isTyping ? "typing:start" : "typing:stop", { conversationId });
        if (isTyping) typingTimeoutRef.current = setTimeout(() => socket.emit("typing:stop", { conversationId }), 3000);
    }, [socket, connected, conversationId]);

    return { messages, loading, loadingOlder, hasMore, loadOlder, send, sending, otherTyping, notifyTyping, connected, roomJoined };
}