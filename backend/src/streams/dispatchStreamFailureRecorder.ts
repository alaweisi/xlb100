import type { DispatchStreamMessage } from "@xlb/types";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";

export type DispatchStreamFinalFailure = {
  entryId: string;
  groupName: string;
  attempts: number;
  message: DispatchStreamMessage;
  error: unknown;
};

export interface DispatchStreamFailureRecorder {
  /** Returns true only when the terminal failure is durable in MySQL. */
  recordFinalFailure(input: DispatchStreamFinalFailure): Promise<boolean>;
}

function safeFailureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : "dispatch stream consumer failed";
  return raw.replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

export class MysqlDispatchStreamFailureRecorder implements DispatchStreamFailureRecorder {
  constructor(private readonly poolProvider: () => Pick<Pool, "query"> = getMysqlPool) {}

  async recordFinalFailure(input: DispatchStreamFinalFailure): Promise<boolean> {
    const reason = `redis_consumer_exhausted:${safeFailureReason(input.error)}`;
    const [result] = await this.poolProvider().query<ResultSetHeader>(
      `UPDATE dispatch_tasks
       SET status='failed', attempt_count=attempt_count+1, last_reason=?
       WHERE city_code=? AND dispatch_task_id=?
         AND status IN ('pending','queued','offering','reassigning','no_match','manual_review','failed')`,
      [reason, input.message.cityCode, input.message.dispatchTaskId],
    );
    return result.affectedRows === 1;
  }
}

export const dispatchStreamFailureRecorder = new MysqlDispatchStreamFailureRecorder();
