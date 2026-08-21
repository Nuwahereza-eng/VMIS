import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The PWA must be installable and run fully in-browser with no app-store
// dependency (build prompt Table 5). The service worker precaches the app
// shell so registration, verification, and activity capture work with no
// network; data lives in IndexedDB and syncs when a connection returns.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-48.png", "logo.png"],
      manifest: {
        name: "VMIS - Murchison Falls",
        short_name: "VMIS",
        description:
          "Visitor Management Information System for Murchison Falls National Park",
        theme_color: "#0f5132",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        // Never cache API calls: the local store is the offline source of
        // truth, not stale HTTP responses.
        navigateFallbackDenylist: [/^\/(auth|visitors|visits|activities|sync|management)/],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: forward API calls to the FastAPI backend.
      "/auth": "http://localhost:8000",
      "/visitors": "http://localhost:8000",
      "/visits": "http://localhost:8000",
      "/activities": "http://localhost:8000",
      "/sync": "http://localhost:8000",
      "/management": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
