import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { PriceRule } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type PriceRuleRow = RowDataPacket & {
  price_rule_id: string;
  city_code: string;
  sku_id: string;
  base_price: string;
  currency: string;
  version: number;
  is_enabled: number;
};

function mapPriceRule(row: PriceRuleRow): PriceRule {
  return {
    priceRuleId: row.price_rule_id,
    cityCode: row.city_code as CityCode,
    skuId: row.sku_id,
    basePrice: Number(row.base_price),
    currency: row.currency,
    isEnabled: row.is_enabled === 1,
    version: row.version,
  };
}

export class PricingRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findPriceRuleBySku(
    context: RequestContext,
    cityCode: CityCode,
    skuId: string,
  ): Promise<PriceRule | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in pricing query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<PriceRuleRow[]>(
      `SELECT price_rule_id, city_code, sku_id, base_price, currency, version, is_enabled
       FROM price_rules
       WHERE ${where.clause} AND sku_id = ? AND is_enabled = 1
       ORDER BY version DESC
       LIMIT 1`,
      [...where.params, skuId],
    );

    return rows[0] ? mapPriceRule(rows[0]) : null;
  }
}

export const pricingRepository = new PricingRepository();
