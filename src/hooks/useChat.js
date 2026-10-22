// hooks/useChat.js
//
// All chat-related hooks live here together (messages, conversation list,
// presence) so the module count stays small and the shared bits — the
// message cache, the socket wiring pattern — sit next to each other
// instead of being re-derived per file.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import {
    fetchMessages, sendChatMessage, markConversationRead,
    deleteChatMessage, fetchConversations,
} from "../utils/chatApi.js";

import {
    fetchCreditStatus, requestCredit as requestCreditApi, decideCredit as decideCreditApi,
    toggleCredit as toggleCreditApi, updateCreditLimit as updateCreditLimitApi,
    requestCreditIncrease as requestCreditIncreaseApi,
    declineCreditIncrease as declineCreditIncreaseApi,
} from "../utils/api.js";

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

function previewFor(body) {
    if (!body) return "📎 Attachment";
    return body.length > 80 ? body.slice(0, 80) + "…" : body;
}

// ---------------------------------------------------------------------
// In-memory (per browser session) cache keyed by conversationId, so
// re-opening a recent thread paints instantly from cache while a
// background refetch quietly reconciles it ("stale while revalidate").
//
// `canSend` is cached too so a re-opened thread doesn't briefly flash
// "sending allowed" before the background refetch resolves.
// ---------------------------------------------------------------------
const messageCache = new Map(); // conversationId -> { entries, hasMore, cursor, watermarks, canSend }

// Warms the cache before the user even opens a thread (hover / touchstart
// on a list row, or the top few chats once the list loads). Safe to call
// repeatedly — it does nothing if the thread is already cached or loading.
const prefetching = new Set();
export function prefetchMessages(token, conversationId) {
    if (!token || !conversationId) return;
    if (messageCache.has(conversationId) || prefetching.has(conversationId)) return;
    prefetching.add(conversationId);
    fetchMessages(token, conversationId)
        .then((res) => {
            if (res?.success && !messageCache.has(conversationId)) {
                messageCache.set(conversationId, {
                    entries: res.messages.map((m) => [m.id, m]),
                    hasMore: res.hasMore,
                    cursor: res.oldestCursor || null,
                    watermarks: res.otherWatermarks || { deliveredAt: null, readAt: null },
                    canSend: res.canSend !== false,
                });
            }
        })
        .catch(() => { /* prefetch is best-effort */ })
        .finally(() => prefetching.delete(conversationId));
}

