// utils/imageProbe.js
// Reads just the first bytes of a file to find out what it REALLY is (the file name and the
// browser's reported type are often wrong) and, where possible, its pixel size. Used by the
// Image Studio worker and page to shrink huge photos while decoding and to give exact errors.
export async function probeImage(blob) {
    let b;
    try { b = new Uint8Array(await blob.slice(0, 262144).arrayBuffer()); } catch { return { type: "unknown", width: 0, height: 0 }; }
    const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
    const be32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

    if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        return { type: "png", width: be32(16), height: be32(20) };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
        let i = 2;
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) { i++; continue; }
            const m = b[i + 1];
            if (m === 0xff) { i++; continue; }
            if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
                return { type: "jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
            }
            i += 2 + ((b[i + 2] << 8) | b[i + 3]);
        }
        return { type: "jpeg", width: 0, height: 0 };
    }
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
        const k = ascii(12, 16);
        if (k === "VP8 ") return { type: "webp", width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
        if (k === "VP8L") return { type: "webp", width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
        if (k === "VP8X") return { type: "webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
        return { type: "webp", width: 0, height: 0 };
    }
    if (ascii(0, 4) === "GIF8") return { type: "gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
    if (ascii(4, 8) === "ftyp") {
        const brand = ascii(8, 12);
        if (brand === "avif" || brand === "avis") return { type: "avif", width: 0, height: 0 };
        return { type: "heic", width: 0, height: 0 };          // heic / heix / mif1 / msf1 ...
    }
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) {
        return { type: "tiff", width: 0, height: 0 };
    }
    if (/<svg/i.test(ascii(0, Math.min(b.length, 2000)))) return { type: "svg", width: 0, height: 0 };
    return { type: "unknown", width: 0, height: 0 };
}

export const NOT_SUPPORTED = new Set(["heic", "tiff", "unknown"]);

export function describeProblem(p) {
    const t = (p.type || "unknown").toUpperCase();
    if (NOT_SUPPORTED.has(p.type)) {
        return p.type === "unknown"
            ? "This file isn't a picture the browser can read. Please upload a JPG, PNG or WebP photo."
            : `This is a ${t} file, which browsers can't process here. Save or export it as JPG or PNG and upload again.`;
    }
    const dims = p.width && p.height ? ` (${p.width}×${p.height})` : "";
    return `This ${t} photo${dims} couldn't be opened. It may be damaged or incomplete. Try re-saving it as a JPG.`;
}