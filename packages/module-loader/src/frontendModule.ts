import type { ModuleManifest } from "./moduleManifest.js";

export interface FrontendModule {
  manifest: ModuleManifest;
  load: () => Promise<unknown>;
}
