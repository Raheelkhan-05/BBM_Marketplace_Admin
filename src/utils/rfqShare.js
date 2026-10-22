// utils/rfqShare.js — share / copy the public link of a single enquiry.
import { fmtNum } from "./rfqUtils.js";

export const enquiryPath = (id) => `/grow/enquiry/${id}`;
export const enquiryUrl = (id) => `${window.location.origin}${enquiryPath(id)}`;

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for insecure contexts / older browsers.
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

/**
 * Opens the native share sheet when available, otherwise copies the link.
 * Resolves to "shared" | "copied" | "cancelled" | "failed".
 * `item` may be partial (only `id` is required).
 */
export async function shareEnquiry(item) {
    const url = enquiryUrl(item.id);
    const total = Number(item.quantity) * Number(item.packSize);
    const text = item.productName && total > 0
        ? `A buyer needs ${fmtNum(total)} ${item.unit || ""} of ${item.productName}. Send your best price.`.replace("  ", " ")
        : "A buyer is looking for quotes. Send your best price.";
    const data = { title: item.productName ? `Quote on ${item.productName}` : "Quote on this enquiry", text, url };

    if (navigator.share) {
        try {
            await navigator.share(data);
            return "shared";
        } catch (e) {
            if (e?.name === "AbortError") return "cancelled";
        }
    }
    return (await copyText(url)) ? "copied" : "failed";
}