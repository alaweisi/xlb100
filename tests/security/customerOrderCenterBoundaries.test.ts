import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();
const sourceFiles = [
  "CustomerOrderCenterTypes.ts",
  "CustomerOrderCenterCoordinator.ts",
  "CustomerOrderCenterActionController.ts",
  "CustomerOrderCenterComponents.tsx",
  "CustomerOrderCenterComponentRegistry.tsx",
  "CustomerOrderCenterTemplate.tsx",
  "CustomerOrderCenterRoute.tsx",
  "customerOrderCenterModule.ts",
  "index.ts",
];

describe("Customer Order Center source boundaries", () => {
  it("does not assemble orders from browser storage, notifications or session order IDs", () => {
    const source = sourceFiles
      .map((file) => readFileSync(
        join(root, "apps/customer/src/features/orders", file),
        "utf8",
      ))
      .join("\n");

    expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/u);
    expect(source).not.toMatch(
      /\blistNotifications\b|\bnotificationInbox\b|\borderIds\b/u,
    );
    expect(source).toContain("this.#api.listOrders");
  });

  it("keeps route assembly, contracts and backend outside the slice", () => {
    const moduleSource = readFileSync(
      join(
        root,
        "apps/customer/src/features/orders/customerOrderCenterModule.ts",
      ),
      "utf8",
    );
    expect(moduleSource).toContain('routePatterns: ["/orders"]');
    expect(moduleSource).toContain('operationalManifest: "forbidden"');
    expect(moduleSource).toContain(
      'guards: ["session", "city", "protected-route"]',
    );
    expect(moduleSource).not.toMatch(
      /App\.tsx|packages\/types|packages\/validators|backend\/src/u,
    );
  });
});
