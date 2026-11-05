// workers/bgRemoval.worker.js
// Runs the background-removal model (BiRefNet-lite, MIT licence) entirely inside the admin's
// browser, off the main thread, so the page never freezes. Nothing is sent to a third party and
// nothing runs on the Render server. The model is downloaded once (~200 MB) and cached by the
// browser after that.
//
// IMPORTANT DESIGN NOTE: a WebAssembly heap can only grow, never shrink. So when memory runs out
// this worker does NOT retry itself — it reports code "memory" and the page terminates it and starts
// a brand-new worker (fresh heap) at a lower resolution. See AdminImageStudioPage.jsx.
//
// Install once in the frontend:  npm i @huggingface/transformers
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import { probeImage, describeProblem, NOT_SUPPORTED } from "../utils/imageProbe.js";

env.allowLocalModels = false;
try { if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1; } catch { /* optional */ }

const MODEL_ID = "wonfy/BiRefNet_lite-ONNX-webgpu";

// Keep source images smaller to reduce browser memory usage.
const MAX_SIDE = 1024;

let RES = 1024;                               // model input size (multiple of 32); set by the page per worker
let model = null;
let processor = null;
let loadPromise = null;
let chain = Promise.resolve();               // jobs run one at a time

const post = (msg) => self.postMessage(msg);
const codeError = (message, code) => Object.assign(new Error(message), { code });
// ORT-web throws things like "std::bad_alloc", "Out of memory", or even a bare number (a wasm pointer).
const isMemoryError = (e) => /bad_alloc|out of memory|allocation|memory access out of bounds|^\d+$/i.test(String(e?.message ?? e));


function ensureModel() {
    if (model && processor) return Promise.resolve();

    if (!loadPromise) {
        loadPromise = (async () => {
            // Do not silently fall back to the old WASM FP32 model.
            if (!self.navigator?.gpu) {
                throw codeError(
                    "WebGPU is unavailable on this device. Please use a supported desktop browser or enable server-side processing.",
                    "unsupported"
                );
            }

            post({
                type: "model",
                status: "loading",
                pct: 0
            });

            const files = new Map();

            const progress_callback = (e) => {
                if (e.status === "progress" && e.total) {
                    files.set(e.file, {
                        loaded: e.loaded,
                        total: e.total
                    });

                    let loaded = 0;
                    let total = 0;

                    files.forEach((f) => {
                        loaded += f.loaded;
                        total += f.total;
                    });

                    post({
                        type: "model",
                        status: "loading",
                        pct: total
                            ? Math.round((loaded / total) * 100)
                            : 0
                    });
                }
            };

            // GPU execution with the compatible FP16 model file.
            // Inputs and outputs remain FP32.
            model = await AutoModel.from_pretrained(MODEL_ID, {
                device: "webgpu",
                dtype: "fp32",
                model_file_name: "model_fp16",
                progress_callback
            });

            processor = await AutoProcessor.from_pretrained(MODEL_ID);

            post({
                type: "model",
                status: "ready",
                device: "webgpu",
                resolution: RES
            });
        })().catch((e) => {
            model = null;
            processor = null;
            loadPromise = null;
            throw e;
        });
    }

    return loadPromise;
}


async function fetchBlob({ file, url, proxyUrl, token }) {
    if (file) return file;                   // picked from the admin's computer
    try {
        const r = await fetch(url, { mode: "cors" });
        if (r.ok) return await r.blob();
    } catch { /* CORS or network -> try the server proxy */ }
    const r = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Couldn't download the original image.");
    return r.blob();
}

// Decode at a sane size: a 12000×9000 camera photo is shrunk DURING decoding instead of being
// fully expanded in memory first. Unsupported formats get an exact explanation.
async function decode(blob) {
    const probe = await probeImage(blob);
    if (NOT_SUPPORTED.has(probe.type)) throw codeError(describeProblem(probe), "unsupported");
    try {
        if (!blob.size) throw new Error("empty");
        const long = Math.max(probe.width, probe.height);
        if (long > MAX_SIDE) {
            const k = MAX_SIDE / long;
            return await createImageBitmap(blob, {
                resizeWidth: Math.max(1, Math.round(probe.width * k)),
                resizeHeight: Math.max(1, Math.round(probe.height * k)),
                resizeQuality: "high",
            });
        }
        return await createImageBitmap(blob);
    } catch {
        // SVG and a few oddities can still be rendered by the page's regular <img> decoder.
        throw codeError(describeProblem(probe), probe.type === "svg" || probe.type === "avif" ? "decode" : "unsupported");
    }
}

async function cutOut(job) {
    try {
        await ensureModel();
    } catch (e) {
        throw codeError(String(e?.message || "Couldn't load the AI model."), isMemoryError(e) ? "memory" : "load");
    }
    const blob = await fetchBlob(job);
    const bmp = await decode(blob);

    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";                  // flatten any existing transparency for the model
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const src = ctx.getImageData(0, 0, w, h);


    let pixel_values;
    let output_image;
    let sigmoid;
    let scaled;
    let maskTensor;

    try {
        const ip = processor.image_processor || processor;

        ip.size = {
            width: 1024,
            height: 1024
        };

        const image = new RawImage(
            new Uint8ClampedArray(src.data),
            w,
            h,
            4
        ).rgb();

        const processed = await processor(image);
        pixel_values = processed.pixel_values;

        if (
            pixel_values.dims?.[2] !== 1024 ||
            pixel_values.dims?.[3] !== 1024
        ) {
            throw new Error("Invalid model input dimensions.");
        }

        const result = await model({
            input_image: pixel_values
        });

        output_image = result.output_image;

        sigmoid = output_image[0].sigmoid();
        scaled = sigmoid.mul(255);
        maskTensor = scaled.to("uint8");

        const rawMask = await RawImage.fromTensor(maskTensor);
        const mask = await rawMask.resize(w, h);

        const alpha = mask.data;
        const out = src.data;

        for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
            out[p] = alpha[i];
        }

    } catch (e) {
        throw codeError(
            String(e?.message ?? e),
            isMemoryError(e) ? "memory" : "model"
        );
    } finally {
        maskTensor?.dispose?.();
        scaled?.dispose?.();
        sigmoid?.dispose?.();
        output_image?.dispose?.();
        pixel_values?.dispose?.();
    }


    ctx.putImageData(src, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
}

self.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === "init") {
        if (Number.isFinite(msg.resolution)) RES = msg.resolution;
        chain = chain.then(() => ensureModel()).catch((err) => post({ type: "model", status: "error", message: String(err?.message || err) }));
    } else if (msg.type === "run") {
        chain = chain.then(async () => {
            try {
                post({ type: "done", id: msg.id, blob: await cutOut(msg) });
            } catch (err) {
                post({ type: "error", id: msg.id, code: err?.code || null, message: String(err?.message || "Background removal failed.") });
            }
        });
    }
};