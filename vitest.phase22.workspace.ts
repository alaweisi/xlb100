import path from "node:path";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([{
  resolve: {
    alias: [
      { find: "@xlb/types", replacement: path.resolve(__dirname, "packages/types/src/index.ts") },
      { find: "@xlb/validators", replacement: path.resolve(__dirname, "packages/validators/src/index.ts") },
      { find: "@xlb/config", replacement: path.resolve(__dirname, "packages/config/src/index.ts") },
    ],
  },
  test: {
    name: "phase22-coverage",
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/phase22Observability.test.ts"],
  },
}]);
