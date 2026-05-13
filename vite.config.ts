import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      },
      output: {
        entryFileNames: (chunkInfo) => (chunkInfo.name === "app" ? "assets/app.js" : "assets/[name].js"),
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          const sourceName = assetInfo.names?.[0] ?? "";
          const rootAssets = new Set(["favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"]);
          if (rootAssets.has(sourceName)) return "[name][extname]";
          if (sourceName.endsWith(".mp3")) return "assets/sounds/[name][extname]";
          return "assets/[name][extname]";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
