// components/chat/ConversationList.jsx
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, MessageSquare, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchApprovedSellers, getOrCreateDirectConversation } from "../../utils/chatApi.js";
import { prefetchMessages } from "../../hooks/useChat.js";

const C = { ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };
const EASE = [0.16, 1, 0.3, 1];

// Only ever initial-ise off the shop name — personal name is never passed in.
function initials(shopName) {
    return (shopName || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// Splits a list into [non-deleted, deleted], each sorted alphabetically
// by shop name on its own — so the grid always reads: every active
// contact A→Z first, then every deleted contact A→Z after them.
function sortAlphabeticalDeletedLast(list, getName, getIsDeleted) {
    const collator = new Intl.Collator("en", { sensitivity: "base" });
    const active = [];
    const deleted = [];
    list.forEach((item) => (getIsDeleted(item) ? deleted : active).push(item));
    const byName = (a, b) => collator.compare(getName(a) || "", getName(b) || "");
    active.sort(byName);
    deleted.sort(byName);
    return [...active, ...deleted];
}

function IconSkeleton() {
    return (
        <div className="flex w-[76px] flex-col items-center gap-1.5">
            <div className="h-14 w-14 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            <div className="h-2 w-12 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
        </div>
    );
}

// If the logo fails to load, fall back to initials via state (the old
// onError handler read `nextSibling`, which doesn't exist here and threw).
function Avatar({ logoUrl, shopName, size = "h-14 w-14", muted = false }) {
    const [broken, setBroken] = useState(false);
    if (logoUrl && !broken) {
        return (
            <img
                src={logoUrl}
                alt={shopName || "Shop"}
                loading="lazy"
                className={`${size} shrink-0 rounded-full object-cover shadow-sm`}
                style={{ border: `1px solid ${C.hair}`, filter: muted ? "grayscale(1)" : "none", opacity: muted ? 0.6 : 1 }}
                onError={() => setBroken(true)}
            />
        );
    }
    return (
        <span className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white shadow-sm`}
            style={{ background: muted ? "#9AA3A8" : "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}>
            {initials(shopName)}
        </span>
    );
}

// One contact tile: avatar (with unread badge / deleted tag overlaid) and
// the full shop name below it, never truncated to just an icon+letter —
// the name always wraps and stays fully readable under the avatar.
function ContactTile({ logoUrl, shopName, unreadCount = 0, isDeleted = false, busy = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className="flex w-[84px] min-[396px]:w-[98px] flex-col items-center gap-1.5 rounded-xl py-1.5 text-center transition-colors duration-150 hover:bg-black/[0.03] disabled:opacity-60"
        >
            <span className="relative">
                <Avatar logoUrl={logoUrl} shopName={shopName} muted={isDeleted} />
                {busy && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </span>
                )}
                {!busy && unreadCount > 0 && (
                    <span
                        className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1 text-[9px] font-extrabold text-white"
                        style={{ background: C.primary }}
                    >
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </span>
            <span className="flex flex-col items-center gap-0.5">
                <span
                    className="w-full whitespace-normal break-words text-[11px] font-bold leading-tight tracking-wide"
                    style={{ color: isDeleted ? C.muted : C.ink }}
                >
                    {shopName || "Unknown seller"}
                </span>
                {isDeleted && (
                    <span className="rounded-full px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-wide" style={{ background: "#fdecea", color: "#c71f11" }}>
                        Deleted
                    </span>
                )}
            </span>
        </button>
    );
}

export default function ConversationList({ conversations, loading, activeId, onSelect, reload }) {
    const { token } = useAuth();
    const [query, setQuery] = useState("");
    const [sellers, setSellers] = useState([]);
    const [sellersLoading, setSellersLoading] = useState(true);
    const [starting, setStarting] = useState(null);
    // sellers we've just opened a chat with — hidden from "Approved sellers"
    // immediately, without waiting for the conversations list to reload
    const [started, setStarted] = useState(() => new Set());

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        fetchApprovedSellers(token).then((res) => {
            if (cancelled) return;
            if (res?.success) setSellers(res.sellers);
            setSellersLoading(false);
        });
        return () => { cancelled = true; };
    }, [token]);

    // Warm the message cache for the top few chats so opening them is instant.
    useEffect(() => {
        if (!token || loading) return;
        conversations.slice(0, 5).forEach((c) => prefetchMessages(token, c.id));
    }, [token, loading, conversations]);

    // Sellers who don't have an existing conversation yet — those already show up below.
    // Note: fetchApprovedSellers already excludes deleted sellers server-side,
    // so this "start a new chat" list never surfaces one — a deleted seller
    // can only still be seen here if there's already a conversation with
    // them (handled by the conversations list below, with its own badge).
    const conversationSellerIds = useMemo(
        () => new Set(conversations.filter((c) => c.otherUserId).map((c) => String(c.otherUserId).toLowerCase())),
        [conversations],
    );
    const newSellers = sellers.filter((s) => {
        const id = String(s.id).toLowerCase();
        return !conversationSellerIds.has(id) && !started.has(id);
    });

    const q = query.trim().toLowerCase();
    const filteredConversations = conversations.filter((c) => (c.otherShopName || "").toLowerCase().includes(q));
    const filteredNewSellers = newSellers.filter((s) => (s.shopName || "").toLowerCase().includes(q));

    // Active (non-deleted) contacts A→Z, then deleted contacts A→Z after them.
    const sortedConversations = useMemo(
        () => sortAlphabeticalDeletedLast(filteredConversations, (c) => c.otherShopName, (c) => !!c.otherIsDeletedSeller),
        [filteredConversations],
    );
    const sortedNewSellers = useMemo(
        () => [...filteredNewSellers].sort((a, b) => (a.shopName || "").localeCompare(b.shopName || "", "en", { sensitivity: "base" })),
        [filteredNewSellers],
    );

    // Navigates as soon as the conversation id is known; the list refresh
    // happens in the background instead of blocking the open.
    const startChat = async (seller) => {
        if (starting) return;
        setStarting(seller.id);
        const res = await getOrCreateDirectConversation(token, seller.id);
        if (res?.success) {
            setStarted((prev) => new Set(prev).add(String(seller.id).toLowerCase()));
            onSelect(res.conversationId);
            reload();
        }
        setStarting(null);
    };

    return (
        <div className="flex h-full flex-col" style={{ background: "#fff" }}>
            <div className="px-3.5 pb-2 pt-3.5">
                <h1 className="text-[16.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>Messages</h1>
            </div>

            <div className="px-3.5 pb-2.5">
                <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors focus-within:border-[#006F83]" style={{ borderColor: C.hair }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: C.muted }} />
                    <input
                        value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search sellers or chats"
                        // 16px on mobile prevents iOS focus-zoom
                        className="w-full bg-transparent text-[16px] font-medium outline-none placeholder:text-slate-400 sm:text-[13px]"
                        style={{ color: C.ink }}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3">
                {/* --- Existing chats --- */}
                {loading ? (
                    <div className="flex flex-wrap gap-x-1 gap-y-2">
                        {Array.from({ length: 6 }).map((_, i) => <IconSkeleton key={`c-${i}`} />)}
                    </div>
                ) : sortedConversations.length > 0 ? (
                    <div className="flex flex-wrap gap-x-1 gap-y-2">
                        {sortedConversations.map((c, i) => (
                            <motion.div
                                key={c.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.12), ease: EASE }}
                            >
                                <ContactTile
                                    logoUrl={c.otherShopLogo}
                                    shopName={c.otherShopName}
                                    unreadCount={c.unreadCount}
                                    isDeleted={!!c.otherIsDeletedSeller}
                                    onClick={() => onSelect(c.id)}
                                />
                            </motion.div>
                        ))}
                    </div>
                ) : null}

                {!loading && filteredConversations.length === 0 && q && (
                    <p className="px-1 py-3 text-[11.5px] font-medium" style={{ color: C.muted }}>No chats match "{query}".</p>
                )}

                {/* --- Approved sellers you haven't messaged yet --- */}
                {(sellersLoading || sortedNewSellers.length > 0) && (
                    <div className="mt-3 border-t px-1 pb-2 pt-3" style={{ borderColor: C.hairSoft }}>
                        <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Approved sellers</p>
                    </div>
                )}
                {sellersLoading ? (
                    <div className="flex flex-wrap gap-x-1 gap-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <IconSkeleton key={`s-${i}`} />)}
                    </div>
                ) : sortedNewSellers.length > 0 ? (
                    <div className="flex flex-wrap gap-x-1 gap-y-2">
                        {sortedNewSellers.map((s) => (
                            <ContactTile
                                key={s.id}
                                logoUrl={s.logoUrl}
                                shopName={s.shopName}
                                busy={starting === s.id}
                                onClick={() => startChat(s)}
                            />
                        ))}
                    </div>
                ) : null}

                {!loading && !sellersLoading && filteredConversations.length === 0 && filteredNewSellers.length === 0 && (
                    <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
                        <MessageSquare className="h-6 w-6" style={{ color: C.hair }} />
                        <p className="text-[13px] font-bold" style={{ color: C.ink }}>
                            {q ? "No matches" : "No approved sellers yet"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}