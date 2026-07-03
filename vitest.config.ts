import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@xlb/types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "@xlb/validators": path.resolve(__dirname, "packages/validators/src/index.ts"),
      "@xlb/config": path.resolve(__dirname, "packages/config/src/index.ts"),
      "@xlb/api-client": path.resolve(__dirname, "packages/api-client/src/index.ts"),
    },
  },
});
