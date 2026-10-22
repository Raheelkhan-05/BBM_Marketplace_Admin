// components/chat/ChatWindow.jsx
//
// The whole message-thread experience — header, banner, bubbles,
// composer — lives in this one file.
//
// MOBILE: the composer keeps the keyboard open after sending, uses 16px
// text on touch devices (prevents iOS focus-zoom), has no spinner on the
// send button, and scrolling only ever touches the message list (never the
// window), so the input never jumps.
import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowDown, CreditCard, Loader2, Tag, Check, CheckCheck, Clock3, AlertCircle, MoreVertical, Ban, Send, MessageCircle, X, ShieldOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import useChatMessages, { usePresence, useCredit } from "../../hooks/useChat.js";
import { useChatContext } from "../../context/ChatContext.jsx";
import CustomPricingModal from "./CustomPricingModal.jsx";
import { formatLastSeen } from "../../utils/formatLastSeen.js";

// Single token system for the whole module — every color used anywhere
// below comes from here, so a status (warn/ok/danger) always looks the
// same regardless of which bar or bubble is showing it.
const C = {
    ink: "#0B1116", muted: "#667077",
    primary: "#D2462B", secondary: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
    ok: "#059669", okBg: "#EAF7F2",
    warn: "#a16207", warnBg: "#FDF3D8",
    danger: "#C71F11", dangerBg: "rgba(199,31,17,0.07)", dangerSoft: "#B23A28",
    surface: "#fff", canvas: "#F7F6F3",
};
const EASE = [0.16, 1, 0.3, 1];
const GROUP_GAP_MS = 3 * 60 * 1000; // same-sender messages within this window render as one visual group
const NEAR_BOTTOM_PX = 140;

const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function initials(name) {
    return (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function dayLabel(iso) {
    const d = new Date(iso), now = new Date();
    const diffDays = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

// stable identity for a message row regardless of optimistic → confirmed swap
function rowKey(m) {
    return m.client_message_id || m.id;
}

// small inline tag — same visual language as the one in ConversationList,
// used next to the shop name in the header when the seller is deleted.
function DeletedTag() {
    return (
        <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide" style={{ background: "#fdecea", color: "#c71f11" }}>
            Deleted
        </span>
    );
}

// ---- header -----------------------------------------------------------

function TypingDots({ color = C.secondary, size = "h-1.5 w-1.5" }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
                <motion.span
                    key={i}
                    className={`inline-block rounded-full ${size}`}
                    style={{ background: color }}
                    animate={prefersReducedMotion ? {} : { y: [0, -3, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                />
            ))}
        </span>
    );
}

// ChatHeader takes the custom-pricing trigger as props and renders it as a
// compact icon button at the end of the header row — same visual weight as
// the rest of the header, not a second bar competing for attention.
function ChatHeader({ meta, otherPresence, otherTyping, onBack, showCustomPricing, onOpenCustomPricing }) {
    const isDeleted = !!meta?.otherIsDeletedSeller;
    return (
        <div className="flex items-center gap-3 border-b px-3.5 py-2.5" style={{ borderColor: C.hair, background: C.surface }}>
            <button onClick={onBack} className="rounded-full p-1.5 transition-colors hover:bg-black/5 sm:hidden" aria-label="Back">
                <ArrowLeft className="h-4 w-4" style={{ color: C.ink }} />
            </button>
            <div className="relative shrink-0">
                {meta?.otherShopLogo ? (
                    <img
                        src={meta.otherShopLogo}
                        alt={meta.otherShopName || "Shop"}
                        className="h-10 w-10 rounded-full object-cover shadow-sm"
                        style={{ border: `1px solid ${C.hair}`, filter: isDeleted ? "grayscale(1)" : "none", opacity: isDeleted ? 0.6 : 1 }}
                        onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextSibling.style.display = "flex";
                        }}
                    />
                ) : null}
                <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[12.5px] font-extrabold tracking-wide text-white shadow-sm"
                    style={{
                        display: meta?.otherShopLogo ? "none" : "flex",
                        background: isDeleted ? "#9AA3A8" : "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)",
                    }}
                >
                    {meta ? initials(meta.otherShopName) : ""}
                </span>
                {otherPresence?.online && !isDeleted && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2" style={{ background: "#1FAE5C", borderColor: C.surface }} />
                )}
            </div>
            <div className="min-w-0 flex-1">
                {meta ? (
                    <>
                        <span className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-[14.5px] font-extrabold tracking-wide" style={{ color: isDeleted ? C.muted : C.ink }}>{meta.otherShopName}</p>
                            {isDeleted && <DeletedTag />}
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                            {isDeleted ? (
                                <motion.p
                                    key="deleted"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                                    style={{ color: C.muted }}
                                >
                                    Account no longer active
                                </motion.p>
                            ) : otherTyping ? (
                                <motion.p
                                    key="typing"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide"
                                    style={{ color: C.secondary }}
                                >
                                    typing <TypingDots size="h-1 w-1" />
                                </motion.p>
                            ) : (
                                <motion.p
                                    key="status"
                                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.12 }}
                                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                                    style={{ color: otherPresence?.online ? C.secondary : C.muted }}
                                >
                                    {otherPresence?.online ? "Online" : formatLastSeen(otherPresence?.lastSeenAt)}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </>
                ) : (
                    <>
                        <div className="h-3 w-28 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                        <div className="mt-1.5 h-2.5 w-16 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                    </>
                )}
            </div>

            {showCustomPricing && (
                <button
                    onClick={onOpenCustomPricing}
                    aria-label="Custom pricing for this buyer"
                    title="Custom pricing"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                    style={{ color: C.secondary }}
                >
                    <Tag className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

function TypingBubble() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15, ease: EASE }}
            className="mb-3 flex justify-start"
        >
            <div className="flex items-center rounded-2xl px-4 py-3" style={{ background: C.surface, border: `1px solid ${C.hair}`, borderBottomLeftRadius: 4, boxShadow: "0 1px 2px rgba(11,17,22,0.04)" }}>
                <TypingDots size="h-1.5 w-1.5" />
            </div>
        </motion.div>
    );
}

