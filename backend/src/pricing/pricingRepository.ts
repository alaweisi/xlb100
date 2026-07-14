import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type {
  PriceFeeItem,
  PriceQuoteBreakdown,
  PriceRule,
  ServiceSkuProfile,
  ServiceStandard,
} from "@xlb/types";
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
  price_text: string;
  price_type: string;
  min_price: string | null;
  max_price: string | null;
  pricing_note: string | null;
  currency: string;
  version: number;
  is_enabled: number;
};

type PriceFeeItemRow = RowDataPacket & {
  fee_item_id: string;
  city_code: string;
  price_rule_id: string;
  sku_id: string;
  fee_code: string;
  fee_name: string;
  fee_type: string;
  charge_method: string;
  amount: string;
  min_amount: string | null;
  max_amount: string | null;
  unit: string | null;
  is_optional: number;
  is_enabled: number;
  sort_order: number;
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

function mapPriceRule(row: PriceRuleRow): PriceRule {
  return {
    priceRuleId: row.price_rule_id,
    cityCode: row.city_code as CityCode,
    skuId: row.sku_id,
    basePrice: Number(row.base_price),
    currency: row.currency,
    priceText: row.price_text,
    priceType: row.price_type as PriceRule["priceType"],
    minPrice: row.min_price === null ? null : Number(row.min_price),
    maxPrice: row.max_price === null ? null : Number(row.max_price),
    pricingNote: row.pricing_note,
    isEnabled: row.is_enabled === 1,
    version: row.version,
  };
}

function mapPriceFeeItem(row: PriceFeeItemRow): PriceFeeItem {
  return {
    feeItemId: row.fee_item_id,
    cityCode: row.city_code as CityCode,
    priceRuleId: row.price_rule_id,
    skuId: row.sku_id,
    feeCode: row.fee_code,
    feeName: row.fee_name,
    feeType: row.fee_type as PriceFeeItem["feeType"],
    chargeMethod: row.charge_method as PriceFeeItem["chargeMethod"],
    amount: Number(row.amount),
    minAmount: row.min_amount === null ? null : Number(row.min_amount),
    maxAmount: row.max_amount === null ? null : Number(row.max_amount),
    unit: row.unit,
    isOptional: row.is_optional === 1,
    isEnabled: row.is_enabled === 1,
    sortOrder: row.sort_order,
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

function decimalToMinorExact(value: string | number, label: string): number {
  const decimal = typeof value === "number" ? value.toFixed(2) : value;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal);
  if (!match) throw new Error(`${label} must be a non-negative decimal with at most two fraction digits`);
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error(`${label} exceeds the safe money range`);
  return minor;
}

function minorToAmount(minor: number): number {
  if (!Number.isSafeInteger(minor)) throw new Error("price amount exceeds the safe money range");
  return minor / 100;
}

function calculateBreakdownFromOrderedItems(
  ruleBasePrice: string | number,
  feeItems: Array<{ item: PriceFeeItem; amountDecimal: string | number }>,
): { breakdown: PriceQuoteBreakdown; unitAmountMinor: number } {
  const enabledItems = feeItems
    .filter(({ item }) => item.isEnabled);
  const baseItem = enabledItems.find(({ item }) => item.feeType === "base");
  const baseAmountMinor = decimalToMinorExact(baseItem?.amountDecimal ?? ruleBasePrice, "Pricing base amount");
  const requiredFeeAmountMinor = enabledItems
    .filter(({ item }) => !item.isOptional && item.feeType !== "base" && item.chargeMethod !== "included")
    .reduce((sum, { item, amountDecimal }) => sum + decimalToMinorExact(amountDecimal, `Pricing fee ${item.feeItemId}`), 0);
  const optionalFeeAmountMinor = enabledItems
    .filter(({ item }) => item.isOptional && item.chargeMethod !== "onsite_quote")
    .reduce((sum, { item, amountDecimal }) => sum + decimalToMinorExact(amountDecimal, `Pricing fee ${item.feeItemId}`), 0);

  const unitAmountMinor = baseAmountMinor + requiredFeeAmountMinor;
  if (!Number.isSafeInteger(unitAmountMinor)) throw new Error("Pricing unit amount exceeds the safe money range");
  return {
    breakdown: {
      baseAmount: minorToAmount(baseAmountMinor),
      requiredFeeAmount: minorToAmount(requiredFeeAmountMinor),
      optionalFeeAmount: minorToAmount(optionalFeeAmountMinor),
      totalAmount: minorToAmount(unitAmountMinor),
      feeItems: enabledItems.map(({ item }) => item),
    },
    unitAmountMinor,
  };
}

export type CanonicalPublicPriceQuote = {
  rule: PriceRule;
  feeItems: PriceFeeItem[];
  breakdown: PriceQuoteBreakdown;
  unitAmountMinor: number;
  unitAmountDecimal: string;
};

/**
 * The one authoritative, transaction-scoped public quote loader used by
 * Marketing issuance and Order acceptance. Lock order is SKU -> rule -> fee
 * rows. Fee ordering and base selection are exactly the public Pricing rules.
 */
export async function loadCanonicalPublicPriceQuoteForUpdate(
  connection: PoolConnection,
  cityCode: CityCode,
  skuId: string,
): Promise<CanonicalPublicPriceQuote | null> {
  const [skuRows] = await connection.query<(RowDataPacket & { sku_id: string })[]>(
    `SELECT sku_id FROM service_skus
     WHERE city_code=? AND sku_id=? AND is_enabled=1
     LIMIT 1 FOR UPDATE`,
    [cityCode, skuId],
  );
  if (!skuRows[0]) return null;

  const [ruleRows] = await connection.query<PriceRuleRow[]>(
    `SELECT price_rule_id, city_code, sku_id, base_price, price_text, price_type,
            min_price, max_price, pricing_note, currency, version, is_enabled
     FROM price_rules
     WHERE city_code=? AND sku_id=? AND is_enabled=1
     ORDER BY version DESC, price_rule_id
     LIMIT 1 FOR UPDATE`,
    [cityCode, skuId],
  );
  const ruleRow = ruleRows[0];
  if (!ruleRow) return null;

  const [feeRows] = await connection.query<PriceFeeItemRow[]>(
    `SELECT fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
            fee_type, charge_method, amount, min_amount, max_amount, unit,
            is_optional, is_enabled, sort_order
     FROM price_fee_items
     WHERE city_code=? AND price_rule_id=?
     ORDER BY sort_order, fee_item_id
     FOR UPDATE`,
    [cityCode, ruleRow.price_rule_id],
  );
  const rule = mapPriceRule(ruleRow);
  const feeItems = feeRows.map(mapPriceFeeItem);
  const { breakdown, unitAmountMinor } = calculateBreakdownFromOrderedItems(
    ruleRow.base_price,
    feeRows.map((row, index) => ({ item: feeItems[index]!, amountDecimal: row.amount })),
  );

  return {
    rule,
    feeItems: breakdown.feeItems,
    breakdown,
    unitAmountMinor,
    unitAmountDecimal: `${Math.floor(unitAmountMinor / 100)}.${String(unitAmountMinor % 100).padStart(2, "0")}`,
  };
}

export function buildPriceQuoteBreakdown(
  rule: PriceRule,
  feeItems: PriceFeeItem[],
): PriceQuoteBreakdown {
  return calculateBreakdownFromOrderedItems(
    rule.basePrice,
    feeItems.map((item) => ({ item, amountDecimal: item.amount })),
  ).breakdown;
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
      `SELECT price_rule_id, city_code, sku_id, base_price, price_text, price_type,
              min_price, max_price, pricing_note, currency, version, is_enabled
       FROM price_rules
       WHERE ${where.clause} AND sku_id = ? AND is_enabled = 1
       ORDER BY version DESC, price_rule_id
       LIMIT 1`,
      [...where.params, skuId],
    );

    return rows[0] ? mapPriceRule(rows[0]) : null;
  }

  async findCanonicalPublicQuoteForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    skuId: string,
  ): Promise<CanonicalPublicPriceQuote | null> {
    return loadCanonicalPublicPriceQuoteForUpdate(connection, cityCode, skuId);
  }

  async findFeeItemsByPriceRule(
    context: RequestContext,
    cityCode: CityCode,
    priceRuleId: string,
  ): Promise<PriceFeeItem[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in fee item query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<PriceFeeItemRow[]>(
      `SELECT fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
              fee_type, charge_method, amount, min_amount, max_amount, unit,
              is_optional, is_enabled, sort_order
       FROM price_fee_items
       WHERE ${where.clause} AND price_rule_id = ? AND is_enabled = 1
       ORDER BY sort_order, fee_item_id`,
      [...where.params, priceRuleId],
    );

    return rows.map(mapPriceFeeItem);
  }

  async findSkuProfile(
    context: RequestContext,
    cityCode: CityCode,
    skuId: string,
  ): Promise<ServiceSkuProfile | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in sku profile query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<SkuProfileRow[]>(
      `SELECT sku_id, city_code, service_mode, brand_scope, model_scope,
              skill_level, warranty_days, requires_model, requires_measurement,
              supports_enterprise, service_guarantee_text
       FROM service_sku_profiles
       WHERE ${where.clause} AND sku_id = ?
       LIMIT 1`,
      [...where.params, skuId],
    );

    return rows[0] ? mapSkuProfile(rows[0]) : null;
  }

  async findServiceStandards(
    context: RequestContext,
    cityCode: CityCode,
    skuId: string,
  ): Promise<ServiceStandard[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in service standards query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<ServiceStandardRow[]>(
      `SELECT standard_id, sku_id, city_code, standard_type, title, content,
              sort_order, is_required, is_enabled
       FROM service_standards
       WHERE ${where.clause} AND sku_id = ? AND is_enabled = 1
       ORDER BY sort_order, standard_id`,
      [...where.params, skuId],
    );

    return rows.map(mapServiceStandard);
  }
}

export const pricingRepository = new PricingRepository();
