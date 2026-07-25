import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.XLB_PUBLIC_BASE || "/dashboard/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          if (id.includes("node_modules/@phosphor-icons")) return "icons";
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5177,
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": {
        target: process.env.XLB_DASHBOARD_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
    strictPort: true,
  },
  resolve: {
    alias: {
      "@xlb/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@xlb/api-client": path.resolve(__dirname, "../../packages/api-client/src/index.ts"),
      "@xlb/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
