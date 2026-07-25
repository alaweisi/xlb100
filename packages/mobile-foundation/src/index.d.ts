export type MobileProfileName = "development" | "test" | "production";
export type MobileProfile = {
  source: "environment";
  requireHttps: boolean;
} | {
  source: "fixed";
  apiBaseUrl: string;
  requireHttps: boolean;
};
export interface MobileAppDescriptor {
  key: string;
  appId: string;
  appName: string;
  version: { code: number; name: string };
  paths: {
    workspaceRoot: string;
    mobileRoot: string;
    webRoot: string;
    androidRoot: string;
  };
  web: {
    packageName: `@xlb/${string}`;
    outputDirectory: string;
    publicBase: "./";
    apiBaseBuildVariable: string;
    appVersionBuildVariable: string;
  };
  environment: {
    apiBaseUrlVariable: string;
    profiles: Record<MobileProfileName, MobileProfile>;
  };
  android: {
    permissions: string[];
    debugCleartextHosts: string[];
  };
}
export interface ResolvedMobileEnvironment {
  profile: MobileProfileName;
  apiBaseUrl: string;
  publicBase: "./";
}
export interface AndroidBoundaryReport {
  appId: string;
  appName: string;
  versionCode: number;
  versionName: string;
  permissions: string[];
  debugCleartextHosts: string[];
}
export interface BuiltApkReport {
  apkPath: string;
  appId: string;
  appName: string;
  versionCode: number;
  versionName: string;
  permissions: string[];
  generatedPermissions: string[];
  certificateDn?: string;
  certificateSha256?: string;
  publicKeySha256?: string;
}
export const MOBILE_PROFILES: readonly MobileProfileName[];
export function defineMobileApp(input: MobileAppDescriptor): Readonly<MobileAppDescriptor>;
export function toCapacitorConfig(app: Pick<MobileAppDescriptor, "appId" | "appName">): {
  readonly appId: string;
  readonly appName: string;
  readonly webDir: "dist";
  readonly loggingBehavior: "none";
  readonly plugins: {
    readonly CapacitorHttp: {
      readonly enabled: true;
    };
  };
};
export function normalizeHttpOrigin(value: unknown, label: string): string;
export function resolveMobileEnvironment(
  app: MobileAppDescriptor,
  profileName: MobileProfileName,
  environment?: NodeJS.ProcessEnv,
): ResolvedMobileEnvironment;
export function renderDebugNetworkSecurityConfig(hosts: string[]): string;
export function writeDebugNetworkSecurityConfig(app: MobileAppDescriptor): string;
export function validateAndroidBoundaries(app: MobileAppDescriptor): AndroidBoundaryReport;
export function validateBuiltApk(
  app: MobileAppDescriptor,
  apkPath: string,
  options: object,
): BuiltApkReport;
export function androidSdkCandidates(
  environment?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
  homeDirectory?: string,
): string[];
export function resolveJavaHome(options?: object): string;
export function resolveAndroidSdk(options?: object): string;
export function resolveGradleExecutable(androidRoot: string, options?: object): string;
export function findAndroidBuildTool(
  androidSdk: string,
  name: string,
  options?: object,
): string;
export function probeAndroidToolchain(
  app: MobileAppDescriptor,
  options?: object,
): { javaHome: string; androidSdk: string; gradleExecutable: string };
export function createWebBuildPlan(
  app: MobileAppDescriptor,
  profileName: MobileProfileName,
  environment?: NodeJS.ProcessEnv,
): object;
export function buildWebAssets(
  app: MobileAppDescriptor,
  profileName: MobileProfileName,
  options?: object,
): object;
export function syncCapacitorAndroid(app: MobileAppDescriptor, options?: object): void;
export function runGradleTask(app: MobileAppDescriptor, task: string, options?: object): object;
export function buildAndroidApp(
  app: MobileAppDescriptor,
  profileName: MobileProfileName,
  variant: "debug" | "release",
  options?: object,
): object;
export function expectedApkPath(app: MobileAppDescriptor, variant: "debug" | "release"): string;
