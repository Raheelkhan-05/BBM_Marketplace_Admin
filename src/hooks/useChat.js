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
    requestCreditIncrease as requestCreditIncreaseApi,     // NEW
    declineCreditIncrease as declineCreditIncreaseApi,     // NEW
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
// PERFORMANCE FIX: opening a conversation used to always show a blocking
// spinner and wait on a fresh network round trip, even for a thread you
// had open thirty seconds ago. This is a tiny in-memory (per browser
// session) cache keyed by conversationId so re-opening a recent thread
// paints instantly from cache while a background refetch quietly
// reconciles it — the same "stale while revalidate" feel WhatsApp Web
// has when you flip between chats.
//
// `canSend` is cached too now (see DELETED-SELLER LOCKOUT below) so a
// re-opened thread doesn't briefly flash "sending allowed" before the
// background refetch resolves — it inherits the last known value first.
// ---------------------------------------------------------------------
const messageCache = new Map(); // conversationId -> { entries, hasMore, cursor, watermarks, canSend }

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
    const [sending, setSending] = useState(false);

    // ---------------------------------------------------------------
    // DELETED-SELLER LOCKOUT
    // `canSend` mirrors the `canSend` flag the server now returns from
    // GET /messages (see chat.controller.js listMessages) — it's the
    // authoritative, freshly-checked-on-every-load answer to "is the
    // other party's account still active", as opposed to the
    // conversations-list flag ChatWindow also checks, which is only as
    // fresh as the last conversations reload. Starts `null` (not `true`
    // or `false`) so ChatWindow can tell "haven't heard from the server
    // yet" apart from "server confirmed sending is fine" — the composer
    // treats null the same as true (not locked) so it doesn't flash
    // disabled on every open, but a component that cares about the
    // distinction can still see it.
    //
    // `sendError` surfaces the server's rejection message when a send
    // slips through anyway (stale client state, a race with the seller
    // being deleted mid-conversation) so the person sees exactly why it
    // failed instead of a generic error or a silently vanished message.
    // ---------------------------------------------------------------
    const [canSend, setCanSend] = useState(cached?.canSend ?? null);
    const [sendError, setSendError] = useState(null);

    const oldestCursorRef = useRef(cached?.cursor || null);
    const typingTimeoutRef = useRef(null);
    const isOpenRef = useRef(true);

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
            // vs. the server's clock for the other person's messages —
            // those two clocks drift, routinely by seconds, and any
            // comparison between them is exactly what used to cause a
            // message to visibly jump position after the fact). Instead:
            //   1. An entry that's genuinely NEW to this map (no
            //      matching id or client_message_id) is APPENDED to the
            //      end — i.e. placed last in Map insertion order, full
            //      stop, no timestamp comparison of any kind.
            //   2. An entry that MATCHES something already in the map
            //      (the optimistic → confirmed swap, or any other
            //      update to a message we already know about) is
            //      updated IN PLACE, at its existing position — it never
            //      moves.
            // Anything already rendered therefore never reorders once
            // it's on screen; a new message from either side always
            // lands at the bottom, in the order the client became aware
            // of it. Ordering for already-loaded history (initial fetch,
            // pagination) is untouched — it comes pre-ordered from the
            // server and is preserved by Map insertion order below.
            //
            // Downstream, the `messages` useMemo does NOT re-sort this —
            // it trusts Map iteration order completely. That pairing is
            // what makes this fix actually hold; see the comment there.
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

    // reset per-conversation transient state whenever the thread changes
    useEffect(() => {
        const next = conversationId ? messageCache.get(conversationId) : null;
        setMessageMap(next ? new Map(next.entries) : new Map());
        setOtherWatermarks(next?.watermarks || { deliveredAt: null, readAt: null });
        setHasMore(next?.hasMore ?? true);
        oldestCursorRef.current = next?.cursor || null;
        setLoading(!next);
        setOtherTyping(false);
        setCanSend(next?.canSend ?? null);
        setSendError(null);
    }, [conversationId]);

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

                // Anything left over in `prev` after removing what the fresh
                // fetch already covers falls into two buckets:
                //   - OLDER than the fetched page: this is paginated history
                //     from a previous loadOlder() call that the cache still
                //     had, but this fetch (always just "latest 30") doesn't
                //     include. It belongs BEFORE the fresh page.
                //   - Not older (an in-flight optimistic send, or genuinely
                //     newer than anything the server just returned): belongs
                //     AFTER the fresh page, same as before.
                // Blindly appending everything here (the old behavior) is
                // what let older cached history get shoved below "Today" —
                // this is the fix for that.
                const older = [];
                const newer = [];
                prev.forEach((v, k) => {
                    if (freshIds.has(k)) return; // fresh copy wins, already in freshEntries
                    if (freshOldest && new Date(v.created_at) < new Date(freshOldest)) older.push([k, v]);
                    else newer.push([k, v]);
                });

                return new Map([...older, ...freshEntries, ...newer]);
            });
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.oldestCursor || null;
            if (res.otherWatermarks) setOtherWatermarks(res.otherWatermarks);
            // Server re-checks this on every load, so it's always the
            // freshest signal available — a `false` here means the other
            // party's account is currently deleted, `true`/`undefined`
            // (older backends that don't send this field yet) means
            // sending is fine.
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
                // then the messages we already had layered on top —
                // preserves correct chronological order without a sort.
                const next = new Map(res.messages.map((m) => [m.id, m]));
                prev.forEach((v, k) => next.set(k, v));
                return next;
            });
            setHasMore(res.hasMore);
            oldestCursorRef.current = res.oldestCursor || oldestCursorRef.current;
            // a loadOlder response carries the same fresh canSend value —
            // no reason to ignore it just because this was a pagination
            // call rather than the initial load.
            if (typeof res.canSend !== "undefined") setCanSend(res.canSend !== false);
        }
        setLoadingOlder(false);
    }, [conversationId, token, hasMore, loadingOlder]);

    // listeners attach once the socket is actually connected — a
    // stable-but-not-yet-connected socket object passes `if (!socket)`
    // fine, so `connected` has to be in the deps or this would silently
    // never re-run once the handshake finished.
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
        socket.on("message:updated", onMessageUpdated);

        socket.on("message:new", onNew);
        socket.on("message:status", onStatus);
        socket.on("typing:update", onTyping);
        socket.on("message:deleted", onDeleted);
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
                        // disconnected) appends at the end — same
                        // append-only/no-reorder rule as `upsert`.
                        res.messages.forEach((m) => next.set(m.id, { ...next.get(m.id), ...m }));
                        return next;
                    });
                    if (res.otherWatermarks) setOtherWatermarks(res.otherWatermarks);
                    // a reconnect is exactly the kind of moment the other
                    // party's account could have been deleted while this
                    // tab was disconnected — resync the flag too.
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

    // ---------------------------------------------------------------
    // UI-STABILITY FIX (unchanged from before): this used to unconditionally
    // spread every message into a brand-new object on every recompute —
    // `{ ...m, status }` ran for ALL messages any time `otherWatermarks`
    // changed, even though a watermark update only ever changes the status
    // of messages sent by the CURRENT user, and typically only the most
    // recent one or two. Every message therefore got a new object identity
    // on every read/delivered receipt, which defeats MessageBubble's
    // React.memo() and forces the whole thread to re-render (and,
    // previously, replay its layout animation) on every tick update. Now a
    // message keeps its exact previous reference when its derived status
    // hasn't changed, so memo() actually works and only the bubble(s) that
    // changed re-render.
    //
    // ORDERING FIX (root-cause fix, replaces the earlier sort_key
    // approach): there is NO SORT here anymore, on purpose. The previous
    // version sorted by a frozen `sort_key` (falling back to created_at)
    // on every render — but that re-introduced the exact bug it was
    // trying to fix, because it still compared timestamps ACROSS
    // sources: your own optimistic message stamped with your DEVICE'S
    // clock, versus the other person's message stamped with the
    // SERVER's clock. Any clock skew between the two (routine — phones
    // drift by seconds) meant that comparison was unreliable, and
    // whichever message resolved its comparison differently could
    // "correct" its position after the fact — a visible jump.
    //
    // The actual fix: don't derive order from timestamps at all. Order
    // comes purely from Map iteration order (= insertion order), which
    // `upsert`, the initial fetch, `loadOlder`, and the resync effect
    // above already construct correctly on their own (older history
    // prepended, brand-new messages appended at the end, matches updated
    // in place, never reordered). Trusting that order here — instead of
    // re-deriving it from timestamps — is what makes the append-only,
    // never-reorder guarantee actually hold end to end.
    // ---------------------------------------------------------------
    const messages = useMemo(
        () => Array.from(messageMap.values())
            .map((m) => {
                const status = statusFromWatermarks(m, myId, otherWatermarks);
                return m.status === status ? m : { ...m, status };
            }),
        [messageMap, myId, otherWatermarks],
    );

    const send = useCallback(async (body) => {
        if (!body?.trim() || !conversationId) return;
        setSendError(null);
        setSending(true);
        const clientMessageId = makeClientMessageId();
        const tempId = `temp-${clientMessageId}`;
        const optimisticCreatedAt = new Date().toISOString();
        upsert({
            id: tempId,
            conversation_id: conversationId,
            sender_id: myId,
            body: body.trim(),
            created_at: optimisticCreatedAt,
            status: "sending",
            client_message_id: clientMessageId,
        });
        const res = await sendChatMessage(token, conversationId, body.trim(), null, clientMessageId);
        setSending(false);
        setMessageMap((prev) => {
            const next = new Map(prev);
            if (res?.success) {
                const existing = next.get(tempId);
                next.delete(tempId);
                // keep the position the bubble already has on screen — this
                // set() re-inserts under the new (server) id, but since we
                // never sort by timestamp, the only thing that matters for
                // display position is where this key sits in the Map, and
                // `matchedKey` handling in `upsert`-style updates elsewhere
                // never moves an existing entry. Here we're doing the swap
                // directly (not via upsert) so we insert at the same
                // logical spot by deleting the temp key and setting the
                // real one immediately after — Map insertion order keeps
                // it in place since nothing else is re-sorted.
                next.set(res.message.id, { ...res.message });
            } else {
                // DELETED-SELLER LOCKOUT: this specific failure means the
                // send was correctly rejected, not a transient network
                // problem — the optimistic bubble is removed entirely
                // (not marked "failed" with a Retry option) since
                // retrying would just fail again the same way, and
                // `canSend` flips to false so the composer locks itself
                // for any further attempts without waiting on a reload.
                if (res?.code === "SELLER_DELETED") {
                    next.delete(tempId);
                    setCanSend(false);
                    setSendError(res.message || "This seller's account has been deleted. You can no longer send messages here.");
                } else {
                    // keep the bubble but mark it failed so the person can see
                    // the send didn't go through and retry it, instead of the
                    // message just vanishing.
                    const existing = next.get(tempId);
                    if (existing) next.set(tempId, { ...existing, status: "failed" });
                }
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
        send, retry, deleteMessage, sending,
        otherTyping, notifyTyping, connected,
        canSend, sendError, // NEW — see DELETED-SELLER LOCKOUT above
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
        socket.on("conversation:updated", scheduleReload);
        return () => {
            clearTimeout(reloadTimerRef.current);
            socket.off("message:new", onMessage);
            socket.off("conversation:updated", scheduleReload);
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
    // Chat nav badge shows, same "sum, not just count-of-threads" idea as
    // Orders' aggregate badge.
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
    const [buyerInfo, setBuyerInfo] = useState(null); // NEW
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        if (!otherUserId || !token) return;
        setLoading(true);
        fetchCreditStatus(token, { otherUserId }).then((res) => {
            if (res?.success) {
                setCredit(res.credit);
                setViewerRole(res.viewerRole);
                setBuyerInfo(res.buyerInfo || null); // NEW
            }
            setLoading(false);
        });
    }, [otherUserId, token]);

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

    const request = useCallback(async (conversationId) => {
        const res = await requestCreditApi(token, { sellerUserId: otherUserId });
        if (res?.success) load();
        return res;
    }, [token, otherUserId, load]);

    const decide = useCallback(async (creditId, decision, creditLimit) => {
        setCredit((prev) => (prev ? { ...prev, status: decision } : prev)); // optimistic
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
        if (res?.success) load(); // pick up the server's authoritative row (status, cooldown, etc.)
        else load();
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
