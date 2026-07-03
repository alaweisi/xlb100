import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, WorkerTaskAcceptance } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../dal/scopedExecutor.js";

type AcceptanceRow = RowDataPacket & {
  acceptance_id: string;
  dispatch_task_id: string;
  city_code: string;
  order_id: string;
  worker_id: string;
  sku_id: string;
  status: string;
  accepted_at: Date;
  created_at: Date;
  updated_at: Date;
};

function mapAcceptanceRow(row: AcceptanceRow): WorkerTaskAcceptance {
  return {
    acceptanceId: row.acceptance_id,
    dispatchTaskId: row.dispatch_task_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    workerId: row.worker_id,
    skuId: row.sku_id,
    status: row.status as WorkerTaskAcceptance["status"],
    acceptedAt: row.accepted_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class WorkerAcceptRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findByDispatchTaskId(
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<WorkerTaskAcceptance | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<AcceptanceRow[]>(
      `SELECT acceptance_id, dispatch_task_id, city_code, order_id, worker_id, sku_id,
              status, accepted_at, created_at, updated_at
       FROM worker_task_acceptances
       WHERE dispatch_task_id = ? AND ${where.clause}
       LIMIT 1`,
      [dispatchTaskId, ...where.params],
    );
    return rows[0] ? mapAcceptanceRow(rows[0]) : null;
  }

  async insert(
    connection: PoolConnection,
    input: {
      acceptanceId: string;
      dispatchTaskId: string;
      cityCode: CityCode;
      orderId: string;
      workerId: string;
      skuId: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO worker_task_acceptances (
         acceptance_id, dispatch_task_id, city_code, order_id, worker_id, sku_id, status, accepted_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP)`,
      [
        input.acceptanceId,
        input.dispatchTaskId,
        input.cityCode,
        input.orderId,
        input.workerId,
        input.skuId,
      ],
    );
  }

  async findById(
    acceptanceId: string,
    cityCode: CityCode,
  ): Promise<WorkerTaskAcceptance | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<AcceptanceRow[]>(
      `SELECT acceptance_id, dispatch_task_id, city_code, order_id, worker_id, sku_id,
              status, accepted_at, created_at, updated_at
       FROM worker_task_acceptances
       WHERE acceptance_id = ? AND ${where.clause}
       LIMIT 1`,
      [acceptanceId, ...where.params],
    );
    return rows[0] ? mapAcceptanceRow(rows[0]) : null;
  }
}

export const workerAcceptRepository = new WorkerAcceptRepository();
