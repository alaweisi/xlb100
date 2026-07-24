export { MOBILE_PROFILES, defineMobileApp } from "./schema.mjs";
export {
  normalizeHttpOrigin,
  resolveMobileEnvironment,
} from "./environment.mjs";
export {
  androidSdkCandidates,
  findAndroidBuildTool,
  probeAndroidToolchain,
  resolveAndroidSdk,
  resolveGradleExecutable,
  resolveJavaHome,
} from "./toolchain.mjs";
export {
  renderDebugNetworkSecurityConfig,
  validateAndroidBoundaries,
  validateBuiltApk,
  writeDebugNetworkSecurityConfig,
} from "./android-security.mjs";
export {
  buildAndroidApp,
  buildWebAssets,
  createWebBuildPlan,
  expectedApkPath,
  runGradleTask,
  syncCapacitorAndroid,
} from "./orchestration.mjs";

export function toCapacitorConfig(app) {
  return Object.freeze({
    appId: app.appId,
    appName: app.appName,
    webDir: "dist",
  });
}
