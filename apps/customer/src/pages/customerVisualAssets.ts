import type { CustomerCategoryIconKey } from "../adapters/catalogAdapters";

export function customerVisualAssetSrc(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, "")}`;
}

export const customerCategoryIconSrc: Readonly<Record<CustomerCategoryIconKey, string>> = {
  "home-cleaning": customerVisualAssetSrc("assets/home/categories/home-cleaning.png"),
  "appliance-cleaning": customerVisualAssetSrc("assets/home/categories/appliance-cleaning.png"),
  "appliance-repair": customerVisualAssetSrc("assets/home/categories/appliance-repair.png"),
  installation: customerVisualAssetSrc("assets/home/categories/installation.png"),
  pipe: customerVisualAssetSrc("assets/home/categories/pipe.png"),
  lock: customerVisualAssetSrc("assets/home/categories/lock.png"),
  utilities: customerVisualAssetSrc("assets/home/categories/utilities.png"),
  waterproofing: customerVisualAssetSrc("assets/home/categories/waterproofing.png"),
  furniture: customerVisualAssetSrc("assets/home/categories/furniture.png"),
  renovation: customerVisualAssetSrc("assets/home/categories/renovation.png"),
  moving: customerVisualAssetSrc("assets/home/categories/moving.png"),
  "air-quality": customerVisualAssetSrc("assets/home/categories/air-quality.png"),
  digital: customerVisualAssetSrc("assets/home/categories/digital.png"),
  laundry: customerVisualAssetSrc("assets/home/categories/laundry.png"),
  care: customerVisualAssetSrc("assets/home/categories/care.png"),
  "pest-control": customerVisualAssetSrc("assets/home/categories/pest-control.png"),
};
