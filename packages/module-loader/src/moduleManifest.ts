import type { AppType } from "@xlb/types";

export interface ModuleManifest {
  id: string;
  name: string;
  appType: AppType;
  version: string;
}
