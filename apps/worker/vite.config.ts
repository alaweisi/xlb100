import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.XLB_PUBLIC_BASE || "/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.XLB_WORKER_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
    strictPort: true,
  },
  resolve: {
    alias: {
      "@xlb/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@xlb/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
