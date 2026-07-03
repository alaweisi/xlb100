import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noGlobalInOfficialPricing", () => {
  it("official pricing seed has no __global__ business cityCode", () => {
    const path = join(root, "db/seed/008_official_pricing.seed.sql");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).not.toMatch(/'__global__'/);
  });
});
