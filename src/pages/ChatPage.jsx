// pages/ChatPage.jsx
//
// Two-pane on desktop, single-pane router-driven on mobile: /chat shows
// the list, /chat/:conversationId shows the thread.
//
// PERFORMANCE FIX: ChatWindow used to call fetchConversations() a second
// time on every open, purely to read one row's {title, otherUserId} for
// its header — a full list round trip just to render two lines of text,
// on top of the messages fetch it was already doing. The list is fetched
// once here and the matching row is handed down as `meta`, so opening a
// thread now only waits on the messages request.
import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConversationList from "../components/chat/ConversationList.jsx";
import ChatWindow from "../components/chat/ChatWindow.jsx";
import { useConversations } from "../hooks/useChat.js";
import { MessageSquare } from "lucide-react";

import { useChatContext } from "../context/ChatContext.jsx";


const C = { ink: "#0B1116", muted: "#667077", hair: "rgba(11,17,22,0.09)" };

export default function ChatPage() {
    const { conversationId } = useParams();
    const navigate = useNavigate();
    const { conversations, loading, reload, markLocalRead } = useChatContext();

    const activeMeta = useMemo(
        () => conversations.find((c) => c.id === conversationId) || null,
        [conversations, conversationId],
    );

    const handleSelect = (id) => {
        markLocalRead(id);
        navigate(`/chat/${id}`);
    };

    return (
        <div className="mx-auto flex h-[calc(100dvh-56px)] max-w-7xl overflow-hidden sm:h-[calc(100dvh-56px)]">
            <div className={`w-full shrink-0 border-r sm:w-[340px] sm:block ${conversationId ? "hidden" : "block"}`} style={{ borderColor: C.hair }}>
                <ConversationList
                    conversations={conversations}
                    loading={loading}
                    activeId={conversationId}
                    onSelect={handleSelect}
                    reload={reload}
                />
            </div>

            <div className={`min-w-0 flex-1 ${conversationId ? "block" : "hidden sm:block"}`}>
                {conversationId ? (
                    // no `key` remount here on purpose — useChatMessages
                    // already keys its own fetch/cache off conversationId,
                    // so switching threads reuses the mounted component
                    // instead of tearing the whole subtree down and losing
                    // the instant-from-cache paint.
                    <ChatWindow conversationId={conversationId} meta={activeMeta} onBack={() => navigate("/chat")} />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <MessageSquare className="h-8 w-8" style={{ color: C.hair }} />
                        <p className="text-[13.5px] font-bold" style={{ color: C.ink }}>Select a conversation</p>
                        <p className="text-[12px] font-medium" style={{ color: C.muted }}>Or start a new one from the list.</p>
                    </div>
                )}
            </div>
        </div>
    );
}