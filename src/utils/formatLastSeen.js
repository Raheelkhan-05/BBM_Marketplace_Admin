// utils/formatLastSeen.js
export function formatLastSeen(iso) {
    if (!iso) return "Offline";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Last seen just now";
    if (mins < 60) return `Last seen ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Last seen ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? "Last seen yesterday" : `Last seen ${days}d ago`;
}