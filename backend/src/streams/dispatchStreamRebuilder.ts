import type { CityCode, DispatchTask } from "@xlb/types";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  dispatchStreamPublisher,
  type DispatchStreamPublisher,
} from "./dispatchStreamPublisher.js";

type RebuildTaskRow = RowDataPacket & {
  dispatch_task_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  sku_id: string;
  amount: string | number;
  source_event_id: string;
  stream_name: string;
  stream_entry_id: string | null;
  status: DispatchTask["status"];
  attempt_count: number;
  max_attempts: number;
  last_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export interface DispatchStreamRebuildSource {
  listActive(cityCode: CityCode, afterTaskId: string, limit: number): Promise<DispatchTask[]>;
}

export class MysqlDispatchStreamRebuildSource implements DispatchStreamRebuildSource {
  async listActive(cityCode: CityCode, afterTaskId: string, limit: number): Promise<DispatchTask[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const [rows] = await getMysqlPool().query<RebuildTaskRow[]>(
      `SELECT dispatch_task_id,city_code,order_id,customer_id,sku_id,amount,
              source_event_id,stream_name,stream_entry_id,status,attempt_count,
              max_attempts,last_reason,created_at,updated_at
       FROM dispatch_tasks
       WHERE city_code=? AND dispatch_task_id>?
         AND status IN ('queued','offering','reassigning','no_match','manual_review')
       ORDER BY dispatch_task_id ASC
       LIMIT ?`,
      [cityCode, afterTaskId, safeLimit],
    );
    return rows.map((row) => ({
      dispatchTaskId: row.dispatch_task_id,
      cityCode: row.city_code as CityCode,
      orderId: row.order_id,
      customerId: row.customer_id,
      skuId: row.sku_id,
      amount: Number(row.amount),
      sourceEventId: row.source_event_id,
      streamName: row.stream_name,
      streamEntryId: row.stream_entry_id,
      status: row.status,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastReason: row.last_reason,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }
}

export type DispatchStreamRebuildResult = {
  rebuilt: number;
  batches: number;
  lastTaskId: string;
  complete: boolean;
};

export class DispatchStreamRebuilder {
  constructor(
    private readonly source: DispatchStreamRebuildSource = new MysqlDispatchStreamRebuildSource(),
    private readonly publisher: DispatchStreamPublisher = dispatchStreamPublisher,
  ) {}

  async rebuildCity(input: {
    cityCode: CityCode;
    runId: string;
    afterTaskId?: string;
    batchSize?: number;
    maxBatches?: number;
  }): Promise<DispatchStreamRebuildResult> {
    const batchSize = Math.max(1, Math.min(500, Math.trunc(input.batchSize ?? 100)));
    const maxBatches = Math.max(1, Math.min(10_000, Math.trunc(input.maxBatches ?? 100)));
    let lastTaskId = input.afterTaskId ?? "";
    let rebuilt = 0;
    let batches = 0;
    for (; batches < maxBatches; batches += 1) {
      const tasks = await this.source.listActive(input.cityCode, lastTaskId, batchSize);
      for (const task of tasks) {
        await this.publisher.publishRebuilt(task, input.runId);
        lastTaskId = task.dispatchTaskId;
        rebuilt += 1;
      }
      if (tasks.length < batchSize) {
        return { rebuilt, batches: batches + 1, lastTaskId, complete: true };
      }
    }
    return { rebuilt, batches, lastTaskId, complete: false };
  }
}

export const dispatchStreamRebuilder = new DispatchStreamRebuilder();
