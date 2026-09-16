// components/chat/ConversationList.jsx
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, MessageSquare, Loader2, Store } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchApprovedSellers, getOrCreateDirectConversation } from "../../utils/chatApi.js";

const C = { ink: "#0B1116", muted: "#667077", primary: "#D2462B", secondary: "#006F83", hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)" };
const EASE = [0.16, 1, 0.3, 1];

function timeLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
        ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
        : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Only ever initial-ise off the shop name — personal name is never passed in.
function initials(shopName) {
    return (shopName || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function RowSkeleton() {
    return (
        <div className="flex items-center gap-3 px-3.5 py-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
                <div className="h-2.5 w-3/5 animate-pulse rounded-full" style={{ background: C.hairSoft }} />
            </div>
        </div>
    );
}

function Avatar({ logoUrl, shopName, size = "h-11 w-11", muted = false }) {
    if (logoUrl) {
        return (
            <img
                src={logoUrl}
                alt={shopName || "Shop"}
                className={`${size} shrink-0 rounded-full object-cover shadow-sm`}
                style={{ border: `1px solid ${C.hair}`, filter: muted ? "grayscale(1)" : "none", opacity: muted ? 0.6 : 1 }}
                onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
            />
        );
    }
    return (
        <span className={`flex ${size} shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white shadow-sm`}
            style={{ background: muted ? "#9AA3A8" : "linear-gradient(135deg, #006F83 0%, #4FA3B0 100%)" }}>
            {initials(shopName)}
        </span>
    );
}

// Small inline tag used wherever a deleted seller's shop name is shown —
// the name itself stays exactly as it was, this just flags the account.
function DeletedTag() {
    return (
        <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide" style={{ background: "#fdecea", color: "#c71f11" }}>
            Deleted
        </span>
    );
}

export default function ConversationList({ conversations, loading, activeId, onSelect, reload }) {
    const { token } = useAuth();
    const [query, setQuery] = useState("");
    const [sellers, setSellers] = useState([]);
    const [sellersLoading, setSellersLoading] = useState(true);
    const [starting, setStarting] = useState(null);

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

    // Sellers who don't have an existing conversation yet — those already show up below.
    // Note: fetchApprovedSellers already excludes deleted sellers server-side,
    // so this "start a new chat" list never surfaces one — a deleted seller
    // can only still be seen here if there's already a conversation with
    // them (handled by the conversations list below, with its own badge).
    const conversationSellerIds = useMemo(
        () => new Set(conversations.filter((c) => c.otherUserId).map((c) => String(c.otherUserId).toLowerCase())),
        [conversations],
    );
    const newSellers = sellers.filter((s) => !conversationSellerIds.has(String(s.id).toLowerCase()));

    const q = query.trim().toLowerCase();
    const filteredConversations = conversations.filter((c) => (c.otherShopName || "").toLowerCase().includes(q));
    const filteredNewSellers = newSellers.filter((s) => (s.shopName || "").toLowerCase().includes(q));

    const startChat = async (seller) => {
        setStarting(seller.id);
        const res = await getOrCreateDirectConversation(token, seller.id);
        if (res?.success) {
            await reload();       // wait for the conversations list to include it...
            onSelect(res.conversationId); // ...before navigating, so the seller list has already dropped it
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
                        className="w-full bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400"
                        style={{ color: C.ink }}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* --- Existing chats --- */}
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={`c-${i}`} />)
                ) : (
                    filteredConversations.map((c, i) => {
                        const active = c.id === activeId;
                        const isDeleted = !!c.otherIsDeletedSeller;
                        return (
                            <motion.button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.12), ease: EASE }}
                                className="flex w-full items-center gap-3 border-b px-3.5 py-3 text-left transition-colors duration-150"
                                style={{ borderColor: C.hairSoft, background: active ? `${C.secondary}0f` : "transparent" }}
                            >
                                <Avatar logoUrl={c.otherShopLogo} shopName={c.otherShopName} muted={isDeleted} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            <p className="truncate text-[13.5px] font-extrabold tracking-wide" style={{ color: isDeleted ? C.muted : C.ink }}>
                                                {c.otherShopName || "Unknown seller"}
                                            </p>
                                            {isDeleted && <DeletedTag />}
                                        </span>
                                        <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: c.unreadCount > 0 ? C.secondary : C.muted }}>
                                            {timeLabel(c.lastMessageAt)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-between gap-2">
                                        <p className="truncate text-[12px] font-medium" style={{ color: c.unreadCount > 0 ? C.ink : C.muted }}>
                                            {c.lastMessageIsMine && "You: "}{c.lastMessagePreview || "Say hello 👋"}
                                        </p>
                                        {c.unreadCount > 0 && (
                                            <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: C.primary }}>
                                                {c.unreadCount > 9 ? "9+" : c.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </motion.button>
                        );
                    })
                )}

                {!loading && filteredConversations.length === 0 && q && (
                    <p className="px-3.5 py-3 text-[11.5px] font-medium" style={{ color: C.muted }}>No chats match "{query}".</p>
                )}

                {/* --- Approved sellers you haven't messaged yet --- */}
                {(sellersLoading || filteredNewSellers.length > 0) && (
                    <div className="mt-1 border-t px-3.5 pb-1 pt-3" style={{ borderColor: C.hairSoft }}>
                        <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>Approved sellers</p>
                    </div>
                )}
                {sellersLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={`s-${i}`} />)
                ) : (
                    filteredNewSellers.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => startChat(s)}
                            disabled={starting === s.id}
                            className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-black/[0.02]"
                        >
                            <Avatar logoUrl={s.logoUrl} shopName={s.shopName} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-extrabold tracking-wide" style={{ color: C.ink }}>
                                    {s.shopName}
                                </span>
                                <span className="block text-[11.5px] font-medium" style={{ color: C.muted }}>Tap to start chatting</span>
                            </span>
                            {starting === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: C.secondary }} />}
                        </button>
                    ))
                )}

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