// components/chat/ConnectionBanner.jsx — drop into ChatWindow
import { useSocket } from "../../context/SocketContext.jsx";

export default function ConnectionBanner() {
    const { connected } = useSocket();
    if (connected) return null;
    return (
        <div className="px-4 py-1.5 text-center text-[11.5px] font-bold text-white" style={{ background: "#c71f11" }}>
            Reconnecting…
        </div>
    );
}