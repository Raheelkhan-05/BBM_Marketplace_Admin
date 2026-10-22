import { useCallback, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext.jsx";

// Silent refetch on: server ping, socket reconnect, tab focus. No spinner, no page refresh.
export default function useSalesRealtime(refresh) {
    const { socket, connected } = useSocket();
    const ref = useRef(refresh); ref.current = refresh;
    const timer = useRef(null);
    const ping = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => ref.current?.(), 150); }, []);

    useEffect(() => {
        if (!socket) return undefined;
        socket.on("sales:customers_changed", ping);
        return () => { socket.off("sales:customers_changed", ping); clearTimeout(timer.current); };
    }, [socket, ping]);

    const prev = useRef(connected);
    useEffect(() => { if (connected && !prev.current) ref.current?.(); prev.current = connected; }, [connected]);

    useEffect(() => {
        const on = () => { if (document.visibilityState === "visible") ref.current?.(); };
        document.addEventListener("visibilitychange", on);
        return () => document.removeEventListener("visibilitychange", on);
    }, []);
}