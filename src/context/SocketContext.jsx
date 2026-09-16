// context/SocketContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
    const { token } = useAuth();
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!token) return;

        if (!import.meta.env.VITE_SOCKET_URL) {
            console.error("[socket] VITE_SOCKET_URL is not set — sockets will try to connect to the frontend's own origin, which is wrong unless API and app share a host.");
        }

        const socket = io(import.meta.env.VITE_SOCKET_URL, {
            auth: { token },
            // Client CAN force websocket-only — the risk of forcing transports
            // is server-side (breaks proxies that need the polling handshake
            // first); client-side this just skips a slower negotiation step.
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 10000,
        });

        socket.on("connect", () => { console.log("[socket] connected", socket.id); setConnected(true); });
        socket.on("disconnect", (reason) => { console.log("[socket] disconnected:", reason); setConnected(false); });
        socket.on("connect_error", (err) => console.error("[socket] connect_error:", err.message));
        socket.on("reconnect_attempt", (n) => console.log("[socket] reconnect attempt", n));

        socketRef.current = socket;

        // Real cleanup — this is what StrictMode's mount→unmount→remount in
        // dev exercises. If this cleanup doesn't fully tear down the old
        // socket, you end up with TWO sockets racing, which looks exactly
        // like "sometimes it works, sometimes it doesn't."
        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
            {children}
        </SocketContext.Provider>
    );
}