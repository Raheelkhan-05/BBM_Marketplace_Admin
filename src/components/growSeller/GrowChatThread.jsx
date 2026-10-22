// src/components/growSeller/GrowChatThread.jsx
// The message thread in the GROW UI. Same hooks and behaviour as components/chat/ChatWindow.jsx
// (optimistic send, retry, delete for me / everyone, typing, presence, read ticks, older-message paging,
// keyboard-safe composer, deleted-seller lock, custom pricing for buyers).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
    ArrowLeft, ArrowDown, CreditCard, Loader2, Tag, Check, CheckCheck, Clock3, AlertCircle,
    MoreVertical, Ban, Send, MessageCircle, ShieldOff,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import useChatMessages, { usePresence, useCredit } from "../../hooks/useChat.js";
import { useChatContext } from "../../context/ChatContext.jsx";
// import CustomPricingModal from "../chat/CustomPricingModal.jsx";
import { formatLastSeen } from "../../utils/formatLastSeen.js";
import "./grow-modules.css";

const EASE = [0.16, 1, 0.3, 1];
const GROUP_GAP_MS = 3 * 60 * 1000;
const NEAR_BOTTOM_PX = 140;
const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const initials = (name) => (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
const rowKey = (m) => m.client_message_id || m.id;

function dayLabel(iso) {
    const d = new Date(iso), now = new Date();
    const diff = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

export function ChatAvatar({ logoUrl, name, size = 44, muted = false, online = false, busy = false }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [logoUrl]);
    const showImg = logoUrl && !broken;
    return (
        <span className="gc-avw">
            <span className={`gc-av${muted ? " muted" : ""}`} style={{ width: size, height: size, fontSize: size * 0.32 }}>
                {showImg ? <img src={logoUrl} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(name)}
            </span>
            {busy && <span className="gc-spinner"><Loader2 size={16} className="gk-spin" /></span>}
            {online && <span className="gc-dot" />}
        </span>
    );
}

function TypingDots() { return <span className="gct-dots" aria-hidden="true"><i /><i /><i /></span>; }

function TickIcon({ status, onRetry }) {
    if (status === "sending") return <Clock3 size={12} />;
    if (status === "failed") return <button type="button" className="gct-retry" onClick={onRetry} title="Tap to retry"><AlertCircle size={12} />Retry</button>;
    if (status === "read") return <CheckCheck size={14} style={{ color: "#6FD3FF" }} />;
    if (status === "delivered") return <CheckCheck size={14} />;
    return <Check size={14} />;
}

const MessageBubble = memo(function MessageBubble({ message, isMine, groupPos, onDelete, onRetry }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [menuOpen]);

    if (message.message_type === "credit_request" || message.message_type === "credit_limit_request") {
        const label = message.message_type === "credit_limit_request" ? "Credit limit increase" : "Credit request";
        const t = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
        return (
            <div className={`gct-credit${isMine ? " mine" : ""}`}>
                <Link to={isMine ? "/save/credit" : "/grow/customers"}>
                    <CreditCard size={13} style={{ color: "var(--k-tt)" }} />
                    <span>{label}</span>•<b>View in Credit</b>•<span>{t}</span>
                </Link>
            </div>
        );
    }

    const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const gone = !!message.deleted_at;
    const failed = message.status === "failed";
    const edge = groupPos === "last" || groupPos === "only";

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`gct-msg${isMine ? " mine" : ""}${edge ? " edge" : ""}${failed ? " failed" : ""}`}
        >
            {isMine && !gone && (
                <div className={`gct-menu${menuOpen ? " open" : ""}`} ref={menuRef}>
                    <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Message options" aria-expanded={menuOpen}><MoreVertical size={15} /></button>
                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div className="gct-pop" initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.12 }}>
                                <button type="button" onClick={() => { setMenuOpen(false); onDelete(message.id, "me"); }}>Delete for me</button>
                                <button type="button" className="d" onClick={() => { setMenuOpen(false); onDelete(message.id, "everyone"); }}>Delete for everyone</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
            <div className={`gct-b${gone ? " gone" : ""}`}>
                {gone ? <p className="gone-t"><Ban size={13} />This message was deleted</p> : <p>{message.body}</p>}
                <div className="gct-meta">
                    <span>{time}</span>
                    {isMine && !gone && <TickIcon status={message.status} onRetry={() => onRetry(message.id)} />}
                </div>
            </div>
        </motion.div>
    );
}, (prev, next) => prev.message === next.message && prev.isMine === next.isMine && prev.groupPos === next.groupPos);

