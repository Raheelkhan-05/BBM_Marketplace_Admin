// src/pages/SaveChatPage.jsx — buyer Messages inside the Save shell.
// Routes: /save/chat (icon grid) and /save/chat/:conversationId (thread).
// It IS the Grow chat (same component, same grow-modules.css styles, same hooks), only mounted under /save/chat.
import GrowChatPage from "./GrowChatPage.jsx";

export default function SaveChatPage() {
    return (
        <div className="sh-w svc">
            <GrowChatPage basePath="/save/chat" />
        </div>
    );
}