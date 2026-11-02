import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The PWA must be installable and run fully in-browser with no app-store
// dependency (build prompt Table 5). The service worker precaches the app
// shell so registration, verification, and activity capture work with no
// network; data lives in IndexedDB and syncs when a connection returns.
// API path prefixes the dev server proxies to the backend. Keep in step with
// the routers in services/api/app/routers.
const API_PREFIXES = [
  "/auth",
  "/users",
  "/visitors",
  "/visits",
  "/activities",
  "/accommodations",
  "/charges",
  "/sync",
  "/management",
  "/bookings",
  "/config",
  "/health",
];

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
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,ico,woff2}"],
        navigateFallback: "index.html",
        // Never cache API calls: the local store is the offline source of
        // truth, not stale HTTP responses.
        navigateFallbackDenylist: [/^\/(auth|users|visitors|visits|activities|accommodations|charges|sync|management)/],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    // Dev convenience: forward API calls to the FastAPI backend.
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [
        prefix,
        {
          target: "http://localhost:8000",
          // Several prefixes are also app pages (/bookings, /visits, /config…):
          // a browser page load asks for HTML and must get the SPA, not the API.
          bypass: (req) => (req.headers.accept?.includes("text/html") ? "/index.html" : undefined),
        },
      ]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
