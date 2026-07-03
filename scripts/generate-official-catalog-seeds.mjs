#!/usr/bin/env node
/**
 * Phase 3A-1: Generate official catalog/pricing seeds from TSV.
 * Usage: node scripts/generate-official-catalog-seeds.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TSV_PATH = join(ROOT, "docs/catalog/服务类目完整清单.tsv");
const CITIES = ["hangzhou", "shanghai", "beijing"];
const SKU_CODE_RE = /^sku_[a-z0-9_]+$/;
const EXPECTED_SKU_COUNT = 492;
const EXPECTED_CATEGORY_COUNT = 16;

function sqlEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function sqlStr(value) {
  return `'${sqlEscape(value)}'`;
}

function sqlDecimal(value) {
  if (value === null || value === undefined) return "NULL";
  return Number(value).toFixed(2);
}

function stableItemId(category, itemPath) {
  const hash = createHash("sha256")
    .update(`${category}|${itemPath}`, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `item_${hash}`;
}

function parsePrice(priceText) {
  const text = priceText.trim();
  if (text === "现场评估后报价") {
    return {
      priceText: text,
      priceType: "onsite_quote",
      minPrice: null,
      maxPrice: null,
      basePrice: 0,
      pricingNote: "现场评估后报价",
    };
  }
  const estimateMatch = text.match(/(?:上门估价|上门评估)[^¥]*¥(\d+(?:\.\d+)?)\s*起/);
  if (estimateMatch) {
    const min = Number(estimateMatch[1]);
    return {
      priceText: text,
      priceType: "estimate_from",
      minPrice: min,
      maxPrice: null,
      basePrice: min,
      pricingNote: null,
    };
  }
  const fromMatch = text.match(/¥(\d+(?:\.\d+)?)[^¥]*起\s*$/);
  if (fromMatch && !/上门/.test(text)) {
    const min = Number(fromMatch[1]);
    return {
      priceText: text,
      priceType: "from",
      minPrice: min,
      maxPrice: null,
      basePrice: min,
      pricingNote: null,
    };
  }
  const rangeMatch = text.match(/¥(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return {
      priceText: text,
      priceType: "range",
      minPrice: min,
      maxPrice: max,
      basePrice: min,
      pricingNote: null,
    };
  }
  const fixedMatch = text.match(/¥(\d+(?:\.\d+)?)/);
  if (fixedMatch) {
    const min = Number(fixedMatch[1]);
    return {
      priceText: text,
      priceType: "fixed",
      minPrice: min,
      maxPrice: min,
      basePrice: min,
      pricingNote: null,
    };
  }
  throw new Error(`Unable to parse price: ${text}`);
}

function parseTsv(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("TSV is empty");
  }
  const header = lines[0].split("\t");
  const expected = ["大类", "item（L2>L3>L4）", "SKU名称", "SKU编码", "单位", "价格"];
  for (let i = 0; i < expected.length; i += 1) {
    if (header[i] !== expected[i]) {
      throw new Error(`TSV header mismatch at column ${i + 1}: expected ${expected[i]}, got ${header[i] ?? "(missing)"}`);
    }
  }

  return lines.slice(1).map((line, index) => {
    const parts = line.split("\t");
    if (parts.length < 6) {
      throw new Error(`TSV row ${index + 2} has insufficient columns`);
    }
    const [category, itemPath, skuName, skuId, unit, price] = parts;
    return { category, itemPath, skuName, skuId, unit, price, lineNo: index + 2 };
  });
}

function validateRows(rows) {
  const errors = [];

  if (rows.length !== EXPECTED_SKU_COUNT) {
    errors.push(`SKU row count must be ${EXPECTED_SKU_COUNT}, got ${rows.length}`);
  }

  const categories = [];
  const seenCategories = new Set();
  for (const row of rows) {
    if (!seenCategories.has(row.category)) {
      seenCategories.add(row.category);
      categories.push(row.category);
    }
  }
  if (categories.length !== EXPECTED_CATEGORY_COUNT) {
    errors.push(`Level-1 category count must be ${EXPECTED_CATEGORY_COUNT}, got ${categories.length}`);
  }

  const skuIds = rows.map((r) => r.skuId);
  const dup = skuIds.filter((id, i) => skuIds.indexOf(id) !== i);
  if (dup.length > 0) {
    errors.push(`Duplicate SKU codes: ${[...new Set(dup)].join(", ")}`);
  }

  for (const row of rows) {
    if (!row.category || !row.itemPath || !row.skuName || !row.skuId || !row.unit || !row.price) {
      errors.push(`Row ${row.lineNo}: required field is empty`);
    }
    if (row.itemPath.split(">").length !== 3) {
      errors.push(`Row ${row.lineNo}: item must be L2>L3>L4, got ${row.itemPath}`);
    }
    if (!SKU_CODE_RE.test(row.skuId)) {
      errors.push(`Row ${row.lineNo}: invalid SKU code ${row.skuId}`);
    }
    if (row.skuId.includes("demo_cleaning") || row.category.includes("demo_cleaning")) {
      errors.push(`Row ${row.lineNo}: demo_cleaning must not appear in official TSV`);
    }
    if (["__global__", "hangzhou", "shanghai", "beijing"].includes(row.category)) {
      // category check only — city codes in wrong column would be caught elsewhere
    }
    const raw = JSON.stringify(row);
    if (raw.includes("__global__")) {
      errors.push(`Row ${row.lineNo}: __global__ must not appear in official TSV`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`TSV validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  return categories;
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function buildDisableDemoSeed() {
  return `-- Phase 3A-1: Disable demo catalog entries (audit-retained, not deleted)
-- Generated by scripts/generate-official-catalog-seeds.mjs

UPDATE service_categories SET is_enabled = 0 WHERE category_id = 'demo_cleaning_category';
UPDATE service_items SET is_enabled = 0 WHERE item_id = 'demo_cleaning_item';
UPDATE service_skus SET is_enabled = 0 WHERE sku_id = 'demo_cleaning_sku';
UPDATE price_rules SET is_enabled = 0 WHERE sku_id = 'demo_cleaning_sku' OR price_rule_id LIKE 'demo_price_%';
`;
}

function buildCatalogSeed(rows, categories) {
  const categoryIdByName = new Map(
    categories.map((name, index) => [name, `cat_${String(index + 1).padStart(2, "0")}`]),
  );

  const itemMeta = new Map();
  let itemSort = 0;
  for (const row of rows) {
    const key = `${row.category}|${row.itemPath}`;
    if (!itemMeta.has(key)) {
      const segments = row.itemPath.split(">");
      itemMeta.set(key, {
        category: row.category,
        itemPath: row.itemPath,
        itemId: stableItemId(row.category, row.itemPath),
        categoryId: categoryIdByName.get(row.category),
        l4Name: segments[2],
        sortOrder: (itemSort += 1),
      });
    }
  }

  const skuMeta = rows.map((row, index) => ({
    ...row,
    categoryId: categoryIdByName.get(row.category),
    itemId: stableItemId(row.category, row.itemPath),
    sortOrder: index + 1,
  }));

  const lines = [
    "-- Phase 3A-1: Official service catalog seed",
    "-- Source: docs/catalog/服务类目完整清单.tsv",
    "-- Generated by scripts/generate-official-catalog-seeds.mjs",
    "",
  ];

  const categoryRows = [];
  for (const city of CITIES) {
    for (const [index, name] of categories.entries()) {
      const categoryId = categoryIdByName.get(name);
      categoryRows.push(
        `  (${sqlStr(categoryId)}, ${sqlStr(city)}, ${sqlStr(name)}, ${index + 1}, 1)`,
      );
    }
  }
  for (const part of chunk(categoryRows, 50)) {
    lines.push(
      "INSERT INTO service_categories (category_id, city_code, name, sort_order, is_enabled) VALUES",
      `${part.join(",\n")}`,
      "ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);",
      "",
    );
  }

  const itemRows = [];
  for (const city of CITIES) {
    for (const meta of itemMeta.values()) {
      itemRows.push(
        `  (${sqlStr(meta.itemId)}, ${sqlStr(meta.categoryId)}, ${sqlStr(city)}, ${sqlStr(meta.l4Name)}, ${sqlStr(meta.itemPath)}, ${meta.sortOrder}, 1)`,
      );
    }
  }
  for (const part of chunk(itemRows, 50)) {
    lines.push(
      "INSERT INTO service_items (item_id, category_id, city_code, name, item_path, sort_order, is_enabled) VALUES",
      `${part.join(",\n")}`,
      "ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), item_path = VALUES(item_path), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);",
      "",
    );
  }

  const skuRows = [];
  for (const city of CITIES) {
    for (const meta of skuMeta) {
      skuRows.push(
        `  (${sqlStr(meta.skuId)}, ${sqlStr(meta.itemId)}, ${sqlStr(city)}, ${sqlStr(meta.skuName)}, ${sqlStr(meta.unit)}, ${meta.sortOrder}, 1)`,
      );
    }
  }
  for (const part of chunk(skuRows, 50)) {
    lines.push(
      "INSERT INTO service_skus (sku_id, item_id, city_code, name, unit, sort_order, is_enabled) VALUES",
      `${part.join(",\n")}`,
      "ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), name = VALUES(name), unit = VALUES(unit), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);",
      "",
    );
  }

  return {
    sql: `${lines.join("\n")}\n`,
    stats: {
      categoriesPerCity: categories.length,
      itemsPerCity: itemMeta.size,
      skusPerCity: skuMeta.length,
      categoryRows: categoryRows.length,
      itemRows: itemRows.length,
      skuRows: skuRows.length,
    },
  };
}

function buildPricingSeed(rows) {
  const lines = [
    "-- Phase 3A-1: Official pricing seed — independent price_rules per city",
    "-- Source: docs/catalog/服务类目完整清单.tsv",
    "-- Generated by scripts/generate-official-catalog-seeds.mjs",
    "",
  ];

  const priceRows = [];
  for (const city of CITIES) {
    for (const row of rows) {
      const parsed = parsePrice(row.price);
      const priceRuleId = `price_${city}_${row.skuId}`;
      priceRows.push(
        `  (${sqlStr(priceRuleId)}, ${sqlStr(city)}, ${sqlStr(row.skuId)}, ${sqlDecimal(parsed.basePrice)}, ${sqlStr(parsed.priceText)}, ${sqlStr(parsed.priceType)}, ${sqlDecimal(parsed.minPrice)}, ${sqlDecimal(parsed.maxPrice)}, ${parsed.pricingNote ? sqlStr(parsed.pricingNote) : "NULL"}, 'CNY', 1, 1)`,
      );
    }
  }

  for (const part of chunk(priceRows, 50)) {
    lines.push(
      "INSERT INTO price_rules (price_rule_id, city_code, sku_id, base_price, price_text, price_type, min_price, max_price, pricing_note, currency, version, is_enabled) VALUES",
      `${part.join(",\n")}`,
      "ON DUPLICATE KEY UPDATE base_price = VALUES(base_price), price_text = VALUES(price_text), price_type = VALUES(price_type), min_price = VALUES(min_price), max_price = VALUES(max_price), pricing_note = VALUES(pricing_note), currency = VALUES(currency), version = VALUES(version), is_enabled = VALUES(is_enabled);",
      "",
    );
  }

  return {
    sql: `${lines.join("\n")}\n`,
    stats: {
      priceRulesPerCity: rows.length,
      priceRuleRows: priceRows.length,
    },
  };
}

function main() {
  let content;
  try {
    content = readFileSync(TSV_PATH, "utf8");
  } catch {
    console.error("正式类目 TSV 源文件不存在，禁止继续生成 seed。");
    console.error(`Expected: ${TSV_PATH}`);
    process.exit(1);
  }

  const rows = parseTsv(content);
  const categories = validateRows(rows);

  const disableSql = buildDisableDemoSeed();
  const catalog = buildCatalogSeed(rows, categories);
  const pricing = buildPricingSeed(rows);

  writeFileSync(join(ROOT, "db/seed/006_disable_demo_catalog.seed.sql"), disableSql, "utf8");
  writeFileSync(join(ROOT, "db/seed/007_official_catalog.seed.sql"), catalog.sql, "utf8");
  writeFileSync(join(ROOT, "db/seed/008_official_pricing.seed.sql"), pricing.sql, "utf8");

  console.log("Official catalog seeds generated successfully.");
  console.log(`  source: docs/catalog/服务类目完整清单.tsv`);
  console.log(`  cities: ${CITIES.length}`);
  console.log(`  level1 categories: ${categories.length}`);
  console.log(`  unique items: ${catalog.stats.itemsPerCity}`);
  console.log(`  skus per city: ${catalog.stats.skusPerCity}`);
  console.log(`  service_categories total: ${catalog.stats.categoryRows}`);
  console.log(`  service_items total: ${catalog.stats.itemRows}`);
  console.log(`  service_skus total: ${catalog.stats.skuRows}`);
  console.log(`  price_rules per city: ${pricing.stats.priceRulesPerCity}`);
  console.log(`  price_rules total: ${pricing.stats.priceRuleRows}`);
  console.log("");
  console.log("Level-1 categories:");
  for (const name of categories) {
    console.log(`  - ${name}`);
  }
}

main();
