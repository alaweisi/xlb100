import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.XLB_PUBLIC_BASE || "/",
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      "/api": { target: process.env.XLB_DASHBOARD_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
      "/health": { target: process.env.XLB_DASHBOARD_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
    },
    strictPort: true,
  },
  resolve: {
    alias: { "@xlb/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts") },
  },
});
