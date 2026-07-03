import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pricingSeed = join(root, "db/seed/008_official_pricing.seed.sql");

describe("officialPricingSeed contract", () => {
  it("official pricing seed exists", () => {
    expect(existsSync(pricingSeed)).toBe(true);
  });

  it("contains independent price rules per city", () => {
    const content = readFileSync(pricingSeed, "utf8");
    expect(content).toMatch(/price_hangzhou_sku_home_daily_2h/);
    expect(content).toMatch(/price_shanghai_sku_home_daily_2h/);
    expect(content).toMatch(/price_beijing_sku_home_daily_2h/);
  });

  it("does not contain __global__", () => {
    const content = readFileSync(pricingSeed, "utf8");
    expect(content).not.toMatch(/'__global__'/);
  });

  it("contains price_text and price_type fields", () => {
    const content = readFileSync(pricingSeed, "utf8");
    expect(content).toMatch(/price_text/);
    expect(content).toMatch(/'fixed'/);
    expect(content).toMatch(/'range'/);
  });

  it("has 1476 price rule rows", () => {
    const content = readFileSync(pricingSeed, "utf8");
    const rows = content.match(/\('price_(hangzhou|shanghai|beijing)_sku_[a-z0-9_]+'/g) ?? [];
    expect(rows.length).toBe(1476);
  });
});
