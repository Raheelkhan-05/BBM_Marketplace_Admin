// components/credit/tokens.js
//
// Design tokens shared with HomeProductFeed: black primary, hairline borders,
// #F4F5F6 image tiles, #FCFBF9 panels, teal (#006F83) only as a small accent.
export const C = {
    ink: "#0B1116", muted: "#667077",
    primary: "#000000", accent: "#006F83",
    hair: "rgba(11,17,22,0.09)", hairSoft: "rgba(11,17,22,0.05)",
    imgBg: "#F4F5F6", panel: "#FCFBF9",
    ok: "#059669", okBg: "#EAF7F2",
    warn: "#a16207", warnBg: "#FDF3D8",
    danger: "#C71F11", dangerBg: "rgba(199,31,17,0.07)",
    badge: "#d2462b",
};

export const EASE = [0.16, 1, 0.3, 1];

export const fmtINR = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function initials(name) {
    return (name || "?").trim().split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function shortDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function timeLabel(iso) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date().setHours(0, 0, 0, 0);
    const diff = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", {
        day: "numeric", month: "short",
        year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
}

