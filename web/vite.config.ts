import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:4097", changeOrigin: true },
      "/oc": { target: "http://127.0.0.1:4097", changeOrigin: true, ws: true },
      "/ptyws": { target: "http://127.0.0.1:4097", changeOrigin: true, ws: true },
      "/terminal": {
        target: "http://127.0.0.1:4098",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/terminal/, "") || "/",
      },
    },
  },
});
