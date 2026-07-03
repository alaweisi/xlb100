import type { ModuleManifest } from "./moduleManifest.js";

export interface BackendModule {
  manifest: ModuleManifest;
  registerRoutes: () => void;
}
