// utils/resizeImageForSearch.js
//
// Downscales a photo client-side before it's sent to the image-search
// endpoint — keeps the upload small and keeps GPT-5.6-Luna's image-token
// cost down without hurting recognizability.

const MAX_DIMENSION = 768;
const JPEG_QUALITY = 0.75;

// Returns { base64, mimeType } — base64 has no "data:" prefix.
export function resizeImageForSearch(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;
            if (width > height && width > MAX_DIMENSION) {
                height = Math.round((height * MAX_DIMENSION) / width);
                width = MAX_DIMENSION;
            } else if (height > MAX_DIMENSION) {
                width = Math.round((width * MAX_DIMENSION) / height);
                height = MAX_DIMENSION;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
            const base64 = dataUrl.split(",")[1];
            resolve({ base64, mimeType: "image/jpeg" });
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not read that image."));
        };

        img.src = objectUrl;
    });
}