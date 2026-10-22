export const inr = (n, d = 2) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: d });
export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
export const validText = (q) => (q.lifetime || !q.validUntil ? "No expiry" : `Valid till ${shortDate(q.validUntil)}`);
export const etaText = (q) => {
    const max = q.deliveryDays, min = q.deliveryDaysMin ?? max;
    if (max == null) return "";
    if (min === max) return `~${max} ${max === 1 ? "day" : "days"}`;
    return `${min}–${max} days`;
};