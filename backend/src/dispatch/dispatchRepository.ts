import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, DispatchTask, RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type DispatchTaskRow = RowDataPacket & {
  dispatch_task_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  sku_id: string;
  amount: string;
  source_event_id: string;
  stream_name: string;
  stream_entry_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function mapDispatchTaskRow(row: DispatchTaskRow): DispatchTask {
  return {
    dispatchTaskId: row.dispatch_task_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    skuId: row.sku_id,
    amount: Number(row.amount),
    sourceEventId: row.source_event_id,
    streamName: row.stream_name,
    streamEntryId: row.stream_entry_id,
    status: row.status as DispatchTask["status"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type InsertDispatchTaskInput = {
  dispatchTaskId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  skuId: string;
  amount: number;
  sourceEventId: string;
  streamName: string;
};

export class DispatchRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insertTask(
    connection: PoolConnection,
    input: InsertDispatchTaskInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO dispatch_tasks
        (dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
         source_event_id, stream_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        input.dispatchTaskId,
        input.cityCode,
        input.orderId,
        input.customerId,
        input.skuId,
        input.amount,
        input.sourceEventId,
        input.streamName,
      ],
    );
  }

  async updateTaskQueued(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    streamEntryId: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'queued', stream_entry_id = ?
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [streamEntryId, dispatchTaskId, cityCode],
    );
  }

  async updateTaskFailed(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks SET status = 'failed'
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [dispatchTaskId, cityCode],
    );
  }

  async findBySourceEventId(
    context: RequestContext,
    cityCode: CityCode,
    sourceEventId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
              source_event_id, stream_name, stream_entry_id, status, created_at, updated_at
       FROM dispatch_tasks
       WHERE ${where.clause} AND source_event_id = ?
       LIMIT 1`,
      [...where.params, sourceEventId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async findByOrderId(
    context: RequestContext,
    cityCode: CityCode,
    orderId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
              source_event_id, stream_name, stream_entry_id, status, created_at, updated_at
       FROM dispatch_tasks
       WHERE ${where.clause} AND order_id = ?
       LIMIT 1`,
      [...where.params, orderId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async listTasks(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
              source_event_id, stream_name, stream_entry_id, status, created_at, updated_at
       FROM dispatch_tasks
       WHERE ${where.clause}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async listQueuedTasks(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
              source_event_id, stream_name, stream_entry_id, status, created_at, updated_at
       FROM dispatch_tasks
       WHERE ${where.clause} AND status = 'queued'
       ORDER BY created_at ASC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async findByDispatchTaskId(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
              source_event_id, stream_name, stream_entry_id, status, created_at, updated_at
       FROM dispatch_tasks
       WHERE ${where.clause} AND dispatch_task_id = ?
       LIMIT 1`,
      [...where.params, dispatchTaskId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async markAccepted(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'accepted'
       WHERE dispatch_task_id = ? AND city_code = ? AND status = 'queued'`,
      [dispatchTaskId, cityCode],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }
}

export const dispatchRepository = new DispatchRepository();
