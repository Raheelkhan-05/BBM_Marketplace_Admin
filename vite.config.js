import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Image Studio runs the AI model in a module Web Worker. The worker uses
  // dynamic imports, so it must be built as an ES module (default is IIFE).
  worker: {
    format: "es",
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      workbox: {
        // Keep the heavy AI files (ONNX runtime, 26.9 MB) out of the offline
        // precache. They load on demand for admins only and are then cached
        // by the browser, so regular users never download them.
        globIgnores: [
          "**/*.wasm",
          "**/ort-*",
          "**/bgRemoval.worker-*",
        ],
        // Safety net so any other mid-size chunk doesn't break the build.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: "BBM Marketplace",
        short_name: "BBM Marketplace",
        description: "BBM Marketplace",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});