import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, Fulfillment } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../dal/scopedExecutor.js";

type FulfillmentRow = RowDataPacket & {
  fulfillment_id: string;
  acceptance_id: string;
  dispatch_task_id: string;
  order_id: string;
  city_code: string;
  worker_id: string;
  sku_id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapFulfillmentRow(row: FulfillmentRow): Fulfillment {
  return {
    fulfillmentId: row.fulfillment_id,
    acceptanceId: row.acceptance_id,
    dispatchTaskId: row.dispatch_task_id,
    orderId: row.order_id,
    cityCode: row.city_code as CityCode,
    workerId: row.worker_id,
    skuId: row.sku_id,
    status: row.status as Fulfillment["status"],
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class FulfillmentRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insertSkeleton(
    connection: PoolConnection,
    input: {
      fulfillmentId: string;
      acceptanceId: string;
      dispatchTaskId: string;
      orderId: string;
      cityCode: CityCode;
      workerId: string;
      skuId: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO fulfillments (
         fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
         worker_id, sku_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted')`,
      [
        input.fulfillmentId,
        input.acceptanceId,
        input.dispatchTaskId,
        input.orderId,
        input.cityCode,
        input.workerId,
        input.skuId,
      ],
    );
  }

  async findByDispatchTaskId(
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<FulfillmentRow[]>(
      `SELECT fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
              worker_id, sku_id, status, started_at, completed_at, created_at, updated_at
       FROM fulfillments
       WHERE dispatch_task_id = ? AND ${where.clause}
       LIMIT 1`,
      [dispatchTaskId, ...where.params],
    );
    return rows[0] ? mapFulfillmentRow(rows[0]) : null;
  }

  async findByAcceptanceId(
    acceptanceId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<FulfillmentRow[]>(
      `SELECT fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
              worker_id, sku_id, status, started_at, completed_at, created_at, updated_at
       FROM fulfillments
       WHERE acceptance_id = ? AND ${where.clause}
       LIMIT 1`,
      [acceptanceId, ...where.params],
    );
    return rows[0] ? mapFulfillmentRow(rows[0]) : null;
  }

  async findByIdForWorker(
    fulfillmentId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<Fulfillment | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<FulfillmentRow[]>(
      `SELECT fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
              worker_id, sku_id, status, started_at, completed_at, created_at, updated_at
       FROM fulfillments
       WHERE fulfillment_id = ? AND worker_id = ? AND ${where.clause}
       LIMIT 1`,
      [fulfillmentId, workerId, ...where.params],
    );
    return rows[0] ? mapFulfillmentRow(rows[0]) : null;
  }

  async listByWorker(
    workerId: string,
    cityCode: CityCode,
    limit = 100,
  ): Promise<Fulfillment[]> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<FulfillmentRow[]>(
      `SELECT fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
              worker_id, sku_id, status, started_at, completed_at, created_at, updated_at
       FROM fulfillments
       WHERE worker_id = ? AND ${where.clause}
       ORDER BY created_at DESC
       LIMIT ?`,
      [workerId, ...where.params, limit],
    );
    return rows.map(mapFulfillmentRow);
  }
}

export const fulfillmentRepository = new FulfillmentRepository();