function Composer({ onSend, onTypingChange, disabled }) {
    const [value, setValue] = useState("");
    const ref = useRef(null);

    const resize = (el) => {
        el.style.height = "auto";
        const border = el.offsetHeight - el.clientHeight; // top + bottom border
        const h = Math.min(el.scrollHeight + border, 120);
        el.style.height = `${h}px`;
        el.style.overflowY = el.scrollHeight + border > 120 ? "auto" : "hidden";
    };

    const onChange = (e) => {
        setValue(e.target.value);
        onTypingChange?.(e.target.value.length > 0);
        resize(e.target);
    };

    const submit = () => {
        const text = value.trim();
        if (!text || disabled) return;
        onSend(text);
        onTypingChange?.(false);
        setValue("");
        const ta = ref.current;
        if (ta) { ta.style.height = "auto"; ta.style.overflowY = "hidden"; ta.focus({ preventScroll: true }); }
    };

    const onKeyDown = (e) => {
        if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
        const phone = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;
        if (phone) return; // on phones Enter adds a new line, the send button sends
        e.preventDefault();
        submit();
    };

    if (disabled) return <div className="gct-locked"><ShieldOff size={16} /></div>;

    return (
        <div className="gct-comp">
            <textarea ref={ref} value={value} onChange={onChange} onKeyDown={onKeyDown} rows={1} enterKeyHint="send"
                style={{ fontSize: 16 }}
                autoComplete="off" placeholder="Type a message…" aria-label="Type a message" />
            <button type="button" className="gct-send" aria-label="Send" disabled={!value.trim()}
                onPointerDown={(e) => e.preventDefault()} onClick={submit}><Send size={18} /></button>
        </div>
    );
}

