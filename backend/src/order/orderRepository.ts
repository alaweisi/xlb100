import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { Order, OrderStatus } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type OrderRow = RowDataPacket & {
  order_id: string;
  city_code: string;
  address_province: string | null;
  address_city: string | null;
  address_district: string | null;
  detail_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  scheduled_at: Date | null;
  scheduled_time_slot: string | null;
  customer_id: string;
  sku_id: string;
  sku_name: string;
  quantity: number;
  unit: string;
  price_rule_id: string;
  price_text: string;
  price_type: string;
  base_price: string;
  currency: string;
  total_amount: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type SkuRow = RowDataPacket & {
  sku_id: string;
  name: string;
  unit: string;
  is_enabled: number;
};

function mapOrder(row: OrderRow): Order {
  return {
    orderId: row.order_id,
    cityCode: row.city_code as CityCode,
    addressProvince: row.address_province ?? "",
    addressCity: row.address_city ?? "",
    addressDistrict: row.address_district ?? "",
    detailAddress: row.detail_address ?? "",
    contactName: row.contact_name ?? "",
    contactPhone: row.contact_phone ?? "",
    scheduledAt: row.scheduled_at?.toISOString() ?? "",
    scheduledTimeSlot: (row.scheduled_time_slot ?? "morning") as Order["scheduledTimeSlot"],
    customerId: row.customer_id,
    skuId: row.sku_id,
    skuName: row.sku_name,
    quantity: row.quantity,
    unit: row.unit,
    priceRuleId: row.price_rule_id,
    priceText: row.price_text,
    priceType: row.price_type as Order["priceType"],
    basePrice: Number(row.base_price),
    currency: row.currency,
    totalAmount: Number(row.total_amount),
    status: row.status as OrderStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type InsertOrderInput = {
  orderId: string;
  cityCode: CityCode;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: Order["scheduledTimeSlot"];
  customerId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unit: string;
  priceRuleId: string;
  priceText: string;
  priceType: string;
  basePrice: number;
  currency: string;
  totalAmount: number;
  status: OrderStatus;
};

export class OrderRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findEnabledSku(
    context: RequestContext,
    cityCode: CityCode,
    skuId: string,
  ): Promise<{ skuId: string; name: string; unit: string } | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<SkuRow[]>(
      `SELECT sku_id, name, unit, is_enabled
       FROM service_skus
       WHERE ${where.clause} AND sku_id = ? AND is_enabled = 1
       LIMIT 1`,
      [...where.params, skuId],
    );

    if (!rows[0]) return null;
    return { skuId: rows[0].sku_id, name: rows[0].name, unit: rows[0].unit };
  }

  async insertOrder(connection: PoolConnection, input: InsertOrderInput): Promise<void> {
    await connection.query(
      `INSERT INTO orders
        (order_id, city_code, address_province, address_city, address_district,
         detail_address, contact_name, contact_phone, scheduled_at, scheduled_time_slot,
         customer_id, sku_id, sku_name, quantity, unit,
         price_rule_id, price_text, price_type, base_price, currency, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orderId,
        input.cityCode,
        input.addressProvince,
        input.addressCity,
        input.addressDistrict,
        input.detailAddress,
        input.contactName,
        input.contactPhone,
        new Date(input.scheduledAt),
        input.scheduledTimeSlot,
        input.customerId,
        input.skuId,
        input.skuName,
        input.quantity,
        input.unit,
        input.priceRuleId,
        input.priceText,
        input.priceType,
        input.basePrice,
        input.currency,
        input.totalAmount,
        input.status,
      ],
    );
  }

  async findById(
    context: RequestContext,
    cityCode: CityCode,
    orderId: string,
  ): Promise<Order | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in order query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<OrderRow[]>(
      `SELECT order_id, city_code, customer_id, sku_id, sku_name, quantity, unit,
              address_province, address_city, address_district, detail_address,
              contact_name, contact_phone, scheduled_at, scheduled_time_slot,
              price_rule_id, price_text, price_type, base_price, currency, total_amount,
              status, created_at, updated_at
       FROM orders
       WHERE ${where.clause} AND order_id = ?
       LIMIT 1`,
      [...where.params, orderId],
    );

    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async updateStatus(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    await connection.query(
      `UPDATE orders SET status = ? WHERE order_id = ? AND city_code = ?`,
      [status, orderId, cityCode],
    );
  }
}

export const orderRepository = new OrderRepository();
