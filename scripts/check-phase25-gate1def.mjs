import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "packages/ui/src/campaign/presentationSlots.tsx",
  "packages/ui/src/shells/SemanticShell.tsx",
  "packages/ui/src/gallery/runtimeThemeGallery.ts",
  "tests/unit/phase25PresentationSlots.test.tsx",
];
for (const file of required) {
  if (!existsSync(resolve(file))) throw new Error(`Phase 25 Gate 1D-1F missing: ${file}`);
}
const presentation = readFileSync(resolve("packages/ui/src/campaign/presentationSlots.tsx"), "utf8");
for (const forbidden of ["dangerouslySetInnerHTML", "window.location", "<svg", "<style"]) {
  if (presentation.includes(forbidden)) throw new Error(`Phase 25 presentation boundary violation: ${forbidden}`);
}
console.log("Phase 25 Gate 1D-1F shared foundation check passed.");
