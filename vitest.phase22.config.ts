import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = __dirname;

export default defineConfig({
  test: {
    projects: [{
      resolve: {
        alias: [
          { find: "@xlb/types", replacement: path.resolve(rootDir, "packages/types/src/index.ts") },
          { find: "@xlb/validators", replacement: path.resolve(rootDir, "packages/validators/src/index.ts") },
          { find: "@xlb/config", replacement: path.resolve(rootDir, "packages/config/src/index.ts") },
        ],
      },
      test: {
        name: "phase22-coverage",
        environment: "node",
        globals: true,
        setupFiles: ["tests/setup.ts"],
        include: ["tests/unit/phase22Observability.test.ts"],
      },
    }],
  },
});