export default function GrowChatThread({ conversationId, meta, onBack, style }) {
    const { profile, token } = useAuth();
    const { markLocalRead } = useChatContext();
    const scrollRef = useRef(null);
    const presence = usePresence(meta?.otherUserId ? [meta.otherUserId] : []);
    const otherPresence = meta?.otherUserId ? presence[meta.otherUserId] : null;
    const { viewerRole, buyerInfo } = useCredit(meta?.otherUserId);

    const {
        messages, loading, loadingOlder, hasMore, loadOlder,
        send, retry, deleteMessage, otherTyping, notifyTyping, connected, canSend, sendError,
    } = useChatMessages(conversationId, meta?.otherUserId);

    const isDeleted = !!meta?.otherIsDeletedSeller;
    const isLockedOut = isDeleted || canSend === false;

    const [isNearBottom, setIsNearBottom] = useState(true);
    const [newIncoming, setNewIncoming] = useState(0);
    // const [pricingOpen, setPricingOpen] = useState(false);

    const scrollStateRef = useRef({ convId: null, placedAtBottom: false });
    const lastMessageIdRef = useRef(null);
    const isPrependingRef = useRef(false);
    const prevScrollHeightRef = useRef(0);
    const pinnedRef = useRef(true);

    // Only ever scrolls the message list itself, never the window (prevents page jumps with the mobile keyboard).
    const jumpToBottom = useCallback((smooth = false) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion ? "smooth" : "auto" });
    }, []);

    useEffect(() => {
        if (scrollStateRef.current.convId !== conversationId) {
            scrollStateRef.current = { convId: conversationId, placedAtBottom: false };
            lastMessageIdRef.current = null;
            setIsNearBottom(true);
            setNewIncoming(0);
        }
    }, [conversationId]);

    useEffect(() => { if (conversationId) markLocalRead(conversationId); }, [conversationId, markLocalRead]);

    useEffect(() => {
        const last = messages[messages.length - 1];
        if (last && last.sender_id !== profile?.id) markLocalRead(conversationId);
    }, [messages, profile?.id, conversationId, markLocalRead]);

    useLayoutEffect(() => {
        if (loading) return;
        if (scrollStateRef.current.convId !== conversationId) return;
        if (scrollStateRef.current.placedAtBottom) return;
        scrollStateRef.current.placedAtBottom = true;
        const last = messages[messages.length - 1];
        lastMessageIdRef.current = last ? rowKey(last) : null;
        jumpToBottom(false);
    }, [loading, messages, conversationId, jumpToBottom]);

    const handleLoadOlder = useCallback(() => {
        if (!scrollRef.current || loadingOlder || !hasMore) return;
        isPrependingRef.current = true;
        prevScrollHeightRef.current = scrollRef.current.scrollHeight;
        loadOlder();
    }, [loadOlder, loadingOlder, hasMore]);

    useLayoutEffect(() => {
        if (isPrependingRef.current && scrollRef.current) {
            const el = scrollRef.current;
            el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
            isPrependingRef.current = false;
        }
    }, [messages]);

    useLayoutEffect(() => {
        if (!scrollStateRef.current.placedAtBottom) return;
        const last = messages[messages.length - 1];
        if (!last) return;
        const key = rowKey(last);
        if (key === lastMessageIdRef.current) return;
        lastMessageIdRef.current = key;
        if (last.sender_id === profile?.id || isNearBottom) { jumpToBottom(false); setNewIncoming(0); }
        else setNewIncoming((n) => n + 1);
    }, [messages, isNearBottom, profile?.id, jumpToBottom]);

    useLayoutEffect(() => { if (otherTyping && isNearBottom) jumpToBottom(false); }, [otherTyping, isNearBottom, jumpToBottom]);

    useEffect(() => { pinnedRef.current = isNearBottom; }, [isNearBottom]);

    // Stay pinned to the bottom when the container resizes (keyboard) or its content grows.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(() => { if (pinnedRef.current) el.scrollTop = el.scrollHeight; });
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, []);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        setIsNearBottom(near);
        if (near) setNewIncoming(0);
        if (el.scrollTop < 80 && hasMore && !loadingOlder) handleLoadOlder();
    };

    const stop = useCallback((e) => e.stopPropagation(), []);
    let lastDay = null;

    const statusLine = isDeleted
        ? { cls: "", node: "Account no longer active" }
        : otherTyping ? { cls: "ty", node: <>typing <TypingDots /></> }
            : otherPresence?.online ? { cls: "on", node: "Online" }
                : { cls: "", node: formatLastSeen(otherPresence?.lastSeenAt) };

    return (
        <div className="gk gct" style={style}>
            {!connected && <div className="gct-recon" role="status">Reconnecting…</div>}

            <header className="gct-h">
                <button type="button" className="gk-icbtn gct-back" onClick={onBack} aria-label="Back to chats"><ArrowLeft size={18} /></button>
                {meta ? (
                    <>
                        <ChatAvatar logoUrl={meta.otherShopLogo} name={meta.otherShopName} size={42} muted={isDeleted} online={!!otherPresence?.online && !isDeleted} />
                        <div className="gct-who">
                            <div className="gct-name">
                                <b style={{ color: isDeleted ? "var(--k-mute)" : undefined }}>{meta.otherShopName}</b>
                                {isDeleted && <span className="gc-del">Deleted</span>}
                            </div>
                            <div className={`gct-st ${statusLine.cls}`}>{statusLine.node}</div>
                        </div>
                    </>
                ) : (
                    <div className="gct-who" style={{ display: "grid", gap: 6 }}>
                        <div className="gk-skel" style={{ height: 14, width: 150 }} />
                        <div className="gk-skel" style={{ height: 10, width: 80 }} />
                    </div>
                )}
                {/* {viewerRole === "seller" && (
                    <button type="button" className="gk-btn sm" onClick={() => setPricingOpen(true)} aria-label="Custom pricing for this buyer"><Tag size={15} />Custom price</button>
                )} */}
            </header>

            <div className="gct-body">
                <div ref={scrollRef} onScroll={onScroll} data-lenis-prevent onWheel={stop} onTouchStart={stop} onTouchMove={stop} className="gct-scroll">
                    {loadingOlder && <div style={{ display: "flex", justifyContent: "center", padding: 8 }}><Loader2 size={16} className="gk-spin" style={{ color: "var(--k-mute)" }} /></div>}
                    {loading ? (
                        <div className="gct-skel" aria-busy="true">
                            {["55%", "38%", "62%", "44%"].map((w, i) => <i key={i} className="gk-skel" style={{ width: w, alignSelf: i % 2 ? "flex-end" : "flex-start" }} />)}
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="gct-empty">
                            <span className="ic"><MessageCircle size={22} /></span>
                            <b>Say hello 👋</b>
                            <span style={{ maxWidth: 240, fontSize: ".86rem" }}>Your messages with {meta?.otherShopName || meta?.title || "them"} start here.</span>
                        </div>
                    ) : (
                        <AnimatePresence initial={false}>
                            {messages.map((m, i) => {
                                const day = dayLabel(m.created_at);
                                const showDay = day !== lastDay;
                                lastDay = day;
                                const prev = messages[i - 1];
                                const next = messages[i + 1];
                                const withinPrev = !showDay && prev && prev.sender_id === m.sender_id && (new Date(m.created_at) - new Date(prev.created_at)) < GROUP_GAP_MS;
                                const withinNext = next && next.sender_id === m.sender_id && dayLabel(next.created_at) === day && (new Date(next.created_at) - new Date(m.created_at)) < GROUP_GAP_MS;
                                const groupPos = withinPrev && withinNext ? "middle" : withinPrev ? "last" : withinNext ? "first" : "only";
                                return (
                                    <div key={rowKey(m)}>
                                        {showDay && <div className="gct-day"><span>{day}</span></div>}
                                        <MessageBubble message={m} isMine={m.sender_id === profile?.id} groupPos={groupPos} onDelete={deleteMessage} onRetry={retry} />
                                    </div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                    <AnimatePresence>
                        {otherTyping && !isLockedOut && (
                            <motion.div key="typing" className="gct-typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15, ease: EASE }}>
                                <div><TypingDots /></div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <AnimatePresence>
                    {newIncoming > 0 && (
                        <motion.button type="button" className="gct-jump" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15, ease: EASE }}
                            onClick={() => { jumpToBottom(false); setNewIncoming(0); }}>
                            {newIncoming} new message{newIncoming > 1 ? "s" : ""} <ArrowDown size={15} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {sendError && !isLockedOut && <div className="gct-note" role="alert">{sendError}</div>}
            {isLockedOut && (
                <div className="gct-note" role="status">
                    <ShieldOff size={15} />
                    <span>{meta?.otherShopName || "This seller"}'s account has been deleted. You can no longer send messages here. This thread is kept for your records only.</span>
                </div>
            )}

            <Composer onSend={send} onTypingChange={notifyTyping} disabled={isLockedOut} />

            {/* <CustomPricingModal
                open={pricingOpen}
                onClose={() => setPricingOpen(false)}
                buyerId={meta?.otherUserId}
                buyerLabel={buyerInfo?.businessName || buyerInfo?.name || meta?.otherShopName || "this buyer"}
                token={token}
            /> */}
        </div>
    );
}