export default function useChatMessages(conversationId, otherUserId) {
    const { token, profile } = useAuth();
    const { socket, connected } = useSocket();
    const myId = profile?.id;

    const cached = conversationId ? messageCache.get(conversationId) : null;

    const [messageMap, setMessageMap] = useState(() => (cached ? new Map(cached.entries) : new Map()));
    const [otherWatermarks, setOtherWatermarks] = useState(() => cached?.watermarks || { deliveredAt: null, readAt: null });
    const [otherTyping, setOtherTyping] = useState(false);
    const [loading, setLoading] = useState(!cached);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);

    // DELETED-SELLER LOCKOUT
    // `canSend` mirrors the flag the server returns from GET /messages.
    // Starts `null` ("haven't heard from the server yet") — the composer
    // treats null the same as true so it doesn't flash disabled on open.
    // `sendError` surfaces the server's rejection message when a send
    // slips through anyway (stale client state, a race with the seller
    // being deleted mid-conversation).
    const [canSend, setCanSend] = useState(cached?.canSend ?? null);
    const [sendError, setSendError] = useState(null);

    const oldestCursorRef = useRef(cached?.cursor || null);
    const typingTimeoutRef = useRef(null);
    const isOpenRef = useRef(true);

    // Reset per-conversation state the moment the thread changes.
    // Done DURING render (not in an effect) so the new thread never shows
    // one frame of the previous thread's messages, and the write-through
    // cache effect below can never save old messages under the new id.
    const [prevConvId, setPrevConvId] = useState(conversationId);
    if (prevConvId !== conversationId) {
        const next = conversationId ? messageCache.get(conversationId) : null;
        setPrevConvId(conversationId);
        setMessageMap(next ? new Map(next.entries) : new Map());
        setOtherWatermarks(next?.watermarks || { deliveredAt: null, readAt: null });
        setHasMore(next?.hasMore ?? true);
        oldestCursorRef.current = next?.cursor || null;
        setLoading(!next);
        setOtherTyping(false);
        setCanSend(next?.canSend ?? null);
        setSendError(null);
    }

    const ackRead = useCallback(() => {
        if (!conversationId) return;
        if (socket && connected) socket.emit("read:ack", { conversationId });
        else markConversationRead(token, conversationId);
    }, [socket, connected, conversationId, token]);

    const ackDelivered = useCallback(() => {
        if (!conversationId) return;
        if (socket && connected) socket.emit("delivered:ack", { conversationId });
    }, [socket, connected, conversationId]);

    const upsert = useCallback((msg) => {
        setMessageMap((prev) => {
            // ORDERING: this is the single writer that governs where a
            // live-arriving message ends up, and it deliberately never
            // compares timestamps across sources (your own device clock
            // vs. the server's clock — those drift, routinely by seconds,
            // and comparing them is what used to make messages visibly
            // jump position). Instead:
            //   1. An entry that's genuinely NEW to this map (no matching
            //      id or client_message_id) is APPENDED to the end.
            //   2. An entry that MATCHES something already in the map
            //      (optimistic → confirmed swap, or any other update to a
            //      message we already know) is updated IN PLACE.
            // Anything already rendered never reorders once on screen.
            let matchedKey = null;
            for (const [k, v] of prev) {
                if (k === msg.id || (v.client_message_id && msg.client_message_id && v.client_message_id === msg.client_message_id)) {
                    matchedKey = k;
                    break;
                }
            }
            const next = new Map();
            if (matchedKey !== null) {
                for (const [k, v] of prev) {
                    next.set(k === matchedKey ? msg.id : k, k === matchedKey ? { ...v, ...msg } : v);
                }
            } else {
                for (const [k, v] of prev) next.set(k, v);
                next.set(msg.id, msg);
            }
            return next;
        });
    }, []);

    // initial fetch (or silent background revalidation if we hydrated from cache)
    useEffect(() => {
        if (!conversationId || !token) return;
        let cancelled = false;
        fetchMessages(token, conversationId).then((res) => {
            if (cancelled || !res?.success) return;
            setMessageMap((prev) => {
                const freshEntries = res.messages.map((m) => [m.id, m]);
                const freshIds = new Set(freshEntries.map(([id]) => id));
                const freshOldest = res.messages[0]?.created_at;

                // Anything left in `prev` after removing what the fresh
                // fetch already covers is either:
                //   - OLDER than the fetched page (paginated history from an
                //     earlier loadOlder()) → goes BEFORE the fresh page.
                //   - Not older (in-flight optimistic send, or newer than
                //     the server's response) → goes AFTER the fresh page.
                const older = [];
                const newer = [];
                prev.forEach((v, k) => {
                    if (freshIds.has(k)) return;
                    // an optimistic entry whose real copy is already in the
                    // fresh page (matched by client_message_id) is dropped
                    if (v.client_message_id && res.messages.some((m) => m.client_message_id && m.client_message_id === v.client_message_id)) return;
                    if (freshOldest && new Date(v.created_at) < new Date(freshOldest)) older.push([k, v]);
                    else newer.push([k, v]);
                });

                return new Map([...older, ...freshEntries, ...newer]);
            });
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.oldestCursor || null;
            if (res.otherWatermarks) setOtherWatermarks(res.otherWatermarks);
            setCanSend(res.canSend !== false);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [conversationId, token]);

    // write-through: keep the cache current so the next visit is instant
    useEffect(() => {
        if (!conversationId) return;
        messageCache.set(conversationId, {
            entries: Array.from(messageMap.entries()),
            hasMore,
            cursor: oldestCursorRef.current,
            watermarks: otherWatermarks,
            canSend,
        });
    }, [conversationId, messageMap, hasMore, otherWatermarks, canSend]);

    const loadOlder = useCallback(async () => {
        if (loadingOlder || !hasMore || !oldestCursorRef.current) return;
        setLoadingOlder(true);
        const res = await fetchMessages(token, conversationId, oldestCursorRef.current);
        if (res?.success) {
            setMessageMap((prev) => {
                // older batch first (Map insertion order = display order),
                // then the messages we already had layered on top.
                const next = new Map(res.messages.map((m) => [m.id, m]));
                prev.forEach((v, k) => next.set(k, v));
                return next;
            });
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.oldestCursor || oldestCursorRef.current;
            if (typeof res.canSend !== "undefined") setCanSend(res.canSend !== false);
        }
        setLoadingOlder(false);
    }, [conversationId, token, hasMore, loadingOlder]);

    // listeners attach once the socket is actually connected
    useEffect(() => {
        if (!socket || !connected || !conversationId) return;

        const onNew = (msg) => {
            if (msg.conversation_id !== conversationId) return;
            upsert(msg);
            if (msg.sender_id !== myId) {
                ackDelivered();
                if (isOpenRef.current) ackRead();
            }
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
        const onMessageUpdated = ({ conversationId: cid, messageId, metadataPatch }) => {
            if (cid !== conversationId) return;
            setMessageMap((prev) => {
                const m = prev.get(messageId);
                if (!m) return prev;
                const next = new Map(prev);
                next.set(messageId, { ...m, metadata: { ...m.metadata, ...metadataPatch } });
                return next;
            });
        };

        socket.on("message:new", onNew);
        socket.on("message:status", onStatus);
        socket.on("typing:update", onTyping);
        socket.on("message:deleted", onDeleted);
        socket.on("message:updated", onMessageUpdated);
        return () => {
            socket.off("message:new", onNew);
            socket.off("message:status", onStatus);
            socket.off("typing:update", onTyping);
            socket.off("message:deleted", onDeleted);
            socket.off("message:updated", onMessageUpdated);
        };
    }, [socket, connected, conversationId, myId, otherUserId, upsert, ackRead, ackDelivered]);

    // resync on regaining connection — covers "closed laptop, reopened
    // 10 minutes later" without a full page reload
    const prevConnectedRef = useRef(connected);
    useEffect(() => {
        if (connected && !prevConnectedRef.current && conversationId && token) {
            fetchMessages(token, conversationId).then((res) => {
                if (res?.success) {
                    setMessageMap((prev) => {
                        const next = new Map(prev);
                        // update-in-place for anything we already know
                        // about; anything genuinely new (missed while
                        // disconnected) appends at the end.
                        res.messages.forEach((m) => next.set(m.id, { ...next.get(m.id), ...m }));
                        return next;
                    });
                    if (res.otherWatermarks) setOtherWatermarks(res.otherWatermarks);
                    setCanSend(res.canSend !== false);
                }
            });
        }
        prevConnectedRef.current = connected;
    }, [connected, conversationId, token]);

    useEffect(() => {
        if (!conversationId || !token) return;
        isOpenRef.current = true;
        ackRead();
        return () => { isOpenRef.current = false; };
    }, [conversationId, token, ackRead]);

    // A message keeps its exact previous reference when its derived status
    // hasn't changed, so MessageBubble's memo() works and only the bubbles
    // that changed re-render. There is NO SORT here on purpose: order comes
    // purely from Map insertion order (see `upsert`).
    const messages = useMemo(
        () => Array.from(messageMap.values())
            .map((m) => {
                const status = statusFromWatermarks(m, myId, otherWatermarks);
                return m.status === status ? m : { ...m, status };
            }),
        [messageMap, myId, otherWatermarks],
    );

    // Optimistic send: the bubble appears instantly, then is swapped for the
    // server's copy IN PLACE (same position) when the request resolves.
    const send = useCallback(async (body) => {
        if (!body?.trim() || !conversationId) return;
        setSendError(null);
        const clientMessageId = makeClientMessageId();
        const tempId = `temp-${clientMessageId}`;
        upsert({
            id: tempId,
            conversation_id: conversationId,
            sender_id: myId,
            body: body.trim(),
            created_at: new Date().toISOString(),
            status: "sending",
            client_message_id: clientMessageId,
        });
        const res = await sendChatMessage(token, conversationId, body.trim(), null, clientMessageId);

        setMessageMap((prev) => {
            if (res?.success) {
                // In-place swap: rebuild the Map so the entry keeps its
                // position. The socket echo may already have swapped it.
                const rebuilt = new Map();
                let swapped = false;
                for (const [k, v] of prev) {
                    if (k === tempId) {
                        rebuilt.set(res.message.id, { ...v, ...res.message });
                        swapped = true;
                    } else if (k === res.message.id) {
                        if (!swapped) rebuilt.set(k, { ...v, ...res.message });
                    } else {
                        rebuilt.set(k, v);
                    }
                }
                if (!rebuilt.has(res.message.id)) rebuilt.set(res.message.id, { ...res.message });
                return rebuilt;
            }

            const next = new Map(prev);
            if (res?.code === "SELLER_DELETED") {
                // Correctly rejected, not a transient failure — remove the
                // optimistic bubble (retrying would fail the same way) and
                // lock the composer.
                next.delete(tempId);
                setCanSend(false);
                setSendError(res.message || "This seller's account has been deleted. You can no longer send messages here.");
            } else {
                // Keep the bubble but mark it failed so the person can retry.
                const existing = next.get(tempId);
                if (existing) next.set(tempId, { ...existing, status: "failed" });
            }
            return next;
        });
    }, [conversationId, token, myId, upsert]);

    const retry = useCallback((tempId) => {
        const existing = messageMap.get(tempId);
        if (!existing) return;
        setMessageMap((prev) => { const next = new Map(prev); next.delete(tempId); return next; });
        send(existing.body);
    }, [messageMap, send]);

    const deleteMessage = useCallback(async (messageId, scope) => {
        const previous = messageMap.get(messageId);
        if (!previous) return;
        setMessageMap((prev) => {
            const next = new Map(prev);
            if (scope === "everyone") {
                next.set(messageId, { ...previous, deleted_at: new Date().toISOString(), body: null, attachment_url: null });
            } else {
                next.delete(messageId);
            }
            return next;
        });
        const res = await deleteChatMessage(token, conversationId, messageId, scope);
        if (!res?.success) {
            // rollback — the delete didn't actually happen server-side
            setMessageMap((prev) => { const next = new Map(prev); next.set(messageId, previous); return next; });
        }
    }, [messageMap, token, conversationId]);

    const notifyTyping = useCallback((isTyping) => {
        if (!socket || !connected || !conversationId) return;
        clearTimeout(typingTimeoutRef.current);
        socket.emit(isTyping ? "typing:start" : "typing:stop", { conversationId });
        if (isTyping) typingTimeoutRef.current = setTimeout(() => socket.emit("typing:stop", { conversationId }), 3000);
    }, [socket, connected, conversationId]);

    return {
        messages, loading, loadingOlder, hasMore, loadOlder,
        send, retry, deleteMessage,
        otherTyping, notifyTyping, connected,
        canSend, sendError,
    };
}

// ---------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------
let conversationsCache = null; // { list } — module-level, survives remounts within the session

export function useConversations() {
    const { token, profile } = useAuth();
    const { socket } = useSocket();
    const myId = profile?.id;
    const [conversations, setConversations] = useState(conversationsCache?.list || []);
    const [loading, setLoading] = useState(!conversationsCache);
    const reloadTimerRef = useRef(null);

    const reload = useCallback(() => {
        if (!token) return;
        fetchConversations(token).then((res) => {
            if (res?.success) {
                setConversations(res.conversations);
                conversationsCache = { list: res.conversations };
            }
            setLoading(false);
        });
    }, [token]);

    useEffect(() => { reload(); }, [reload]);

    const scheduleReload = useCallback(() => {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(reload, 150);
    }, [reload]);

    useEffect(() => {
        if (!socket) return;

        // `message:new` already updates the list locally, so there's no
        // need to also refetch the whole list on `conversation:updated`
        // (that was a full round trip after every incoming message). A
        // brand-new conversation we don't know about yet still triggers a
        // reload via the idx === -1 branch.
        const onMessage = (payload) => {
            setConversations((prev) => {
                const idx = prev.findIndex((c) => c.id === payload.conversation_id);
                if (idx === -1) { scheduleReload(); return prev; }
                const incomingFromOther = payload.sender_id !== myId;
                const updated = {
                    ...prev[idx],
                    lastMessagePreview: previewFor(payload.body),
                    lastMessageIsMine: !incomingFromOther,
                    lastMessageAt: payload.created_at,
                    // bump the count, don't just flip a flag — ChatWindow
                    // zeroes it back to 0 via markLocalRead if this
                    // conversation happens to be open right now.
                    unreadCount: incomingFromOther ? (prev[idx].unreadCount || 0) + 1 : prev[idx].unreadCount,
                    unread: incomingFromOther ? true : prev[idx].unread,
                };
                const nextList = [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
                conversationsCache = { list: nextList };
                return nextList;
            });
        };
        socket.on("message:new", onMessage);
        return () => {
            clearTimeout(reloadTimerRef.current);
            socket.off("message:new", onMessage);
        };
    }, [socket, myId, scheduleReload]);

    const markLocalRead = useCallback((conversationId) => {
        setConversations((prev) => {
            const nextList = prev.map((c) => (c.id === conversationId ? { ...c, unread: false, unreadCount: 0 } : c));
            conversationsCache = { list: nextList };
            return nextList;
        });
    }, []);

    // Total unread MESSAGES across all conversations — this is what the
    // Chat nav badge shows.
    const unreadTotal = useMemo(
        () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
        [conversations]
    );

    return { conversations, loading, unreadTotal, reload, markLocalRead };
}

// ---------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------
export function usePresence(userIds = []) {
    const { socket, connected } = useSocket();
    const [presenceMap, setPresenceMap] = useState({}); // userId -> { online, lastSeenAt }

    const key = userIds.join(",");
    const refresh = useCallback(() => {
        if (!socket || !connected || userIds.length === 0) return;
        socket.emit("presence:query_many", userIds, (result) => {
            setPresenceMap((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(result).map(([id, online]) => [id, { ...prev[id], online }])) }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, connected, key]);

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


// One credit relationship, keyed off the OTHER user's profile id — role-agnostic,
// used by ChatWindow for both buyer and seller views of the same pinned bar.
export function useCredit(otherUserId) {
    const { token } = useAuth();
    const { socket, connected } = useSocket();
    const [credit, setCredit] = useState(null);
    const [viewerRole, setViewerRole] = useState(null);
    const [buyerInfo, setBuyerInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        if (!otherUserId || !token) return;
        setLoading(true);
        fetchCreditStatus(token, { otherUserId }).then((res) => {
            if (res?.success) {
                setCredit(res.credit);
                setViewerRole(res.viewerRole);
                setBuyerInfo(res.buyerInfo || null);
            }
            setLoading(false);
        });
    }, [otherUserId, token]);

    // Clear the previous thread's credit data the moment the other user
    // changes, so its role/banner/limit never flashes in the new thread.
    useEffect(() => {
        setCredit(null);
        setViewerRole(null);
        setBuyerInfo(null);
    }, [otherUserId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!socket || !connected) return;

        const onRequested = () => { load(); };
        const onDecided = () => { load(); };
        const onToggled = () => { load(); };

        socket.on("credit:requested", onRequested);
        socket.on("credit:decided", onDecided);
        socket.on("credit:toggled", onToggled);
        return () => {
            socket.off("credit:requested", onRequested);
            socket.off("credit:decided", onDecided);
            socket.off("credit:toggled", onToggled);
        };
    }, [socket, connected, load]);

    const request = useCallback(async () => {
        const res = await requestCreditApi(token, { sellerUserId: otherUserId });
        if (res?.success) load();
        return res;
    }, [token, otherUserId, load]);

    const decide = useCallback(async (creditId, decision, creditLimit) => {
        // optimistic — includes the limit so the strip never flashes "₹0 left of ₹0"
        setCredit((prev) => (prev ? {
            ...prev,
            status: decision,
            ...(decision === "approved" && creditLimit ? { credit_limit: creditLimit, credit_used: 0 } : {}),
        } : prev));
        const res = await decideCreditApi(token, creditId, decision, creditLimit);
        if (!res?.success) load();
        return res;
    }, [token, load]);

    const requestIncrease = useCallback(async (creditId) => {
        const res = await requestCreditIncreaseApi(token, creditId);
        if (res?.success) load();
        return res;
    }, [token, load]);

    const declineIncrease = useCallback(async (creditId, cooldownDays) => {
        const res = await declineCreditIncreaseApi(token, creditId, cooldownDays);
        load(); // pull the frozen message + cooldown regardless of outcome
        return res;
    }, [token, load]);

    const updateLimit = useCallback(async (creditId, newLimit, resetUsed) => {
        setCredit((prev) => (prev ? { ...prev, credit_limit: newLimit } : prev)); // optimistic
        const res = await updateCreditLimitApi(token, creditId, newLimit, resetUsed);
        load(); // pick up the server's authoritative row either way
        return res;
    }, [token, load]);

    const toggle = useCallback(async (enabled) => {
        setCredit((prev) => (prev ? { ...prev, status: enabled ? "approved" : "revoked" } : prev));
        const res = await toggleCreditApi(token, otherUserId, enabled);
        if (!res?.success) load();
        return res;
    }, [token, otherUserId, load]);

    return {
        credit, viewerRole, buyerInfo, loading,
        request, decide, toggle, updateLimit,
        requestIncrease, declineIncrease,
        reload: load,
    };
}