import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { PaymentOrder, PaymentOrderMetadata } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type PaymentRow = RowDataPacket & {
  payment_order_id: string;
  order_id: string;
  city_code: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  metadata_json: string | Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

function parseMetadata(raw: PaymentRow["metadata_json"]): PaymentOrderMetadata {
  if (!raw) {
    throw new Error("payment order metadata_json is missing");
  }
  const data =
    typeof raw === "string"
      ? (JSON.parse(raw) as PaymentOrderMetadata)
      : (raw as unknown as PaymentOrderMetadata);
  return data;
}

function mapPaymentOrder(row: PaymentRow): PaymentOrder {
  return {
    paymentOrderId: row.payment_order_id,
    orderId: row.order_id,
    cityCode: row.city_code as CityCode,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentOrder["status"],
    provider: row.provider as PaymentOrder["provider"],
    providerTradeNo: row.provider_trade_no,
    metadata: row.metadata_json ? parseMetadata(row.metadata_json) : {
      orderId: row.order_id,
      cityCode: row.city_code as CityCode,
      skuId: "",
      priceRuleId: "",
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type InsertPaymentOrderInput = {
  paymentOrderId: string;
  orderId: string;
  cityCode: CityCode;
  amount: number;
  currency: string;
  provider: string;
  metadata: PaymentOrderMetadata;
};

export class PaymentOrderRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insertPaymentOrder(
    connection: PoolConnection,
    input: InsertPaymentOrderInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO payment_orders
        (payment_order_id, order_id, city_code, amount, currency, status, provider, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        input.paymentOrderId,
        input.orderId,
        input.cityCode,
        input.amount,
        input.currency,
        input.provider,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async findById(
    context: RequestContext,
    cityCode: CityCode,
    paymentOrderId: string,
  ): Promise<PaymentOrder | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<PaymentRow[]>(
      `SELECT payment_order_id, order_id, city_code, amount, currency, status, provider,
              provider_trade_no, metadata_json, created_at, updated_at
       FROM payment_orders
       WHERE ${where.clause} AND payment_order_id = ?
       LIMIT 1`,
      [...where.params, paymentOrderId],
    );

    return rows[0] ? mapPaymentOrder(rows[0]) : null;
  }

  async markPaid(
    connection: PoolConnection,
    cityCode: CityCode,
    paymentOrderId: string,
    providerTradeNo: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE payment_orders
       SET status = 'paid', provider_trade_no = ?
       WHERE payment_order_id = ? AND city_code = ?`,
      [providerTradeNo, paymentOrderId, cityCode],
    );
  }
}

export const paymentOrderRepository = new PaymentOrderRepository();
