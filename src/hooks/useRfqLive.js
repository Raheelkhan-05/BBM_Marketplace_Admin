// src/hooks/useRfqLive.js
// Calls `onChange` whenever quotes change, so pages update without a manual refresh:
//   1) socket event "rfq_quotes_changed" (instant, once the server emit in rfqRealtime.js is wired)
//   2) tab regains focus / becomes visible
//   3) light poll every `interval` ms while the tab is visible (safety net)
// Bursts are merged into one call.
import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext.jsx";

export default function useRfqLive(onChange, { enabled = true, interval = 20000 } = {}) {
    const { socket } = useSocket();
    const cb = useRef(onChange);
    cb.current = onChange;

    useEffect(() => {
        if (!enabled) return undefined;
        let timer = null;
        const fire = () => {
            clearTimeout(timer);
            timer = setTimeout(() => cb.current?.(), 350);
        };
        const onVis = () => { if (document.visibilityState === "visible") fire(); };
        const poll = setInterval(() => { if (document.visibilityState === "visible") fire(); }, interval);

        socket?.on("rfq_quotes_changed", fire);
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("focus", fire);
        return () => {
            clearTimeout(timer);
            clearInterval(poll);
            socket?.off("rfq_quotes_changed", fire);
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("focus", fire);
        };
    }, [socket, enabled, interval]);
}