import type { FastifyInstance } from "fastify";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import {
  createPaidOrderForDispatch,
  operatorHeaders,
} from "./dispatchTestHelper.js";

export const workerHangzhouHeaders = {
  "x-xlb-app-type": "worker",
  "x-xlb-role": "worker",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "worker-demo-hangzhou",
};

export const workerShanghaiHeaders = {
  "x-xlb-app-type": "worker",
  "x-xlb-role": "worker",
  "x-xlb-city-code": "shanghai",
  "x-xlb-user-id": "worker-demo-shanghai",
};

export const workerHangzhouAltHeaders = {
  "x-xlb-app-type": "worker",
  "x-xlb-role": "worker",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "worker-demo-hangzhou-alt",
};

export async function ensureAltHangzhouWorkerBound(): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    `INSERT INTO worker_profiles (worker_id, display_name, phone_masked, status)
     VALUES ('worker-demo-hangzhou-alt', '杭州演示师傅B', '138****0099', 'active')
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
  );
  await pool.query(
    `INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled)
     VALUES ('worker-demo-hangzhou-alt', 'hangzhou', 1)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
  );
}

export async function ensureHangzhouWorkerEligible(): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    `UPDATE worker_qualifications
     SET is_eligible = 1
     WHERE worker_id = 'worker-demo-hangzhou'
       AND city_code = 'hangzhou'
       AND sku_id = 'sku_home_daily_2h'`,
  );
}

export async function createQueuedDispatchTask(
  app: FastifyInstance,
  skuId = "sku_home_daily_2h",
): Promise<string> {
  const orderId = await createPaidOrderForDispatch(app, skuId);
  const pool = getMysqlPool();

  for (let i = 0; i < 50; i++) {
    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const [rows] = await pool.query<(RowDataPacket & { dispatch_task_id: string })[]>(
      `SELECT dispatch_task_id FROM dispatch_tasks
       WHERE order_id = ? AND status = 'queued' LIMIT 1`,
      [orderId],
    );
    if (rows[0]?.dispatch_task_id) {
      return rows[0].dispatch_task_id;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Failed to create queued dispatch task for order ${orderId}`);
}
