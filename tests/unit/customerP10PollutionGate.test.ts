import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relativePath);
    return /\.(?:css|ts|tsx)$/u.test(entry.name) ? [relativePath] : [];
  });
}

describe("P10 Customer UI pollution gate", () => {
  it("keeps concrete colors in the design-token source instead of business adapters", () => {
    const catalogAdapter = readFileSync(
      join(root, "apps/customer/src/adapters/catalogAdapters.ts"),
      "utf8",
    );

    expect(catalogAdapter).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(catalogAdapter).toContain('toneToken: "customer.color.action"');
  });

  it("limits PWA icon literals to the approved Customer palette", () => {
    const allowedPalette = new Set(["#CFEFEF", "#0F9F9C", "#FF6A00", "#FFFFFF"]);
    const legacyPalette = /#(?:0b1220|1a2b45|f59e0b|fde68a)\b/iu;

    for (const size of [192, 512]) {
      const svg = readFileSync(
        join(root, `apps/customer/public/icons/customer-icon-${size}.svg`),
        "utf8",
      );
      const colors = svg.match(/#[0-9a-f]{6}\b/giu) ?? [];

      expect(svg).not.toMatch(legacyPalette);
      expect(colors.length).toBeGreaterThan(0);
      expect(colors.every((color) => allowedPalette.has(color.toUpperCase()))).toBe(true);
    }
  });

  it("keeps legacy project naming out of Customer runtime sources", () => {
    const runtimeSource = [
      ...sourceFiles("apps/customer/src"),
      ...sourceFiles("packages/customer-components/src"),
    ].map((file) => readFileSync(join(root, file), "utf8")).join("\n");

    expect(runtimeSource).not.toMatch(/@sdj99|(?:^|[^a-z0-9_])sdj99(?:[^a-z0-9_]|$)/iu);
  });
});
