import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogSeed = join(root, "db/seed/007_official_catalog.seed.sql");

describe("officialCatalogSeed contract", () => {
  it("official catalog seed exists", () => {
    expect(existsSync(catalogSeed)).toBe(true);
  });

  it("contains 16 level-1 categories per city", () => {
    const content = readFileSync(catalogSeed, "utf8");
    const hangzhouCats = content.match(/\('cat_\d{2}',\s*'hangzhou'/g) ?? [];
    expect(hangzhouCats.length).toBe(16);
  });

  it("does not contain __global__", () => {
    const content = readFileSync(catalogSeed, "utf8");
    expect(content).not.toMatch(/'__global__'/);
  });

  it("contains official skus not only demo", () => {
    const content = readFileSync(catalogSeed, "utf8");
    expect(content).toMatch(/sku_home_daily_2h/);
    const ids = [...content.matchAll(/\('([a-z0-9_-]+)',\s*'(hangzhou|shanghai|beijing)'/g)].map(
      (m) => m[1],
    );
    const nonDemo = [...new Set(ids)].filter((id) => !id.startsWith("demo_"));
    expect(nonDemo.length).toBeGreaterThan(0);
  });

  it("has expected service_skus total rows", () => {
    const content = readFileSync(catalogSeed, "utf8");
    const skuRows = content.match(/\('sku_[a-z0-9_]+',\s*'item_[a-f0-9]+',\s*'(hangzhou|shanghai|beijing)'/g) ?? [];
    expect(skuRows.length).toBe(1476);
  });
});
