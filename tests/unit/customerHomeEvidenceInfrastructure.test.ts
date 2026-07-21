import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Customer Home C2 evidence infrastructure", () => {
  it("is pinned to Gate 1 and never edits Customer Home source", () => {
    const contract = readFileSync("scripts/customer-ui-qa/home-contract.mjs", "utf8");
    const spec = readFileSync("tests/e2e/customer-ui/customerHomeEvidence.spec.ts", "utf8");
    expect(contract).toContain("customer-home-visual-truth.png");
    expect(contract).toContain("32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c");
    expect(contract.match(/state: "available"/g)).toHaveLength(3);
    expect(contract).toContain('state: "partial", width: 390, height: 844');
    expect(spec).toContain("fullPage: false");
    expect(spec).toContain("HOME_CATEGORY_NAMES");
  });

  it("keeps the existing nine-route QA infrastructure valid", () => {
    expect(() => execFileSync(process.execPath, ["scripts/check-customer-ui-qa-infrastructure.mjs"], { stdio: "pipe" })).not.toThrow();
  });
});
