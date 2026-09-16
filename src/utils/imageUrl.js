// src/utils/imageUrl.js
//
// Your catalog images are hosted across three different places with three
// different capabilities:
//   1. Supabase Storage  — CAN be resized server-side, but only via its
//      dedicated "render" endpoint (/storage/v1/render/image/public/...),
//      NOT by adding query params to the normal /object/public/ URL. Also
//      only works if Image Transformations are enabled on your Supabase
//      plan (Pro+) — on the free plan this endpoint 400s.
//   2. ibb.co / i.ibb.co — a free static host with NO resize API at all.
//      Whatever was uploaded is whatever gets served, always full size.
//   3. Google Drive thumbnail links — already support a `sz=wNNN` param,
//      so we can just ask for a smaller size directly.
//
// Rather than special-case all of that (and silently do nothing for ibb.co
// links, which was the bug in the previous version of this file), every
// non-Drive URL is routed through wsrv.nl — a free public image proxy that
// fetches ANY public image URL once, resizes + compresses it, and serves
// the result from its own CDN afterwards. This gives every image the same
// resize/compress treatment no matter which of your three sources it came
// from, with zero backend work and no paid plan required.
//
// wsrv.nl is a long-running, widely used service (originally
// images.weserv.nl) built exactly for this. It's a good stopgap; for new
// uploads going forward, prefer storing directly in Supabase (see note at
// bottom of this file) so you're not depending on a third party for
// something this core to page weight.

const WSRV_BASE = "https://wsrv.nl/";
const GOOGLE_DRIVE_THUMB_MARKER = "drive.google.com/thumbnail";

/**
 * Returns a resized + compressed version of `url` at roughly `width` px
 * wide. Safe to call on any URL, including ones we don't recognize —
 * unrecognized cases just get proxied through wsrv.nl anyway, which will
 * still shrink/compress them since it works on any public image URL, not
 * just ones from specific hosts.
 */
export function resizedImageUrl(url, { width = 128, quality = 75 } = {}) {
    if (!url || typeof url !== "string") return url;

    // Google Drive thumbnail links already carry a size param — cheapest
    // fix is to just overwrite it rather than proxy through a third party.
    if (url.includes(GOOGLE_DRIVE_THUMB_MARKER)) {
        return url.replace(/([?&])sz=w\d+/, `$1sz=w${width}`);
    }

    // Everything else (Supabase Storage, ibb.co, or anything future) goes
    // through wsrv.nl. `url` param must be the ORIGINAL absolute URL,
    // URL-encoded; `w` is target width in px; `q` is JPEG/WebP quality
    // (1-100); `output=webp` asks for WebP when the browser supports it,
    // which is meaningfully smaller than PNG/JPEG for photos.
    const params = new URLSearchParams({
        url,
        w: String(width),
        q: String(quality),
        output: "webp",
        fit: "cover",
    });
    return `${WSRV_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------
// Supabase-native resizing (optional, only relevant if you separately
// confirm Image Transformations are enabled on your Supabase plan). Not
// used by resizedImageUrl above by default — wsrv.nl already handles
// Supabase URLs fine and needs no plan upgrade — but kept here in case you
// want to switch to Supabase's own transform endpoint later for images you
// know are on Supabase (it can be faster since there's one less network
// hop, once transforms are enabled on your project).
const SUPABASE_OBJECT_MARKER = "/storage/v1/object/public/";
const SUPABASE_RENDER_MARKER = "/storage/v1/render/image/public/";

export function supabaseResizedImageUrl(url, { width, quality = 75 } = {}) {
    if (!url || typeof url !== "string") return url;
    if (!url.includes(SUPABASE_OBJECT_MARKER)) return url;

    // Swap the PATH itself — not just query params — from /object/public/
    // to /render/image/public/. This is the part the earlier version of
    // this helper got wrong.
    const [base, existingQuery] = url
        .replace(SUPABASE_OBJECT_MARKER, SUPABASE_RENDER_MARKER)
        .split("?");
    const params = new URLSearchParams(existingQuery || "");
    if (width) params.set("width", String(width));
    params.set("quality", String(quality));
    params.set("resize", "cover");
    return `${base}?${params.toString()}`;
}