// Notice shown above the composer whenever sending is blocked because the
// other party's account is deleted. Non-dismissible by design.
function DeletedSellerNotice({ shopName }) {
    return (
        <div className="flex items-start gap-2 border-t px-3.5 py-2.5" style={{ borderColor: C.hair, background: C.dangerBg }}>
            <ShieldOff className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: C.danger }} />
            <p className="text-[12px] font-semibold leading-snug" style={{ color: C.danger }}>
                {shopName || "This seller"}'s account has been deleted. You can no longer send messages here — this thread is kept for your records only.
            </p>
        </div>
    );
}

// ---- message bubble -----------------------------------------------------

function TickIcon({ status, onRetry }) {
    if (status === "sending") return <Clock3 className="h-3 w-3" style={{ color: "rgba(255,255,255,0.7)" }} />;
    if (status === "failed") return (
        <button onClick={onRetry} className="flex items-center gap-0.5 text-[10px] font-bold underline decoration-dotted underline-offset-2" style={{ color: "#ffd6d1" }} title="Tap to retry">
            <AlertCircle className="h-3 w-3" /> Retry
        </button>
    );
    if (status === "read") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "#6FD3FF" }} />;
    if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.7)" }} />;
    return <Check className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.7)" }} />;
}

const MessageBubble = memo(function MessageBubble({ message, isMine, groupPos, onDelete, onRetry }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    if (message.message_type === "credit_request" || message.message_type === "credit_limit_request") {
        const label = message.message_type === "credit_limit_request" ? "Credit limit increase" : "Credit request";
        const creditTime = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
        return (
            <div className={`mb-2 flex ${isMine ? "justify-end" : "justify-start"}`}>
                <Link to="/credit" className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors hover:brightness-95" style={{ background: C.hairSoft, color: C.muted }}>
                    <CreditCard className="h-3 w-3 shrink-0" style={{ color: C.secondary }} />
                    <span>{label}</span>
                    <span aria-hidden style={{ opacity: 0.35 }}>•</span>
                    <span style={{ color: C.secondary, fontWeight: 700 }}>View in Credit</span>
                    <span aria-hidden style={{ opacity: 0.35 }}>•</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{creditTime}</span>
                </Link>
            </div>
        );
    }

    const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const isDeleted = !!message.deleted_at;
    const isFailed = message.status === "failed";
    const isOuterEdge = groupPos === "last" || groupPos === "only";

    const tailRadius = isMine
        ? { borderBottomRightRadius: isOuterEdge ? 4 : 16 }
        : { borderBottomLeftRadius: isOuterEdge ? 4 : 16 };

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`group relative flex items-center gap-1 ${isMine ? "justify-end" : "justify-start"} ${isOuterEdge ? "mb-3" : "mb-0.5"}`}
        >
            {isMine && !isDeleted && (
                <div className="relative opacity-0 transition-opacity group-hover:opacity-100" ref={menuRef}>
                    <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-1 hover:bg-black/5" aria-label="Message options">
                        <MoreVertical className="h-3.5 w-3.5" style={{ color: C.muted }} />
                    </button>
                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.12 }}
                                className="absolute right-0 top-6 z-10 w-40 overflow-hidden rounded-xl border bg-white py-1 shadow-lg" style={{ borderColor: C.hair }}
                            >
                                <button onClick={() => { setMenuOpen(false); onDelete(message.id, "me"); }} className="flex w-full items-center px-3 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-black/5" style={{ color: C.ink }}>
                                    Delete for me
                                </button>
                                <button onClick={() => { setMenuOpen(false); onDelete(message.id, "everyone"); }} className="flex w-full items-center px-3 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-rose-50" style={{ color: C.danger }}>
                                    Delete for everyone
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug tracking-wide sm:max-w-[65%] ${isDeleted ? "italic" : ""}`}
                style={{
                    ...(isDeleted
                        ? { background: "rgba(11,17,22,0.04)", color: C.muted, border: `1px dashed ${C.hair}` }
                        : isMine
                            ? { background: isFailed ? C.dangerSoft : "linear-gradient(135deg, #006F83 0%, #0B8A93 100%)", color: "#fff", boxShadow: "0 1px 2px rgba(11,17,22,0.08)" }
                            : { background: C.surface, color: C.ink, border: `1px solid ${C.hair}`, boxShadow: "0 1px 2px rgba(11,17,22,0.04)" }),
                    ...tailRadius,
                }}
            >
                {isDeleted ? (
                    <p className="flex items-center gap-1.5"><Ban className="h-3 w-3" /> This message was deleted</p>
                ) : (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                )}
                <div className={`mt-1 flex items-center gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] font-semibold" style={{ color: isMine && !isDeleted ? "rgba(255,255,255,0.75)" : C.muted }}>{time}</span>
                    {isMine && !isDeleted && <TickIcon status={message.status} onRetry={() => onRetry(message.id)} />}
                </div>
            </div>
        </motion.div>
    );
}, (prev, next) => (
    prev.message === next.message &&
    prev.isMine === next.isMine &&
    prev.groupPos === next.groupPos
));

