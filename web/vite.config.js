import { resolve } from "node:path";
import { defineConfig } from "vite";

// pages: story (index), explore, method, data & code, and the 404 page. __DATA_V__: one version per build, appended to every /data URL.
// dev only: serve clean URLs (/explore) the way Cloudflare does in production (explore.html)
const cleanUrls = {
  name: "clean-urls",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const m = req.url.match(/^\/(explore|method|data-code)\/?(\?.*)?$/);
      if (m) req.url = `/${m[1]}.html${m[2] || ""}`;
      next();
    });
  },
};

export default defineConfig({
  plugins: [cleanUrls],
  server: { proxy: { "/api": "http://localhost:8787" } },     // the assistant runs in wrangler dev (worker/)
  define: { __DATA_V__: JSON.stringify(new Date().toISOString().replace(/\D/g, "").slice(0, 12)) },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: Object.fromEntries(["index", "explore", "method", "data-code", "404"].map((n) => [n, resolve(import.meta.dirname, `${n}.html`)])),
    },
  },
});
