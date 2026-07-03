import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve monorepo root from backend module location */
export function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../..");
}

export function getDbPath(...segments: string[]): string {
  return path.join(getRepoRoot(), "db", ...segments);
}
