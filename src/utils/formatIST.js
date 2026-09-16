// Data is always stored/transmitted as UTC (timestamptz / ISO string) —
// this is purely a display concern, so DST/offset math never touches the DB.
export function formatIST(dateString) {
    if (!dateString) return "—";
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
    }).format(new Date(dateString));
}