// utils/colorExtract.js

function rgbToHex(r, g, b) {
    return (
        "#" +
        [r, g, b]
            .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
            .join("")
    );
}

function distance(a, b) {
    return (
        (a.r - b.r) ** 2 +
        (a.g - b.g) ** 2 +
        (a.b - b.b) ** 2
    );
}

function saturation(r, g, b) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

export function extractColorsFromImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
            try {
                const SIZE = 120;

                const canvas = document.createElement("canvas");
                canvas.width = SIZE;
                canvas.height = SIZE;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, SIZE, SIZE);

                const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

                const pixels = [];

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Ignore transparent pixels
                    if (a < 220) continue;

                    const brightness = (r + g + b) / 3;

                    // Ignore almost white
                    if (brightness > 248) continue;

                    // Ignore almost black
                    if (brightness < 8) continue;

                    // Ignore greys
                    if (saturation(r, g, b) < 18) continue;

                    pixels.push({ r, g, b });
                }

                if (pixels.length === 0) {
                    return resolve({
                        primary: "#047084",
                        secondary: "#0a95ab",
                        accent: "#d2462b",
                    });
                }

                const K = Math.min(3, pixels.length);

                // Random initial centroids
                const centroids = [];
                const used = new Set();

                while (centroids.length < K) {
                    const idx = Math.floor(Math.random() * pixels.length);
                    if (!used.has(idx)) {
                        used.add(idx);
                        centroids.push({ ...pixels[idx] });
                    }
                }

                // K-Means
                for (let iter = 0; iter < 12; iter++) {
                    const groups = Array.from({ length: K }, () => []);

                    for (const pixel of pixels) {
                        let best = 0;
                        let bestDist = Infinity;

                        for (let j = 0; j < K; j++) {
                            const d = distance(pixel, centroids[j]);
                            if (d < bestDist) {
                                bestDist = d;
                                best = j;
                            }
                        }

                        groups[best].push(pixel);
                    }

                    for (let j = 0; j < K; j++) {
                        if (!groups[j].length) continue;

                        let r = 0,
                            g = 0,
                            b = 0;

                        for (const p of groups[j]) {
                            r += p.r;
                            g += p.g;
                            b += p.b;
                        }

                        centroids[j] = {
                            r: r / groups[j].length,
                            g: g / groups[j].length,
                            b: b / groups[j].length,
                            count: groups[j].length,
                        };
                    }
                }

                centroids.sort((a, b) => (b.count || 0) - (a.count || 0));

                const primary = centroids[0];
                const secondary = centroids[1] || primary;
                const accent = centroids[2] || secondary || primary;

                resolve({
                    primary: rgbToHex(primary.r, primary.g, primary.b),
                    secondary: rgbToHex(secondary.r, secondary.g, secondary.b),
                    accent: rgbToHex(accent.r, accent.g, accent.b),
                });
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = reject;
        img.src = url;
    });
}