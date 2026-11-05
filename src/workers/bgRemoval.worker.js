// workers/bgRemoval.worker.js
// Runs the background-removal model (BiRefNet-lite, MIT licence) entirely inside the admin's
// browser, off the main thread, so the page never freezes. Nothing is sent to a third party and
// nothing runs on the Render server. The model is downloaded once (~200 MB) and cached by the
// browser after that.
//
// Install once in the frontend:  npm i @huggingface/transformers
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";
const MAX_SIDE = 1600;                       // longest side we work at; keeps memory sane

let model = null;
let processor = null;
let loadPromise = null;
let device = "wasm";
let chain = Promise.resolve();               // jobs run one at a time

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function loadOn(dev) {
    const files = new Map();
    const progress_callback = (e) => {
        if (e.status === "progress" && e.total) {
            files.set(e.file, { loaded: e.loaded, total: e.total });
            let l = 0, t = 0;
            files.forEach((f) => { l += f.loaded; t += f.total; });
            post({ type: "model", status: "loading", pct: Math.round((l / t) * 100) });
        }
    };
    model = await AutoModel.from_pretrained(MODEL_ID, { device: dev, dtype: "fp32", progress_callback });
    processor = await AutoProcessor.from_pretrained(MODEL_ID);
    device = dev;
}

function ensureModel() {
    if (model && processor) return Promise.resolve();
    if (!loadPromise) {
        post({ type: "model", status: "loading", pct: 0 });
        loadPromise = (async () => {
            try {
                await loadOn(self.navigator?.gpu ? "webgpu" : "wasm");
            } catch {
                await loadOn("wasm");          // WebGPU unavailable / out of memory -> CPU (WASM)
            }
            post({ type: "model", status: "ready", device });
        })().catch((e) => { loadPromise = null; throw e; });
    }
    return loadPromise;
}

async function fetchBlob({ url, proxyUrl, token }) {
    try {
        const r = await fetch(url, { mode: "cors" });
        if (r.ok) return await r.blob();
    } catch { /* CORS or network -> try the server proxy */ }
    const r = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Couldn't download the original image.");
    return r.blob();
}

async function cutOut(job) {
    await ensureModel();
    const blob = await fetchBlob(job);
    let bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";                  // flatten any existing transparency for the model
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const src = ctx.getImageData(0, 0, w, h);

    const image = new RawImage(new Uint8ClampedArray(src.data), w, h, 4).rgb();
    const { pixel_values } = await processor(image);
    const { output_image } = await model({ input_image: pixel_values });
    const mask = await RawImage.fromTensor(output_image[0].sigmoid().mul(255).to("uint8")).resize(w, h);
    pixel_values.dispose?.();
    output_image.dispose?.();

    const alpha = mask.data;                  // 1 channel, w*h
    const out = src.data;
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) out[p] = alpha[i];

    ctx.putImageData(src, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === "init") {
        chain = chain.then(() => ensureModel()).catch((err) => post({ type: "model", status: "error", message: String(err?.message || err) }));
    } else if (msg.type === "run") {
        chain = chain.then(async () => {
            try {
                const blob = await cutOut(msg);
                post({ type: "done", id: msg.id, blob });
            } catch (err) {
                post({ type: "error", id: msg.id, message: String(err?.message || "Background removal failed.") });
            }
        });
    }
};