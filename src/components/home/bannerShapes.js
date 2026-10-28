// components/home/bannerShapes.js
export const SHAPE_LIST = [
    { key: "wide", label: "16:9", ratio: 16 / 9, required: true, hint: "Hero banners and filtered views" },
    { key: "landscape", label: "4:3", ratio: 4 / 3, hint: "Side-by-side and mosaic tiles" },
    { key: "square", label: "1:1", ratio: 1, hint: "Grids and mobile pairs" },
    { key: "portrait", label: "3:4", ratio: 3 / 4, hint: "Tall tiles" },
];
export const SHAPE_BY_KEY = Object.fromEntries(SHAPE_LIST.map((s) => [s.key, s]));
export const SHAPE_RATIO = Object.fromEntries(SHAPE_LIST.map((s) => [s.key, s.ratio]));

// Closest available image to a slot's ratio (the slot crops the rest with object-cover).
export function pickImage(banner, targetRatio) {
    const imgs = banner?.images || {};
    let best = null, cost = Infinity;
    for (const [shape, url] of Object.entries(imgs)) {
        const r = SHAPE_RATIO[shape];
        if (!r || !url) continue;
        const c = Math.abs(Math.log(targetRatio / r));
        if (c < cost - 1e-9) { cost = c; best = { shape, url }; }
    }
    return best || (banner?.image_url ? { shape: "wide", url: banner.image_url } : null);
}