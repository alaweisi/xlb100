import path from "node:path";
import { defineWorkspace } from "vitest/config";

const rootDir = __dirname;
const alias = [
  {
    find: "react",
    replacement: path.resolve(rootDir, "node_modules/.pnpm/react@18.3.1/node_modules/react"),
  },
  {
    find: "react-dom",
    replacement: path.resolve(rootDir, "node_modules/.pnpm/react-dom@18.3.1/node_modules/react-dom"),
  },
  { find: "@xlb/types", replacement: path.resolve(rootDir, "packages/types/src/index.ts") },
  { find: "@xlb/validators", replacement: path.resolve(rootDir, "packages/validators/src/index.ts") },
  { find: "@xlb/config", replacement: path.resolve(rootDir, "packages/config/src/index.ts") },
  { find: "@xlb/api-client", replacement: path.resolve(rootDir, "packages/api-client/src/index.ts") },
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
  sequence: {
    concurrent: false,
  },
  pool: "forks" as const,
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
};

export default defineWorkspace([
  {
    test: {
      name: "unit-contract",
      globals: true,
      environment: "node",
      env: {
        MYSQL_CONNECTION_LIMIT: "2",
        MYSQL_MAX_IDLE: "1",
        MYSQL_IDLE_TIMEOUT_MS: "1000",
      },
      maxWorkers: 2,
      maxConcurrency: 2,
      testTimeout: 15000,
      include: [
        "tests/unit/**/*.test.ts",
        "tests/unit/**/*.test.tsx",
        "tests/contract/**/*.test.ts",
      ],
      setupFiles: ["tests/setup.ts"],
    },
    resolve: { alias },
  },
  {
    test: {
      name: "db-serial",
      include: [
        "tests/integration/**/*.test.ts",
        "tests/security/**/*.test.ts",
      ],
      ...dbSerial,
    },
    resolve: { alias },
  },
]);
