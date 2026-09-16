import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useSocket } from "./SocketContext.jsx";
import { fetchHelpStatus, triggerHelpRequest, markHelpResolutionSeen } from "../utils/api.js";

const HelpRequestContext = createContext(null);
export function useHelpRequest() {
    const ctx = useContext(HelpRequestContext);
    if (!ctx) throw new Error("useHelpRequest must be used inside <HelpRequestProvider>");
    return ctx;
}

export function HelpRequestProvider({ children }) {
    const { token, isLoggedIn } = useAuth();
    const { socket } = useSocket();
    const [stage, setStage] = useState(null); // 'pending' | 'open' | null (no active request)
    const [loading, setLoading] = useState(true);
    const [resolutionMessage, setResolutionMessage] = useState(null); // { id, notes }

    const load = useCallback(async () => {
        if (!token) { setStage(null); setLoading(false); return; }
        setLoading(true);
        const res = await fetchHelpStatus(token);
        if (res?.success) {
            setStage(res.active ? res.stage : null);
            if (res.pendingNotification) {
                setResolutionMessage(res.pendingNotification);
                markHelpResolutionSeen(token, res.pendingNotification.id);
            }
        }
        setLoading(false);
    }, [token]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!socket) return;
        const onAck = () => setStage("open");
        const onResolved = (p) => {
            setStage(null);
            setResolutionMessage({ id: p.id, notes: p.notes });
            markHelpResolutionSeen(token, p.id);
        };
        socket.on("help_request:acknowledged", onAck);
        socket.on("help_request:resolved", onResolved);
        return () => { socket.off("help_request:acknowledged", onAck); socket.off("help_request:resolved", onResolved); };
    }, [socket, token]);

    const trigger = useCallback(async () => {
        const res = await triggerHelpRequest(token);
        if (res?.success) { setStage("pending"); return { ok: true }; }
        if (res?.code === "ALREADY_ACTIVE") { setStage(res.stage || "pending"); return { ok: false, alreadyActive: true, message: res.message }; }
        return { ok: false, message: res?.message || "Something went wrong." };
    }, [token]);

    const dismissResolutionMessage = useCallback(() => setResolutionMessage(null), []);

    return (
        <HelpRequestContext.Provider value={{ active: !!stage, stage, loading, trigger, isLoggedIn, resolutionMessage, dismissResolutionMessage }}>
            {children}
        </HelpRequestContext.Provider>
    );
}