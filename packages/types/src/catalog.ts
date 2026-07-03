import type { CityCode } from "./city.js";

/** City-scoped service category — not a transaction */
export interface ServiceCategory {
  categoryId: string;
  cityCode: CityCode;
  name: string;
  sortOrder: number;
  isEnabled: boolean;
}

/** City-scoped service item */
export interface ServiceItem {
  itemId: string;
  categoryId: string;
  cityCode: CityCode;
  name: string;
  sortOrder: number;
  isEnabled: boolean;
}

/** City-scoped service SKU */
export interface ServiceSku {
  skuId: string;
  itemId: string;
  cityCode: CityCode;
  name: string;
  unit: string;
  sortOrder: number;
  isEnabled: boolean;
}

/** Enabled catalog tree for a city */
export interface CatalogSnapshot {
  cityCode: CityCode;
  categories: Array<
    ServiceCategory & {
      items: Array<
        ServiceItem & {
          skus: ServiceSku[];
        }
      >;
    }
  >;
}
