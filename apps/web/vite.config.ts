import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// In development the API runs on wrangler dev (:8787); production points at pace-api.nalinor.dev
// through VITE_API_URL. There is no proxy: the app talks to the API origin directly (CORS + bearer).
export default defineConfig({
  build: { sourcemap: "hidden" },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      manifest: {
        background_color: "#0b0b0c",
        display: "standalone",
        icons: [
          { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
          { purpose: "any maskable", sizes: "512x512", src: "/icon-512.png", type: "image/png" },
        ],
        name: "Pace",
        // Text shared from another app lands in the composer.
        share_target: {
          action: "/add",
          method: "GET",
          params: { text: "text", title: "title", url: "url" },
        },
        short_name: "Pace",
        theme_color: "#0b0b0c",
      },
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/oauth/, /^\/\.well-known/],
      },
    }),
  ],
  preview: { port: 4173, strictPort: true },
  server: { port: 5173, strictPort: true },
});
