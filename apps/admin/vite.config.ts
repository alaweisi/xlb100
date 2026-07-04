import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  resolve: {
    alias: {
      "@xlb/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@xlb/api-client": path.resolve(__dirname, "../../packages/api-client/src/index.ts"),
      "@xlb/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
