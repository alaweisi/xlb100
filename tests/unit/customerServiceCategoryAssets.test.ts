import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCustomerServiceCategoryAssetSrc,
  CUSTOMER_SERVICE_CATEGORY_ASSET_BY_NAME,
  CUSTOMER_SERVICE_CATEGORY_ASSETS,
  getCustomerServiceCategoryAsset,
  OFFICIAL_SERVICE_CATEGORY_NAMES,
} from "../../apps/customer/src/assets/serviceCategoryAssets";

const repositoryRoot = path.resolve(__dirname, "../..");
const publicRoot = path.join(repositoryRoot, "apps/customer/public");
const manifestPath = path.join(publicRoot, "assets/service-categories/manifest.json");

interface AssetManifest {
  scope: string;
  sourceAuthority: string;
  visualAuthority: string;
  background: string;
  width: number;
  height: number;
  entries: Array<{
    categoryName: string;
    src: string;
    alt: string;
  }>;
}

function readPngHeader(filePath: string) {
  const file = readFileSync(filePath);
  return {
    signature: file.subarray(0, 8).toString("hex"),
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bitDepth: file[24],
    colorType: file[25],
  };
}

describe("Customer service category assets", () => {
  it("resolves category images under the configured deployment base", () => {
    expect(buildCustomerServiceCategoryAssetSrc("home-cleaning", "/customer/")).toBe(
      "/customer/assets/service-categories/home-cleaning.png",
    );
    expect(buildCustomerServiceCategoryAssetSrc("home-cleaning", "/customer")).toBe(
      "/customer/assets/service-categories/home-cleaning.png",
    );
  });

  it("locks the exact 16-category official catalog order", () => {
    expect(OFFICIAL_SERVICE_CATEGORY_NAMES).toEqual([
      "家庭保洁",
      "家电清洗",
      "家电维修",
      "上门安装",
      "管道疏通",
      "开锁换锁",
      "水电维修",
      "防水补漏/精准测漏",
      "家具家居维修保养",
      "房屋修缮/局部改造",
      "搬家搬运/拆旧清运",
      "甲醛检测治理",
      "数码办公维修",
      "洗衣洗鞋",
      "保姆月嫂/照护",
      "四害消杀",
    ]);
  });

  it("provides one stable, immutable and unique mapping for every category", () => {
    expect(CUSTOMER_SERVICE_CATEGORY_ASSETS).toHaveLength(16);
    expect(Object.isFrozen(CUSTOMER_SERVICE_CATEGORY_ASSETS)).toBe(true);
    expect(Object.isFrozen(CUSTOMER_SERVICE_CATEGORY_ASSET_BY_NAME)).toBe(true);
    expect(CUSTOMER_SERVICE_CATEGORY_ASSETS.map((asset) => asset.categoryName)).toEqual(
      OFFICIAL_SERVICE_CATEGORY_NAMES,
    );
    expect(new Set(CUSTOMER_SERVICE_CATEGORY_ASSETS.map((asset) => asset.src))).toHaveProperty(
      "size",
      16,
    );
    expect(new Set(CUSTOMER_SERVICE_CATEGORY_ASSETS.map((asset) => asset.alt))).toHaveProperty(
      "size",
      16,
    );
    for (const asset of CUSTOMER_SERVICE_CATEGORY_ASSETS) {
      expect(Object.isFrozen(asset)).toBe(true);
      expect(getCustomerServiceCategoryAsset(asset.categoryName)).toBe(asset);
      expect(asset.src).toMatch(/^\/assets\/service-categories\/[a-z-]+\.png$/);
      expect(asset.alt).toMatch(/服务图标$/);
    }
    expect(getCustomerServiceCategoryAsset("不存在的类目")).toBeUndefined();
  });

  it("ships every mapped icon as a compact 512px RGBA PNG", () => {
    for (const asset of CUSTOMER_SERVICE_CATEGORY_ASSETS) {
      const filePath = path.join(publicRoot, asset.src.slice(1));
      const header = readPngHeader(filePath);
      expect(header).toEqual({
        signature: "89504e470d0a1a0a",
        width: 512,
        height: 512,
        bitDepth: 8,
        colorType: 6,
      });
      expect(statSync(filePath).size).toBeGreaterThan(25_000);
      expect(statSync(filePath).size).toBeLessThan(350_000);
    }
  });

  it("keeps the public manifest synchronized with the runtime mapping", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AssetManifest;
    expect(manifest).toMatchObject({
      scope: "customer",
      sourceAuthority: "docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md",
      visualAuthority: "docs/design/ui/references/customer-home-visual-truth.png",
      background: "transparent",
      width: 512,
      height: 512,
    });
    expect(manifest.entries.map(({ categoryName, src, alt }) => ({ categoryName, src, alt }))).toEqual(
      CUSTOMER_SERVICE_CATEGORY_ASSETS.map(({ categoryName, src, alt }) => ({
        categoryName,
        src,
        alt,
      })),
    );
  });
});
