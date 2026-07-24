import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveMobileEnvironment } from "./mobile-environment.mjs";

const profile = process.argv[2];
const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(mobileRoot, "../..");
const customerRoot = path.resolve(mobileRoot, "../customer");
const outputDirectory = path.join(mobileRoot, "dist");
const environment = resolveMobileEnvironment(profile);
const packageManagerEntry = process.env.npm_execpath;
if (!packageManagerEntry) {
  throw new Error("Run this command through pnpm so npm_execpath is available");
}

const dependencyBuild = spawnSync(
  process.execPath,
  [
    packageManagerEntry,
    "--filter",
    "@xlb/customer^...",
    "build",
  ],
  {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit",
  },
);
if (dependencyBuild.error) throw dependencyBuild.error;
if (dependencyBuild.status !== 0) {
  process.exit(dependencyBuild.status ?? 1);
}

const result = spawnSync(
  process.execPath,
  [
    packageManagerEntry,
    "exec",
    "vite",
    "build",
    "--mode",
    environment.profile,
    "--base",
    environment.publicBase,
    "--outDir",
    outputDirectory,
    "--emptyOutDir",
  ],
  {
    cwd: customerRoot,
    env: {
      ...process.env,
      XLB_PUBLIC_BASE: environment.publicBase,
      VITE_API_BASE_URL: environment.apiBaseUrl,
      VITE_APP_VERSION:
        process.env.XLB_CUSTOMER_MOBILE_APP_VERSION ?? "0.1.0",
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
