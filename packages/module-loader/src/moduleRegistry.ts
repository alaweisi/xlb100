import type { ModuleManifest } from "./moduleManifest.js";

export interface ModuleRegistry {
  register(manifest: ModuleManifest): void;
  list(): ModuleManifest[];
}

export function createModuleRegistry(): ModuleRegistry {
  const modules: ModuleManifest[] = [];
  return {
    register(manifest: ModuleManifest) {
      modules.push(manifest);
    },
    list() {
      return [...modules];
    },
  };
}
