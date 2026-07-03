import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noDemoSkuForOrderReadiness", () => {
  it("disable demo seed exists and sets is_enabled = 0", () => {
    const path = join(root, "db/seed/006_disable_demo_catalog.seed.sql");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/demo_cleaning_category/);
    expect(content).toMatch(/demo_cleaning_sku/);
    expect(content).toMatch(/is_enabled\s*=\s*0/);
  });

  it("official catalog seed is not demo-only", () => {
    const path = join(root, "db/seed/007_official_catalog.seed.sql");
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/sku_home_daily_2h/);
    expect(content).not.toMatch(/demo_cleaning_sku.*hangzhou.*is_enabled = 1/);
  });

  it("official pricing seed is not demo-only", () => {
    const path = join(root, "db/seed/008_official_pricing.seed.sql");
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/price_hangzhou_sku_home_daily_2h/);
  });
});
