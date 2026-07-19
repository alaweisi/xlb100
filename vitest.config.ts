import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = __dirname;
const alias = [
  {
    find: "react",
    replacement: path.resolve(rootDir, "apps/customer/node_modules/react"),
  },
  {
    find: "react-dom",
    replacement: path.resolve(rootDir, "apps/customer/node_modules/react-dom"),
  },
  { find: "@xlb/types", replacement: path.resolve(rootDir, "packages/types/src/index.ts") },
  { find: "@xlb/validators", replacement: path.resolve(rootDir, "packages/validators/src/index.ts") },
  { find: "@xlb/config", replacement: path.resolve(rootDir, "packages/config/src/index.ts") },
  { find: "@xlb/api-client", replacement: path.resolve(rootDir, "packages/api-client/src/index.ts") },
  { find: "@xlb/ui", replacement: path.resolve(rootDir, "packages/ui/src/index.ts") },
  { find: "@xlb/admin-pages", replacement: path.resolve(rootDir, "apps/admin/src/pages") },
  { find: /^@shared\/(.*)$/, replacement: path.resolve(rootDir, "packages/shared/$1") },
  { find: "@shared", replacement: path.resolve(rootDir, "packages/shared") },
];

const dbSerial = {
  environment: "node",
  env: {
    MYSQL_CONNECTION_LIMIT: "6",
    MYSQL_MAX_IDLE: "1",
    MYSQL_IDLE_TIMEOUT_MS: "1000",
  },
  setupFiles: ["tests/setup.ts"],
  fileParallelism: false,
  maxConcurrency: 1,
  maxWorkers: 1,
  sequence: { concurrent: false },
  pool: "forks" as const,
  poolOptions: { forks: { singleFork: true } },
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit-contract",
          globals: true,
          environment: "node",
          env: {
            MYSQL_CONNECTION_LIMIT: "2",
            MYSQL_MAX_IDLE: "1",
            MYSQL_IDLE_TIMEOUT_MS: "1000",
          },
          maxConcurrency: 2,
          // App tests mutate the jsdom window URL; parallel files race on
          // shared route state and produce non-deterministic assertions.
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 15_000,
          include: [
            "tests/unit/**/*.test.ts",
            "tests/unit/**/*.test.tsx",
            "tests/contract/**/*.test.ts",
          ],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db-serial",
          include: ["tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
          // Security architecture gates launch PowerShell processes. Under the
          // full Windows serial suite, process startup can exceed Vitest's 5s
          // default even though the gate itself completes successfully.
          testTimeout: 30_000,
          ...dbSerial,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "performance-serial",
          include: ["tests/performance/**/*.test.ts"],
          testTimeout: 120_000,
          ...dbSerial,
        },
      },
    ],
  },
});
