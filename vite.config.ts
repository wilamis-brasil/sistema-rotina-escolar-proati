import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: {
      allow: [".."],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
