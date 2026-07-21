export const OFFICIAL_SERVICE_CATEGORY_NAMES = [
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
] as const;

export type OfficialServiceCategoryName = typeof OFFICIAL_SERVICE_CATEGORY_NAMES[number];

export interface CustomerServiceCategoryAsset {
  readonly categoryName: OfficialServiceCategoryName;
  readonly src: string;
  readonly alt: string;
  readonly width: 512;
  readonly height: 512;
}

export function buildCustomerServiceCategoryAssetSrc(
  slug: string,
  publicBase = import.meta.env.BASE_URL || "/",
): string {
  const normalizedBase = publicBase.endsWith("/") ? publicBase : `${publicBase}/`;
  return `${normalizedBase}assets/service-categories/${slug}.png`;
}

function defineAsset(
  categoryName: OfficialServiceCategoryName,
  slug: string,
  alt: string,
): CustomerServiceCategoryAsset {
  return Object.freeze({
    categoryName,
    src: buildCustomerServiceCategoryAssetSrc(slug),
    alt,
    width: 512,
    height: 512,
  });
}

export const CUSTOMER_SERVICE_CATEGORY_ASSETS = Object.freeze([
  defineAsset("家庭保洁", "home-cleaning", "家庭保洁服务图标"),
  defineAsset("家电清洗", "appliance-cleaning", "家电清洗服务图标"),
  defineAsset("家电维修", "appliance-repair", "家电维修服务图标"),
  defineAsset("上门安装", "onsite-installation", "上门安装服务图标"),
  defineAsset("管道疏通", "pipe-unclogging", "管道疏通服务图标"),
  defineAsset("开锁换锁", "locksmith", "开锁换锁服务图标"),
  defineAsset("水电维修", "plumbing-electrical-repair", "水电维修服务图标"),
  defineAsset("防水补漏/精准测漏", "waterproof-leak-detection", "防水补漏与精准测漏服务图标"),
  defineAsset("家具家居维修保养", "furniture-maintenance", "家具家居维修保养服务图标"),
  defineAsset("房屋修缮/局部改造", "home-renovation", "房屋修缮与局部改造服务图标"),
  defineAsset("搬家搬运/拆旧清运", "moving-hauling", "搬家搬运与拆旧清运服务图标"),
  defineAsset("甲醛检测治理", "formaldehyde-treatment", "甲醛检测治理服务图标"),
  defineAsset("数码办公维修", "digital-office-repair", "数码办公维修服务图标"),
  defineAsset("洗衣洗鞋", "laundry-shoe-care", "洗衣洗鞋服务图标"),
  defineAsset("保姆月嫂/照护", "childcare-caregiving", "保姆月嫂与照护服务图标"),
  defineAsset("四害消杀", "pest-control", "四害消杀服务图标"),
]);

export const CUSTOMER_SERVICE_CATEGORY_ASSET_BY_NAME = Object.freeze(
  Object.fromEntries(
    CUSTOMER_SERVICE_CATEGORY_ASSETS.map((asset) => [asset.categoryName, asset]),
  ),
) as Readonly<Record<OfficialServiceCategoryName, CustomerServiceCategoryAsset>>;

export function getCustomerServiceCategoryAsset(
  categoryName: string,
): CustomerServiceCategoryAsset | undefined {
  if (!Object.prototype.hasOwnProperty.call(CUSTOMER_SERVICE_CATEGORY_ASSET_BY_NAME, categoryName)) {
    return undefined;
  }
  return CUSTOMER_SERVICE_CATEGORY_ASSET_BY_NAME[categoryName as OfficialServiceCategoryName];
}
