// context/ChatContext.jsx
//
// Wraps useConversations() as a single shared instance — ChatPage,
// Header (desktop nav badge), and BottomNavStrip (mobile nav badge) all
// read from this instead of each mounting their own
// fetch + socket subscription.
import { createContext, useContext } from "react";
import { useConversations } from "../hooks/useChat.js";

const ChatContext = createContext(null);

export function useChatContext() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error("useChatContext must be used inside <ChatProvider>");
    return ctx;
}

export function ChatProvider({ children }) {
    const value = useConversations();
    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}