import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  customerAppShellSlice,
  customerAuthSlice,
  customerEntryFeatureRouteModule,
  customerEntryTemplateRegistrations,
  customerLocationSlice,
} from "../../apps/customer/src/features/shell/customerEntryFeatureRouteModule.js";

const root = process.cwd();
const featureRoot = join(root, "apps/customer/src/features");
const scopedDirectories = ["shell", "auth", "location"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:ts|tsx)$/u.test(path));
}

describe("Customer B1A security boundaries", () => {
  it("publishes strict L1 templates and only the two leaf entry routes", () => {
    expect(customerAppShellSlice).toMatchObject({
      id: "CSL-01",
      templateId: "CustomerAppShellTemplate",
      orchestration: { level: "L1", operationalManifest: "forbidden" },
    });
    expect(customerAuthSlice).toMatchObject({
      id: "CSL-02",
      routePatterns: ["/auth/login"],
      guards: [],
    });
    expect(customerLocationSlice).toMatchObject({
      id: "CSL-03",
      routePatterns: ["/location"],
      guards: [],
    });
    expect(customerEntryTemplateRegistrations.map((item) => item.templateId)).toEqual([
      "CustomerAppShellTemplate",
      "CustomerAuthTemplate",
      "CustomerLocationTemplate",
    ]);
    expect(customerEntryFeatureRouteModule.routes.map((item) => item.slice.id)).toEqual([
      "CSL-02",
      "CSL-03",
    ]);

    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerEntryFeatureRouteModule)
      .seal();
    const templateRegistry = customerEntryTemplateRegistrations.reduce(
      (registry, registration) => registry.register(registration),
      new CustomerTemplateRegistry(),
    ).seal();

    expect(routeRegistry.resolve("/auth/login")?.slice.id).toBe("CSL-02");
    expect(routeRegistry.resolve("/location")?.slice.id).toBe("CSL-03");
    expect(templateRegistry.resolveForSlice(customerAppShellSlice)?.templateId)
      .toBe("CustomerAppShellTemplate");
  });

  it("contains no debug OTP call, direct fetch, geolocation success path, or sensitive logging", () => {
    const sources = scopedDirectories.flatMap((directory) =>
      sourceFiles(join(featureRoot, directory))
    ).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(sources).not.toContain("getCustomerDebugCode");
    expect(sources).not.toContain("/debug-code");
    expect(sources).not.toMatch(/\bfetch\s*\(/u);
    expect(sources).not.toContain("navigator.geolocation");
    expect(sources).not.toMatch(/\bconsole\.(?:log|info|warn|error|debug)\b/u);
    expect(sources).not.toContain('?? "hangzhou"');
    expect(sources).not.toContain('|| "hangzhou"');
  });

  it("does not assemble the final Customer App route tree", () => {
    const app = readFileSync(join(root, "apps/customer/src/app/App.tsx"), "utf8");

    expect(app).not.toContain("customerEntryFeatureRouteModule");
    expect(app).not.toContain("CustomerAppShellTemplate");
    expect(app).not.toContain("CustomerAuthRoute");
    expect(app).not.toContain("CustomerLocationRoute");
  });
});
