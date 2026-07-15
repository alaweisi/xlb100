import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";

type AdvisoryLockRow = RowDataPacket & {
  acquired: number | null;
};

type AdvisoryUnlockRow = RowDataPacket & {
  released: number | null;
};

export type AdvisoryLockResult<T> =
  | { status: "acquired"; value: T }
  | { status: "busy" };

export type MysqlAdvisoryLockOptions = {
  pool?: Pool;
  timeoutSeconds?: number;
};

/**
 * MySQL named locks accept at most 64 characters. Hashing the caller-provided
 * scope also keeps tenant and job identifiers out of the server lock table.
 */
export function buildJobLockKey(scope: string): string {
  const normalized = scope.trim();
  if (!normalized) throw new Error("job lock scope must not be empty");
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `xlb:job:${digest.slice(0, 56)}`;
}

export async function withMysqlAdvisoryLock<T>(
  scope: string,
  operation: () => Promise<T>,
  options: MysqlAdvisoryLockOptions = {},
): Promise<AdvisoryLockResult<T>> {
  const pool = options.pool ?? getMysqlPool();
  const timeoutSeconds = Math.max(0, Math.min(30, Math.trunc(options.timeoutSeconds ?? 0)));
  const key = buildJobLockKey(scope);
  const connection = await pool.getConnection();
  let acquired = false;
  let result: AdvisoryLockResult<T> | undefined;
  let operationFailed = false;
  let operationError: unknown;

  try {
    const [rows] = await connection.query<AdvisoryLockRow[]>(
      "SELECT GET_LOCK(?, ?) AS acquired",
      [key, timeoutSeconds],
    );
    acquired = rows[0]?.acquired === 1;
    if (!acquired) {
      result = { status: "busy" };
    } else {
      result = { status: "acquired", value: await operation() };
    }
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let releaseFailed = false;
  let releaseError: unknown;
  try {
    if (acquired) {
      const [rows] = await connection.query<AdvisoryUnlockRow[]>(
        "SELECT RELEASE_LOCK(?) AS released",
        [key],
      );
      if (rows[0]?.released !== 1) {
        throw new Error("job advisory lock could not be released");
      }
    }
  } catch (error) {
    releaseFailed = true;
    releaseError = error;
  } finally {
    // A session with an uncertain named-lock state must not return to the pool.
    if (releaseFailed) connection.destroy();
    else connection.release();
  }

  // Preserve the operation error when both the operation and cleanup fail.
  if (operationFailed) throw operationError;
  if (releaseFailed) throw releaseError;
  if (!result) throw new Error("job advisory lock completed without a result");
  return result;
}