// ---- composer -----------------------------------------------------------

function ChatComposer({ onSend, onTypingChange, disabled }) {
    const [value, setValue] = useState("");
    const textareaRef = useRef(null);

    const onChange = (e) => {
        setValue(e.target.value);
        onTypingChange?.(e.target.value.length > 0);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    };

    const submit = () => {
        const text = value.trim();
        if (!text || disabled) return;
        onSend(text);
        onTypingChange?.(false);
        setValue("");
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.focus({ preventScroll: true }); // keep the keyboard open after sending
        }
    };

    const onKeyDown = (e) => {
        // On phones Enter inserts a new line (the send button sends);
        // on desktop Enter sends and Shift+Enter inserts a new line.
        const touch = window.matchMedia?.("(pointer: coarse)").matches;
        if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); submit(); }
    };

    if (disabled) {
        return (
            <div className="flex items-center justify-center gap-2 border-t px-3 py-2.5 sm:px-4" style={{ borderColor: C.hair, background: C.hairSoft }}>
                <ShieldOff className="h-3.5 w-3.5" style={{ color: C.muted }} />
            </div>
        );
    }

    return (
        <div
            className="flex shrink-0 items-end gap-2 border-t px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-4"
            style={{ borderColor: C.hair, background: C.surface }}
        >
            <textarea
                ref={textareaRef}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                rows={1}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                placeholder="Type a message…"
                // 16px on mobile prevents iOS focus-zoom (the main cause of the "jump")
                className="max-h-[120px] flex-1 resize-none rounded-2xl border bg-[#FAFAF9] px-3.5 py-2.5 text-[16px] font-medium leading-snug tracking-wide outline-none transition-colors placeholder:text-slate-400 focus:border-[#006F83] focus:bg-white sm:text-[13.5px]"
                style={{ borderColor: C.hair, color: C.ink }}
            />
            <button
                type="button"
                onPointerDown={(e) => e.preventDefault()} // don't steal focus → keyboard stays up
                onClick={submit}
                disabled={!value.trim()}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                style={{ background: C.secondary }}
            >
                <Send className="h-4 w-4" />
            </button>
        </div>
    );
}

