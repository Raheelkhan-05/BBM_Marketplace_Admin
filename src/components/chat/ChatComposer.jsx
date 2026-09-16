// components/chat/ChatComposer.jsx
import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";

const C = { ink: "#0B1116", muted: "#667077", secondary: "#006F83", hair: "rgba(11,17,22,0.09)" };

export default function ChatComposer({ onSend, sending, onTypingChange }) {
    const [value, setValue] = useState("");
    const textareaRef = useRef(null);

    const autoGrow = (e) => {
        setValue(e.target.value);
        onTypingChange?.(e.target.value.length > 0);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
    };
    const submit = () => {
        if (!value.trim()) return;
        onSend(value);
        onTypingChange?.(false);
        setValue("");
    };


    const onKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    return (
        <div className="flex items-end gap-2 border-t px-3 py-2.5 sm:px-4" style={{ borderColor: C.hair }}>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={autoGrow}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Type a message…"
                className="max-h-[120px] flex-1 resize-none rounded-2xl border bg-white px-3.5 py-2.5 text-[13.5px] font-medium leading-snug tracking-wide outline-none placeholder:text-slate-400"
                style={{ borderColor: C.hair, color: C.ink }}
            />
            <button
                onClick={submit}
                disabled={!value.trim() || sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:scale-105 disabled:opacity-50"
                style={{ background: C.secondary }}
            >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
        </div>
    );
}