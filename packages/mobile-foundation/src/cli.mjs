#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildAndroidApp,
  buildWebAssets,
  expectedApkPath,
  probeAndroidToolchain,
  runGradleTask,
  syncCapacitorAndroid,
  validateAndroidBoundaries,
  writeDebugNetworkSecurityConfig,
} from "./index.mjs";

function parseArguments(argumentsList) {
  const args = [...argumentsList];
  const configIndex = args.indexOf("--config");
  if (configIndex === -1 || !args[configIndex + 1]) {
    throw new Error("Usage: xlb-mobile --config <mobile-app.config.mjs> <command> [arguments]");
  }
  const configPath = path.resolve(args[configIndex + 1]);
  args.splice(configIndex, 2);
  return { configPath, command: args.shift(), args };
}

const { configPath, command, args } = parseArguments(process.argv.slice(2));
const module = await import(pathToFileURL(configPath).href);
const app = module.default;
if (!app) throw new Error(`Mobile descriptor has no default export: ${configPath}`);

switch (command) {
  case "build-web":
    buildWebAssets(app, args[0]);
    break;
  case "sync":
    syncCapacitorAndroid(app);
    break;
  case "gradle":
    runGradleTask(app, args[0]);
    break;
  case "build": {
    const profile = args[0];
    const variant = args[1];
    buildAndroidApp(app, profile, variant);
    const apk = expectedApkPath(app, variant);
    if (!fs.existsSync(apk)) throw new Error(`Gradle completed without expected APK: ${apk}`);
    console.log(apk);
    break;
  }
  case "generate-cleartext":
    console.log(writeDebugNetworkSecurityConfig(app));
    break;
  case "validate":
    console.log(JSON.stringify(validateAndroidBoundaries(app), null, 2));
    break;
  case "doctor":
    console.log(JSON.stringify(probeAndroidToolchain(app), null, 2));
    break;
  default:
    throw new Error(
      "Expected command: build-web, sync, gradle, build, generate-cleartext, validate, or doctor",
    );
}