// ---- skeleton (initial load) ---------------------------------------------

function ThreadSkeleton() {
    const widths = ["55%", "38%", "62%", "44%"];
    return (
        <div className="flex flex-1 flex-col justify-end gap-2 px-4 py-3">
            {widths.map((w, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                    <div className="h-9 animate-pulse rounded-2xl" style={{ width: w, background: C.hairSoft }} />
                </div>
            ))}
        </div>
    );
}

// ---- main -----------------------------------------------------------------

export default function ChatWindow({ conversationId, meta, onBack }) {
    const { profile, token } = useAuth();
    const { markLocalRead } = useChatContext();
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);
    const presence = usePresence(meta?.otherUserId ? [meta.otherUserId] : []);
    const otherPresence = meta?.otherUserId ? presence[meta.otherUserId] : null;
    const { viewerRole, buyerInfo } = useCredit(meta?.otherUserId);

    const {
        messages, loading, loadingOlder, hasMore, loadOlder,
        send, retry, deleteMessage, otherTyping, notifyTyping, connected,
        canSend,
        sendError,
    } = useChatMessages(conversationId, meta?.otherUserId);

    const isLockedOut = !!meta?.otherIsDeletedSeller || canSend === false;

    // ---- scroll behavior ---------------------------------------------
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [newIncoming, setNewIncoming] = useState(0);
    const [customPricingOpen, setCustomPricingOpen] = useState(false);

    const scrollStateRef = useRef({ convId: null, placedAtBottom: false });
    const lastMessageIdRef = useRef(null);
    const isPrependingRef = useRef(false);
    const prevScrollHeightRef = useRef(0);

    const messageRefs = useRef(new Map());
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const highlightTimeoutRef = useRef(null);

    const scrollToMessage = useCallback((messageId) => {
        const el = messageRefs.current.get(messageId);
        if (!el) return;
        el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
        clearTimeout(highlightTimeoutRef.current);
        setHighlightedMessageId(messageId);
        highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 2200);
    }, []);

    useEffect(() => () => clearTimeout(highlightTimeoutRef.current), []);

    // Only ever scrolls the message list itself — never the window or any
    // other ancestor (scrollIntoView did, which caused page jumps whenever
    // the mobile keyboard opened or closed).
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

    useEffect(() => {
        if (conversationId) markLocalRead(conversationId);
    }, [conversationId, markLocalRead]);

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

        const mine = last.sender_id === profile?.id;
        if (mine || isNearBottom) {
            jumpToBottom(false);
            setNewIncoming(0);
        } else {
            setNewIncoming((n) => n + 1);
        }
    }, [messages, isNearBottom, profile?.id, jumpToBottom]);

    useLayoutEffect(() => {
        if (otherTyping && isNearBottom) jumpToBottom(false);
    }, [otherTyping, isNearBottom, jumpToBottom]);

    const pinnedRef = useRef(true);
    useEffect(() => { pinnedRef.current = isNearBottom; }, [isNearBottom]);

    // Keeps the list pinned to the bottom when either the container resizes
    // (mobile keyboard opening/closing) or its content grows (new messages,
    // images, typing bubble).
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            if (pinnedRef.current) el.scrollTop = el.scrollHeight;
        });
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, []);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
        setIsNearBottom(nearBottom);
        if (nearBottom) setNewIncoming(0);
        if (el.scrollTop < 80 && hasMore && !loadingOlder) handleLoadOlder();
    };

    const handleJumpToBottomClick = () => {
        jumpToBottom(false);
        setNewIncoming(0);
    };

    const stopScrollPropagation = useCallback((e) => { e.stopPropagation(); }, []);

    let lastDay = null;

    return (
        <div className="flex h-full flex-col overscroll-none" style={{ background: C.canvas }}>
            {!connected && (
                <div className="px-4 py-1.5 text-center text-[11px] font-bold text-white" style={{ background: C.danger }}>
                    Reconnecting…
                </div>
            )}

            <ChatHeader
                meta={meta}
                otherPresence={otherPresence}
                otherTyping={otherTyping}
                onBack={onBack}
                showCustomPricing={viewerRole === "seller"}
                onOpenCustomPricing={() => setCustomPricingOpen(true)}
            />

            <div className="relative min-h-0 flex-1">
                <div
                    ref={scrollRef}
                    onScroll={onScroll}
                    data-lenis-prevent
                    onWheel={stopScrollPropagation}
                    onTouchStart={stopScrollPropagation}
                    onTouchMove={stopScrollPropagation}
                    className="h-full overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
                >
                    {loadingOlder && (
                        <div className="flex justify-center py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: C.muted }} /></div>
                    )}
                    {loading ? (
                        <ThreadSkeleton />
                    ) : messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: C.hairSoft }}>
                                <MessageCircle className="h-5 w-5" style={{ color: C.muted }} />
                            </span>
                            <p className="text-[13px] font-bold" style={{ color: C.ink }}>Say hello 👋</p>
                            <p className="max-w-[220px] text-[11.5px] font-medium" style={{ color: C.muted }}>Your messages with {meta?.otherShopName || meta?.title || "them"} start here.</p>
                        </div>
                    ) : (
                        <AnimatePresence initial={false}>
                            {messages.map((m, i) => {
                                const day = dayLabel(m.created_at);
                                const showDay = day !== lastDay;
                                lastDay = day;

                                const prev = messages[i - 1];
                                const next = messages[i + 1];
                                const withinPrevGroup = !showDay && prev && prev.sender_id === m.sender_id && (new Date(m.created_at) - new Date(prev.created_at)) < GROUP_GAP_MS;
                                const withinNextGroup = next && next.sender_id === m.sender_id && dayLabel(next.created_at) === day && (new Date(next.created_at) - new Date(m.created_at)) < GROUP_GAP_MS;
                                const groupPos = withinPrevGroup && withinNextGroup ? "middle" : withinPrevGroup ? "last" : withinNextGroup ? "first" : "only";

                                return (
                                    <div
                                        key={rowKey(m)}
                                        ref={(el) => {
                                            if (el) messageRefs.current.set(m.id, el);
                                            else messageRefs.current.delete(m.id);
                                        }}
                                        className="rounded-2xl transition-colors duration-500"
                                        style={highlightedMessageId === m.id ? { background: `${C.secondary}0f`, boxShadow: `0 0 0 2px ${C.secondary}30` } : undefined}
                                    >
                                        {showDay && (
                                            <div className="my-3 flex items-center justify-center">
                                                <span className="rounded-full px-3 py-1 text-[10.5px] font-bold tracking-wide" style={{ background: "rgba(11,17,22,0.05)", color: C.muted }}>
                                                    {day}
                                                </span>
                                            </div>
                                        )}
                                        <MessageBubble
                                            message={m}
                                            isMine={m.sender_id === profile?.id}
                                            groupPos={groupPos}
                                            onDelete={deleteMessage}
                                            onRetry={retry}
                                        />
                                    </div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                    <AnimatePresence>
                        {otherTyping && !isLockedOut && <TypingBubble key="typing-bubble" />}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                </div>

                <AnimatePresence>
                    {newIncoming > 0 && (
                        <motion.button
                            initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.15, ease: EASE }}
                            onClick={handleJumpToBottomClick}
                            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold text-white shadow-lg"
                            style={{ background: C.secondary }}
                        >
                            {newIncoming} new message{newIncoming > 1 ? "s" : ""} <ArrowDown className="h-3.5 w-3.5" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {sendError && !isLockedOut && (
                <div className="px-3.5 py-1.5 text-[11.5px] font-semibold" style={{ color: C.danger, background: C.dangerBg }}>
                    {sendError}
                </div>
            )}

            {isLockedOut && <DeletedSellerNotice shopName={meta?.otherShopName} />}

            <ChatComposer
                onSend={send}
                onTypingChange={notifyTyping}
                disabled={isLockedOut}
            />

            <CustomPricingModal
                open={customPricingOpen}
                onClose={() => setCustomPricingOpen(false)}
                buyerId={meta?.otherUserId}
                buyerLabel={buyerInfo?.businessName || buyerInfo?.name || meta?.otherShopName || "this buyer"}
                token={token}
            />
        </div>
    );
}