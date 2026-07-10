import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type {
  CatalogSnapshot,
  ServiceCategory,
  ServiceItem,
  ServiceSku,
  ServiceSkuProfile,
  ServiceStandard,
} from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type CategoryRow = RowDataPacket & {
  category_id: string;
  city_code: string;
  name: string;
  sort_order: number;
  is_enabled: number;
};

type ItemRow = RowDataPacket & {
  item_id: string;
  category_id: string;
  city_code: string;
  name: string;
  sort_order: number;
  is_enabled: number;
};

type SkuRow = RowDataPacket & {
  sku_id: string;
  item_id: string;
  city_code: string;
  name: string;
  unit: string;
  sort_order: number;
  is_enabled: number;
};

type SkuProfileRow = RowDataPacket & {
  sku_id: string;
  city_code: string;
  service_mode: string;
  brand_scope: string | null;
  model_scope: string | null;
  skill_level: string;
  warranty_days: number;
  requires_model: number;
  requires_measurement: number;
  supports_enterprise: number;
  service_guarantee_text: string;
};

type ServiceStandardRow = RowDataPacket & {
  standard_id: string;
  sku_id: string;
  city_code: string;
  standard_type: string;
  title: string;
  content: string;
  sort_order: number;
  is_required: number;
  is_enabled: number;
};

function mapCategory(row: CategoryRow): ServiceCategory {
  return {
    categoryId: row.category_id,
    cityCode: row.city_code as CityCode,
    name: row.name,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled === 1,
  };
}

function mapItem(row: ItemRow): ServiceItem {
  return {
    itemId: row.item_id,
    categoryId: row.category_id,
    cityCode: row.city_code as CityCode,
    name: row.name,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled === 1,
  };
}

function mapSku(
  row: SkuRow,
  profile: ServiceSkuProfile | null,
  standards: ServiceStandard[],
): ServiceSku {
  return {
    skuId: row.sku_id,
    itemId: row.item_id,
    cityCode: row.city_code as CityCode,
    name: row.name,
    unit: row.unit,
    profile,
    standards,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled === 1,
  };
}

function mapSkuProfile(row: SkuProfileRow): ServiceSkuProfile {
  return {
    skuId: row.sku_id,
    cityCode: row.city_code as CityCode,
    serviceMode: row.service_mode as ServiceSkuProfile["serviceMode"],
    brandScope: row.brand_scope,
    modelScope: row.model_scope,
    skillLevel: row.skill_level as ServiceSkuProfile["skillLevel"],
    warrantyDays: row.warranty_days,
    requiresModel: row.requires_model === 1,
    requiresMeasurement: row.requires_measurement === 1,
    supportsEnterprise: row.supports_enterprise === 1,
    serviceGuaranteeText: row.service_guarantee_text,
  };
}

function mapServiceStandard(row: ServiceStandardRow): ServiceStandard {
  return {
    standardId: row.standard_id,
    skuId: row.sku_id,
    cityCode: row.city_code as CityCode,
    standardType: row.standard_type as ServiceStandard["standardType"],
    title: row.title,
    content: row.content,
    sortOrder: row.sort_order,
    isRequired: row.is_required === 1,
    isEnabled: row.is_enabled === 1,
  };
}

export class CatalogRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findEnabledCatalog(
    context: RequestContext,
    cityCode: CityCode,
  ): Promise<CatalogSnapshot> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in catalog query");
    }

    const where = buildCityScopedWhere(cityCode);

    const [categoryRows] = await this.pool.query<CategoryRow[]>(
      `SELECT category_id, city_code, name, sort_order, is_enabled
       FROM service_categories
       WHERE ${where.clause} AND is_enabled = 1
       ORDER BY sort_order, category_id`,
      where.params,
    );

    const [itemRows] = await this.pool.query<ItemRow[]>(
      `SELECT item_id, category_id, city_code, name, sort_order, is_enabled
       FROM service_items
       WHERE ${where.clause} AND is_enabled = 1
       ORDER BY sort_order, item_id`,
      where.params,
    );

    const [skuRows] = await this.pool.query<SkuRow[]>(
      `SELECT sku_id, item_id, city_code, name, unit, sort_order, is_enabled
       FROM service_skus
       WHERE ${where.clause} AND is_enabled = 1
       ORDER BY sort_order, sku_id`,
      where.params,
    );

    const [profileRows] = await this.pool.query<SkuProfileRow[]>(
      `SELECT sku_id, city_code, service_mode, brand_scope, model_scope,
              skill_level, warranty_days, requires_model, requires_measurement,
              supports_enterprise, service_guarantee_text
       FROM service_sku_profiles
       WHERE ${where.clause}`,
      where.params,
    );

    const [standardRows] = await this.pool.query<ServiceStandardRow[]>(
      `SELECT standard_id, sku_id, city_code, standard_type, title, content,
              sort_order, is_required, is_enabled
       FROM service_standards
       WHERE ${where.clause} AND is_enabled = 1
       ORDER BY sku_id, sort_order, standard_id`,
      where.params,
    );

    const itemsByCategory = new Map<string, ServiceItem[]>();
    for (const row of itemRows) {
      const item = mapItem(row);
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    }

    const skusByItem = new Map<string, ServiceSku[]>();
    const profilesBySku = new Map<string, ServiceSkuProfile>();
    for (const row of profileRows) {
      profilesBySku.set(row.sku_id, mapSkuProfile(row));
    }

    const standardsBySku = new Map<string, ServiceStandard[]>();
    for (const row of standardRows) {
      const standard = mapServiceStandard(row);
      const list = standardsBySku.get(standard.skuId) ?? [];
      list.push(standard);
      standardsBySku.set(standard.skuId, list);
    }

    for (const row of skuRows) {
      const sku = mapSku(
        row,
        profilesBySku.get(row.sku_id) ?? null,
        standardsBySku.get(row.sku_id) ?? [],
      );
      const list = skusByItem.get(sku.itemId) ?? [];
      list.push(sku);
      skusByItem.set(sku.itemId, list);
    }

    const categories = categoryRows.map((row) => {
      const category = mapCategory(row);
      const items = (itemsByCategory.get(category.categoryId) ?? []).map(
        (item) => ({
          ...item,
          skus: skusByItem.get(item.itemId) ?? [],
        }),
      );
      return { ...category, items };
    });

    return { cityCode, categories };
  }
}

export const catalogRepository = new CatalogRepository();
