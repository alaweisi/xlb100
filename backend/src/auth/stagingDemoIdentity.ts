import { createHmac } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { loadEnv } from "@xlb/config";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import type { TokenPayload } from "./tokenAuth.js";

function workerPhoneHash(phone: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`xlb:worker-phone:v1:${phone}`, "utf8")
    .digest("hex");
}

export async function workerHasExactDemoCity(
  workerId: string,
  cityCode: string,
): Promise<boolean> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & {
    matching_scopes: number;
    other_scopes: number;
  })[]>(
    `SELECT
       SUM(CASE WHEN city_code = ? AND is_enabled = 1 THEN 1 ELSE 0 END) AS matching_scopes,
       SUM(CASE WHEN city_code <> ? AND is_enabled = 1 THEN 1 ELSE 0 END) AS other_scopes
     FROM worker_city_bindings
     WHERE worker_id = ?`,
    [cityCode, cityCode, workerId],
  );
  return Number(rows[0]?.matching_scopes ?? 0) === 1
    && Number(rows[0]?.other_scopes ?? 0) === 0;
}

export async function adminHasExactDemoCity(
  admin: { id: string; role: string },
  cityCode: string,
): Promise<boolean> {
  if (admin.role !== "operator") return false;
  const [rows] = await getMysqlPool().query<(RowDataPacket & {
    matching_scopes: number;
    other_scopes: number;
  })[]>(
    `SELECT
       SUM(CASE WHEN city_code = ? THEN 1 ELSE 0 END) AS matching_scopes,
       SUM(CASE WHEN city_code <> ? THEN 1 ELSE 0 END) AS other_scopes
     FROM admin_city_scopes
     WHERE admin_user_id = ?`,
    [cityCode, cityCode, admin.id],
  );
  return Number(rows[0]?.matching_scopes ?? 0) === 1
    && Number(rows[0]?.other_scopes ?? 0) === 0;
}

export async function stagingDemoIdentityIsActive(
  payload: Pick<TokenPayload, "sub" | "role" | "appType" | "demo" | "city">,
): Promise<boolean> {
  if (payload.demo !== "investor" || !payload.sub || !payload.city) {
    return false;
  }
  const env = loadEnv();
  if (env.nodeEnv !== "staging" || payload.city !== env.stagingDemoCityCode) {
    return false;
  }

  if (payload.appType === "customer") {
    if (
      !env.stagingDemoCustomerAuthEnabled
      || payload.sub !== INVESTOR_DEMO_IDENTITIES.customer.id
      || payload.role !== "customer"
    ) {
      return false;
    }
    const [rows] = await getMysqlPool().query<(RowDataPacket & { row_count: number })[]>(
      `SELECT COUNT(*) AS row_count
       FROM customers
       WHERE id=? AND phone=? AND default_city_code=?`,
      [payload.sub, env.stagingDemoCustomerPhone, payload.city],
    );
    return Number(rows[0]?.row_count ?? 0) === 1;
  }

  if (payload.appType === "worker") {
    if (
      !env.stagingInvestorDemoAuthEnabled
      || payload.sub !== env.stagingDemoWorkerId
      || payload.role !== "worker"
    ) {
      return false;
    }
    const [rows] = await getMysqlPool().query<(RowDataPacket & { row_count: number })[]>(
      `SELECT COUNT(*) AS row_count
       FROM worker_profiles
       WHERE worker_id=? AND status='active' AND phone_hash=?`,
      [
        payload.sub,
        workerPhoneHash(env.stagingDemoWorkerPhone, env.authPhoneHashSecret),
      ],
    );
    return Number(rows[0]?.row_count ?? 0) === 1
      && await workerHasExactDemoCity(payload.sub, payload.city);
  }

  if (payload.appType === "admin") {
    if (
      !env.stagingInvestorDemoAuthEnabled
      || payload.sub !== env.stagingDemoAdminUserId
      || payload.role !== "operator"
    ) {
      return false;
    }
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      id: string;
      role: string;
    })[]>(
      `SELECT id, role
       FROM admin_users
       WHERE id=? AND username=?
       LIMIT 1`,
      [payload.sub, env.stagingDemoAdminUsername],
    );
    const admin = rows[0];
    return Boolean(admin)
      && await adminHasExactDemoCity(
        { id: admin!.id, role: admin!.role },
        payload.city,
      );
  }

  return false;
}
