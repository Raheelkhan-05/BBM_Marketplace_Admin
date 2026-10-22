// components/grow/growReturn.js
// "Where should the seller land after signing in / finishing onboarding?"
// Pages send people into the start flow with:  nav("/grow?start=1", { state: { from: "/grow/enquiry/12" } })

// Only same-site absolute paths are accepted (blocks "//evil.com" and full URLs).
export const safeFrom = (v) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : null);

// Enquiry pages we resume to: the list (/grow/enquiries[?tab=..]) and a single enquiry (/grow/enquiry/:id).
export const isEnquiryPath = (p) => !!p && /^\/grow\/enquir(?:ies|y\/[^/?#]+)(?:[/?#]|$)/.test(p);

// Link target for the "go back" button / redirect, or null when the seller did not come from an enquiry page.
export const enquiryReturnTo = (from) => {
    const p = safeFrom(from);
    return isEnquiryPath(p) ? p : null;
};