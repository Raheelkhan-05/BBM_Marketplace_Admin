// components/chat/NewChatModal.jsx
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Search, Loader2, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { searchChatUsers, getOrCreateDirectConversation } from "../../utils/chatApi.js";

const C = { ink: "#0B1116", muted: "#667077", secondary: "#006F83", hair: "rgba(11,17,22,0.09)" };

export default function NewChatModal({ onClose, onCreated }) {
    const { token } = useAuth();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [starting, setStarting] = useState(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length < 2) { setResults([]); return; }
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            const res = await searchChatUsers(token, query.trim());
            if (res?.success) setResults(res.users);
            setLoading(false);
        }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [query, token]);

    const start = async (user) => {
        setStarting(user.id);
        const res = await getOrCreateDirectConversation(token, user.id);
        setStarting(null);
        if (res?.success) onCreated(res.conversationId);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.hair }}>
                    <p className="text-[14px] font-extrabold tracking-wide" style={{ color: C.ink }}>New message</p>
                    <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5"><X className="h-4 w-4" style={{ color: C.muted }} /></button>
                </div>
                <div className="px-4 pt-3">
                    <div className="flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: C.hair }}>
                        <Search className="h-3.5 w-3.5" style={{ color: C.muted }} />
                        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name"
                            className="w-full bg-transparent text-[13px] font-medium outline-none" style={{ color: C.ink }} />
                    </div>
                </div>
                <div className="max-h-72 overflow-y-auto px-2 py-2">
                    {loading && <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" style={{ color: C.muted }} /></div>}
                    {!loading && results.map((u) => (
                        <button key={u.id} onClick={() => start(u)} disabled={starting === u.id}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-black/[0.03]">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(11,17,22,0.06)" }}>
                                <User className="h-3.5 w-3.5" style={{ color: C.muted }} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-bold" style={{ color: C.ink }}>{u.name}</span>
                                {u.shopName && (
                                    <span className="block truncate text-[10.5px] font-bold" style={{ color: C.primary }}>
                                        {u.shopName}
                                    </span>
                                )}
                            </span>
                            {starting === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: C.secondary }} />}
                        </button>
                    ))}
                    {!loading && query.trim().length >= 2 && results.length === 0 && (
                        <p className="px-2.5 py-6 text-center text-[12px] font-medium" style={{ color: C.muted }}>No users found.</p>
                    )}
                </div>
            </motion.div>
        </div>
    );
}