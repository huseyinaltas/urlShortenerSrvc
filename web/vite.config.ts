import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev server proxies `/api/*` to the Firebase **Hosting** emulator (:5050),
 * which applies the production rewrites and forwards to the `app` Cloud
 * Function. `changeOrigin` rewrites the Host header to localhost:5050, so the
 * `shortUrl` the API builds from that host is a real, clickable redirect
 * (:5050/<code>) even though this UI is served by Vite on :5173.
 *
 * In a production build the UI is served by Hosting on the same origin as the
 * function, so `/api` calls and short links are same-origin — no proxy needed.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
    },
  },
});
