import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "react",
        replacement: path.resolve(__dirname, "node_modules/.pnpm/react@18.3.1/node_modules/react"),
      },
      {
        find: "react-dom",
        replacement: path.resolve(__dirname, "node_modules/.pnpm/react-dom@18.3.1/node_modules/react-dom"),
      },
      { find: "@xlb/types", replacement: path.resolve(__dirname, "packages/types/src/index.ts") },
      { find: "@xlb/validators", replacement: path.resolve(__dirname, "packages/validators/src/index.ts") },
      { find: "@xlb/config", replacement: path.resolve(__dirname, "packages/config/src/index.ts") },
      { find: "@xlb/api-client", replacement: path.resolve(__dirname, "packages/api-client/src/index.ts") },
      { find: "@xlb/ui", replacement: path.resolve(__dirname, "packages/ui/src/index.ts") },
      { find: "@xlb/admin-pages", replacement: path.resolve(__dirname, "apps/admin/src/pages") },
      { find: /^@shared\/(.*)$/, replacement: path.resolve(__dirname, "packages/shared/$1") },
      { find: "@shared", replacement: path.resolve(__dirname, "packages/shared") },
    ],
  },
});
