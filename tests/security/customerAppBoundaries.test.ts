import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const routesRoot = join(root, "apps/customer/src/routes");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:ts|tsx)$/u.test(path));
}

describe("Customer App route security boundaries", () => {
  it("contains no external manifest/template loader, direct fetch or URL-derived business facts", () => {
    const sources = sourceFiles(routesRoot)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/\bfetch\s*\(/u);
    expect(sources).not.toContain("operationalManifestUrl");
    expect(sources).not.toContain("templateUrl");
    expect(sources).not.toContain("import(route");
    expect(sources).not.toContain("import(pathname");
    expect(sources).not.toMatch(/query\.(?:amount|status|role|eligible)/u);
    expect(sources).not.toMatch(/params\.(?:amount|status|role|eligible)/u);
  });

  it("keeps final assembly outside feature ownership and App free of direct feature modules", () => {
    const app = readFileSync(join(root, "apps/customer/src/app/App.tsx"), "utf8");
    const registry = readFileSync(
      join(routesRoot, "customerAppRegistry.ts"),
      "utf8",
    );

    expect(app).toContain("CustomerAppRouter");
    expect(app).not.toContain("customerEntryFeatureRouteModule");
    expect(app).not.toContain("customerPaymentRouteModule");
    expect(registry).toContain("customerSupportFeatureRouteModule");
    expect(registry).not.toContain("customerSupportTicketRouteModule");
  });
});
