import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Same origin in every environment: the browser talks to /api on the page's own
// origin and the dev/preview server forwards it. No CORS, and SameSite cookies work.
const apiProxy = {
  "/api": { changeOrigin: false, target: process.env["API_URL"] ?? "http://localhost:3000" },
};

export default defineConfig({
  // Source maps for error trackers, without publishing them next to the bundle.
  build: { sourcemap: "hidden" },
  plugins: [react(), tailwindcss()],
  preview: { port: 4173, proxy: apiProxy, strictPort: true },
  server: { port: 5173, proxy: apiProxy, strictPort: true },
});
