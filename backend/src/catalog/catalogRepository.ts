import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type {
  CatalogSnapshot,
  ServiceCategory,
  ServiceItem,
  ServiceSku,
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

function mapSku(row: SkuRow): ServiceSku {
  return {
    skuId: row.sku_id,
    itemId: row.item_id,
    cityCode: row.city_code as CityCode,
    name: row.name,
    unit: row.unit,
    sortOrder: row.sort_order,
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

    const itemsByCategory = new Map<string, ServiceItem[]>();
    for (const row of itemRows) {
      const item = mapItem(row);
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    }

    const skusByItem = new Map<string, ServiceSku[]>();
    for (const row of skuRows) {
      const sku = mapSku(row);
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
