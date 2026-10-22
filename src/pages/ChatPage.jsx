// pages/ChatPage.jsx
//
// Two-pane on desktop, single-pane router-driven on mobile: /chat shows
// the list, /chat/:conversationId shows the thread.
//
// The conversation list is fetched once (via ChatContext) and the matching
// row is handed down to ChatWindow as `meta`, so opening a thread only
// waits on the messages request.
//
// MOBILE KEYBOARD FIX: on iOS Safari and modern Android Chrome the keyboard
// shrinks only the *visual* viewport, not the layout viewport, so `100dvh`
// never changes and the browser scrolls the whole page to reveal the
// focused input (the "jump"). On mobile the open thread is therefore pinned
// to the visual viewport (top + height published as CSS variables), so the
// composer always sits exactly above the keyboard.
import { useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConversationList from "../components/chat/ConversationList.jsx";
import ChatWindow from "../components/chat/ChatWindow.jsx";
import { MessageSquare } from "lucide-react";
import { useChatContext } from "../context/ChatContext.jsx";

const C = { ink: "#0B1116", muted: "#667077", hair: "rgba(11,17,22,0.09)" };

// Publishes the visual viewport (the area above the keyboard) as CSS vars.
function useVisualViewportVars() {
    useEffect(() => {
        const vv = window.visualViewport;
        const root = document.documentElement;
        const update = () => {
            root.style.setProperty("--vvh", `${vv ? vv.height : window.innerHeight}px`);
            root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
        };
        update();
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        window.addEventListener("orientationchange", update);
        return () => {
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
            window.removeEventListener("orientationchange", update);
            root.style.removeProperty("--vvh");
            root.style.removeProperty("--vvt");
        };
    }, []);
}

// Stops the page behind the thread from scrolling/bouncing on mobile.
function useLockBodyScroll(active) {
    useEffect(() => {
        if (!active || !window.matchMedia("(max-width: 639px)").matches) return;
        const html = document.documentElement;
        const body = document.body;
        const prev = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior];
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        html.style.overscrollBehavior = "none";
        return () => {
            html.style.overflow = prev[0];
            body.style.overflow = prev[1];
            html.style.overscrollBehavior = prev[2];
        };
    }, [active]);
}

export default function ChatPage() {
    const { conversationId } = useParams();
    const navigate = useNavigate();
    const { conversations, loading, reload, markLocalRead } = useChatContext();

    useVisualViewportVars();
    useLockBodyScroll(!!conversationId);

    const activeMeta = useMemo(
        () => conversations.find((c) => c.id === conversationId) || null,
        [conversations, conversationId],
    );

    const handleSelect = (id) => {
        markLocalRead(id);
        navigate(`/chat/${id}`);
    };

    return (
        <div className="mx-auto flex h-[calc(100dvh-10px)] max-w-7xl overflow-hidden sm:h-[calc(100dvh-56px)]">
            <div className={`w-full shrink-0 border-r sm:w-[340px] sm:block ${conversationId ? "hidden" : "block"}`} style={{ borderColor: C.hair }}>
                <ConversationList
                    conversations={conversations}
                    loading={loading}
                    activeId={conversationId}
                    onSelect={handleSelect}
                    reload={reload}
                />
            </div>

            {/* On mobile the open thread is fixed to the visual viewport, so it
                always sits right above the keyboard. Needs Tailwind 3.2+ for max-sm:. */}
            <div
                className={`min-w-0 flex-1 ${conversationId
                    ? "block max-sm:fixed max-sm:inset-x-0 max-sm:top-[var(--vvt,0px)] max-sm:z-[60] max-sm:h-[var(--vvh,100dvh)] max-sm:bg-white"
                    : "hidden sm:block"}`}
            >
                {conversationId ? (
                    // no `key` remount here on purpose — useChatMessages already
                    // keys its own fetch/cache off conversationId, so switching
                    // threads reuses the mounted component and keeps the
                    // instant-from-cache paint.
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