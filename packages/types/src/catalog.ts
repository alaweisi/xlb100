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
  profile: ServiceSkuProfile | null;
  standards: ServiceStandard[];
  sortOrder: number;
  isEnabled: boolean;
}

export type ServiceMode =
  | "installation"
  | "repair"
  | "cleaning"
  | "delivery"
  | "measurement"
  | "dismantle"
  | "maintenance"
  | "inspection";

export type StandardType =
  | "installation"
  | "repair"
  | "inspection"
  | "material"
  | "safety"
  | "warranty";

/** Productization profile for a city-scoped SKU */
export interface ServiceSkuProfile {
  skuId: string;
  cityCode: CityCode;
  serviceMode: ServiceMode;
  brandScope: string | null;
  modelScope: string | null;
  skillLevel: "basic" | "advanced" | "specialist";
  warrantyDays: number;
  requiresModel: boolean;
  requiresMeasurement: boolean;
  supportsEnterprise: boolean;
  serviceGuaranteeText: string;
}

/** Operational standard attached to a SKU */
export interface ServiceStandard {
  standardId: string;
  skuId: string;
  cityCode: CityCode;
  standardType: StandardType;
  title: string;
  content: string;
  sortOrder: number;
  isRequired: boolean;
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
