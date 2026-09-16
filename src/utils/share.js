// utils/share.js
export async function shareProductLink({ submissionId, productName, sellerName }) {
    const url = `${window.location.origin}/p/${submissionId}`;
    const shareData = {
        title: productName,
        text: `${productName} — sold by ${sellerName}`,
        url,
    };
    if (navigator.share) {
        try { await navigator.share(shareData); return "shared"; }
        catch (e) { if (e?.name === "AbortError") return "cancelled"; }
    }
    await navigator.clipboard.writeText(url);
    return "copied";
}