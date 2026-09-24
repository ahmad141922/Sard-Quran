import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The standalone Recitation tool (أداة السرد القرآني).
 *
 * A second config rather than a second entry in vite.config.ts: that gives it
 * its own service worker, its own manifest and its own dist, so deploying or
 * updating the board can never touch the tool, nor the reverse. It shares the
 * source tree, so the algorithms remain one implementation.
 *
 *   npm run dev:sard     npm run build:sard
 *
 * `sard/public/` is populated by scripts/copy-sard-assets.mjs — only the mushaf
 * JSON, the Uthmani font and the icons. The board's public/ holds ~17 MB of
 * PDFs and video this tool never needs.
 */
/**
 * Where this build will be served from.
 *
 * The tool lives at the root in development and under `/app/` in production,
 * because the landing page owns the root of sard.tajweedoo.com. Everything
 * that has to know — the PWA manifest, the service worker's scope, and the
 * string paths inside the app via `src/lib/asset-url.ts` — reads it from here.
 */
const BASE = (() => {
  const raw = process.env.VITE_SARD_BASE_PATH ?? "/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
})();

/**
 * Whether this build is going inside a native shell — Android or iOS.
 *
 * The shell already serves the bundle from local storage, so the service
 * worker has nothing left to cache and everything left to argue about: two
 * caches, two ideas of when an update is live. `scripts/build-native.mjs`
 * sets this for both platforms, and nothing else in the tool reads it.
 */
const NATIVE = process.env.VITE_SARD_NATIVE === '1';

export default defineConfig({
  base: BASE,
  root: path.resolve(__dirname, "sard"),
  // envDir defaults to `root`; the tool shares the project's .env because it
  // must reach the same Supabase project the admin dashboard reads from.
  envDir: __dirname,
  // 8095 is the habit, not a requirement: nothing calls back into this origin,
  // so a harness that hands us a PORT wins and two tools can run at once.
  server: { host: "::", port: Number(process.env.PORT) || 8095, hmr: { overlay: false } },
  plugins: [
    react(),
    VitePWA({
      disable: NATIVE,
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      manifest: {
        name: "أداة السرد القرآني",
        short_name: "السرد القرآني",
        description: "سجّل مجلس السرد بثلاث ضغطات، واخرج بتقرير وخطة مراجعة. تعمل بلا إنترنت.",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        background_color: "#fdf8ef",
        theme_color: "#1a5e2a",
        lang: "ar",
        dir: "rtl",
        icons: [
          { src: `${BASE}pwa-192x192.png`, sizes: "192x192", type: "image/png" },
          { src: `${BASE}pwa-512x512.png`, sizes: "512x512", type: "image/png" },
          // Maskable is its own file: Android crops the icon to its shape, and
          // a logo drawn edge to edge loses its corners to that crop.
          { src: `${BASE}pwa-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The mushaf JSON and the Uthmani font *are* the tool: a majlis in a
        // classroom with no signal has to work, so both are precached.
        globPatterns: ["**/*.{js,css,html,json,ttf,woff2,png,ico}"],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        // A precache from an older build is a shell that asks for files this
        // deploy no longer has; keeping it around only risks serving it.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    outDir: path.resolve(__dirname, "dist-sard"),
    emptyOutDir: true,
  },
});
