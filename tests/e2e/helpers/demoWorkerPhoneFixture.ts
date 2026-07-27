import type { RowDataPacket } from "mysql2/promise";
import { hashPhoneIdentity, maskPhone } from "../../../backend/src/auth/phoneIdentity.js";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";

type WorkerPhoneSnapshot = {
  phone_hash: string | null;
  phone_masked: string | null;
  updated_at: Date;
};

export async function temporarilyEnrollDemoWorkerPhone(
  phone = "13800000001",
  workerId = "worker-demo-hangzhou",
): Promise<() => Promise<void>> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<(RowDataPacket & WorkerPhoneSnapshot)[]>(
    "SELECT phone_hash, phone_masked, updated_at FROM worker_profiles WHERE worker_id = ?",
    [workerId],
  );
  const snapshot = rows[0];
  if (!snapshot) throw new Error(`${workerId} fixture is missing`);

  await pool.query(
    "UPDATE worker_profiles SET phone_hash = ?, phone_masked = ? WHERE worker_id = ?",
    [hashPhoneIdentity(phone), maskPhone(phone), workerId],
  );

  let restored = false;
  return async () => {
    if (restored) return;
    await pool.query(
      "UPDATE worker_profiles SET phone_hash = ?, phone_masked = ?, updated_at = ? WHERE worker_id = ?",
      [snapshot.phone_hash, snapshot.phone_masked, snapshot.updated_at, workerId],
    );
    restored = true;
  };
}
