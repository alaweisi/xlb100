import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCapturePlan,
  loadCustomerUiQaManifest,
  validateCustomerUiQaInfrastructure,
} from "../../scripts/customer-ui-qa/contract.mjs";

const root = process.cwd();
const manifest = loadCustomerUiQaManifest(root);

describe("Customer UI QA infrastructure", () => {
  it("binds the QA contract to the locked Customer Home truth", () => {
    const authority = readFileSync(join(root, manifest.authority.path));
    expect(createHash("sha256").update(authority).digest("hex")).toBe(
      "32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c",
    );
    expect(manifest.role).toBe("customer");
  });

  it("covers exactly nine Customer route carriers and their page cards", () => {
    expect(validateCustomerUiQaInfrastructure(root, manifest)).toEqual([]);
    expect(manifest.surfaces).toHaveLength(9);
    expect(new Set(manifest.surfaces.map((surface: { route: string }) => surface.route)).size).toBe(9);
    expect(manifest.surfaces.every((surface: { route: string }) => surface.route.startsWith("/customer/"))).toBe(true);
  });

  it("plans default and risk evidence at 390x844 plus responsive defaults", () => {
    const plan = buildCapturePlan(manifest);
    expect(plan).toHaveLength(36);
    expect(plan.filter((item: { viewport: string }) => item.viewport === "target-390x844")).toHaveLength(18);
    expect(plan.filter((item: { viewport: string }) => item.viewport === "narrow-320")).toHaveLength(9);
    expect(plan.filter((item: { viewport: string }) => item.viewport === "wide-430")).toHaveLength(9);
    expect(new Set(plan.map((item: { evidencePath: string }) => item.evidencePath)).size).toBe(36);
  });

  it("uses deterministic, filename-safe evidence paths", () => {
    const plan = buildCapturePlan(manifest);
    expect(plan.every((item: { fileName: string }) => (
      /^customer-[a-z0-9-]+-[a-z0-9-]+-(320x844|390x844|430x932)-01\.png$/.test(item.fileName)
    ))).toBe(true);
    expect(plan[0].evidencePath).toBe(
      "docs/design/ui/phase25/evidence/customer/customer-home-available-320x844-01.png",
    );
  });

  it("freezes the machine-readable report result and severity contract", () => {
    const schema = JSON.parse(readFileSync(join(root, manifest.reportSchema), "utf8"));
    expect(schema.properties.result.enum).toEqual(["passed", "failed"]);
    expect(schema.properties.findings.items.properties.severity.enum).toEqual(["P0", "P1", "P2", "P3"]);
    expect(schema.properties.authoritySha256.const).toBe(manifest.authority.sha256);
  });
});
