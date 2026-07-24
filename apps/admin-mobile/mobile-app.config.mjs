import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineMobileApp } from "@xlb/mobile-foundation";
import metadata from "./mobile-app.metadata.json" with { type: "json" };

export const TENCENT_CLOUD_TEST_ORIGIN = "http://123.207.198.136";

const mobileRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(mobileRoot, "../..");

export default defineMobileApp({
  ...metadata,
  key: "admin",
  version: {
    code: 1,
    name: "0.1.0",
  },
  paths: {
    workspaceRoot,
    mobileRoot,
    webRoot: path.join(workspaceRoot, "apps", "admin"),
    androidRoot: path.join(mobileRoot, "android"),
  },
  web: {
    packageName: "@xlb/admin",
    outputDirectory: path.join(mobileRoot, "dist"),
    publicBase: "./",
    apiBaseBuildVariable: "VITE_API_BASE",
    appVersionBuildVariable: "VITE_APP_VERSION",
  },
  environment: {
    apiBaseUrlVariable: "XLB_ADMIN_MOBILE_API_BASE_URL",
    profiles: {
      development: {
        source: "environment",
        requireHttps: true,
      },
      test: {
        source: "fixed",
        apiBaseUrl: TENCENT_CLOUD_TEST_ORIGIN,
        requireHttps: false,
      },
      production: {
        source: "environment",
        requireHttps: true,
      },
    },
  },
  android: {
    permissions: [
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
    ],
    debugCleartextHosts: ["123.207.198.136"],
  },
});
