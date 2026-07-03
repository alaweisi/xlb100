import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tsvPath = join(root, "docs/catalog/服务类目完整清单.tsv");
const sourcePath = join(root, "docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md");

describe("officialCatalogSource contract", () => {
  it("TSV source file exists", () => {
    expect(existsSync(tsvPath)).toBe(true);
  });

  it("TSV has 16 categories and 492 SKUs", () => {
    const content = readFileSync(tsvPath, "utf8");
    const lines = content.trim().split(/\r?\n/).slice(1);
    expect(lines.length).toBe(492);

    const categories = new Set<string>();
    for (const line of lines) {
      categories.add(line.split("\t")[0] ?? "");
    }
    expect(categories.size).toBe(16);
  });

  it("SKU codes are unique", () => {
    const content = readFileSync(tsvPath, "utf8");
    const skuIds = content
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split("\t")[3]);
    const unique = new Set(skuIds);
    expect(unique.size).toBe(skuIds.length);
  });

  it("source doc is confirmed", () => {
    const source = readFileSync(sourcePath, "utf8");
    expect(source).toMatch(/STATUS:\s*CONFIRMED/);
    expect(source).not.toMatch(/WAITING_FOR_USER_CONFIRMATION/);
  });
});
