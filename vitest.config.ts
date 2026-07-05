import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "react": path.resolve(__dirname, "node_modules/.pnpm/react@18.3.1/node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/.pnpm/react-dom@18.3.1/node_modules/react-dom"),
      "@xlb/types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "@xlb/validators": path.resolve(__dirname, "packages/validators/src/index.ts"),
      "@xlb/config": path.resolve(__dirname, "packages/config/src/index.ts"),
      "@xlb/api-client": path.resolve(__dirname, "packages/api-client/src/index.ts"),
      "@xlb/admin-pages": path.resolve(__dirname, "apps/admin/src/pages"),
      "@shared": path.resolve(__dirname, "packages/shared"),
    },
  },
});
