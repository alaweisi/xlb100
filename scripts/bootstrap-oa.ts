import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { OA_PERMISSION_KEYS } from "../packages/types/src/oa.js";

const CONFIRMATION = "BOOTSTRAP_XLB_OA";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function secretValue(valueName: string, fileName: string): string {
  const direct = process.env[valueName]?.trim();
  if (direct) return direct;
  const path = process.env[fileName]?.trim();
  if (!path) throw new Error(`${valueName} or ${fileName} is required`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) throw new Error(`${fileName} is empty`);
  return value;
}

function identifier(name: string, value: string): string {
  if (!/^[A-Za-z0-9_-]{3,64}$/u.test(value)) {
    throw new Error(`${name} must contain 3-64 letters, digits, underscores, or hyphens`);
  }
  return value;
}

function cityCodes(): string[] {
  const values = [...new Set(required("OA_BOOTSTRAP_CITY_CODES")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
  if (values.length === 0 || values.some((value) => !/^[a-z][a-z0-9_-]{1,63}$/u.test(value))) {
    throw new Error("OA_BOOTSTRAP_CITY_CODES must be a comma-separated list of real city codes");
  }
  if (values.includes("__global__")) throw new Error("OA bootstrap refuses the synthetic global city marker");
  return values;
}

async function main() {
  if (process.env.OA_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set OA_BOOTSTRAP_CONFIRM=${CONFIRMATION} for this explicit one-time action`);
  }
  const organizationId = identifier("OA_BOOTSTRAP_ORGANIZATION_ID", required("OA_BOOTSTRAP_ORGANIZATION_ID"));
  const organizationCode = identifier("OA_BOOTSTRAP_ORGANIZATION_CODE", required("OA_BOOTSTRAP_ORGANIZATION_CODE"));
  const organizationName = required("OA_BOOTSTRAP_ORGANIZATION_NAME").slice(0, 128);
  const adminUserId = identifier("OA_BOOTSTRAP_ADMIN_USER_ID", required("OA_BOOTSTRAP_ADMIN_USER_ID"));
  const reason = required("OA_BOOTSTRAP_REASON").slice(0, 96);
  const cities = cityCodes();
  const membershipId = `oa-member-${createHash("sha256").update(`${organizationId}:${adminUserId}`).digest("hex").slice(0, 24)}`;
  const roleId = `oa-role-${createHash("sha256").update(`${organizationId}:bootstrap-admin`).digest("hex").slice(0, 24)}`;

  const port = Number(required("MYSQL_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("MYSQL_PORT is invalid");
  const connection = await mysql.createConnection({
    host: required("MYSQL_HOST"),
    port,
    database: required("MYSQL_DATABASE"),
    user: required("MYSQL_USER"),
    password: secretValue("MYSQL_PASSWORD", "MYSQL_PASSWORD_FILE"),
    ssl: process.env.MYSQL_TLS_ENABLED === "true"
      ? {
          ca: secretValue("MYSQL_TLS_CA", "MYSQL_TLS_CA_FILE").replace(/\\n/gu, "\n"),
          rejectUnauthorized: true,
        }
      : undefined,
  });

  try {
    await connection.beginTransaction();
    const [migrationRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT version FROM schema_migrations
       WHERE version IN ('063_oa_collaboration_foundation', '064_oa_notifications')`,
    );
    if (migrationRows.length !== 2) throw new Error("OA migrations 063 and 064 must be applied first");

    const [adminRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id FROM admin_users WHERE id = ? LIMIT 1 FOR UPDATE",
      [adminUserId],
    );
    if (adminRows.length !== 1) throw new Error("OA_BOOTSTRAP_ADMIN_USER_ID does not exist in admin_users");

    const [existingHeadquarters] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT organization_id, organization_code FROM oa_organizations WHERE organization_type = 'headquarters' FOR UPDATE",
    );
    const conflict = existingHeadquarters.find(
      (row) => row.organization_id !== organizationId || row.organization_code !== organizationCode,
    );
    if (conflict) throw new Error("A different OA headquarters already exists; bootstrap is single-root");

    const placeholders = cities.map(() => "?").join(", ");
    const [cityRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT city_code FROM cities WHERE city_code IN (${placeholders}) AND is_open = 1`,
      cities,
    );
    if (cityRows.length !== cities.length) throw new Error("Every bootstrap city must exist and be open");

    await connection.query(
      `INSERT INTO oa_organizations (
         organization_id, organization_code, name, organization_type, status
       ) VALUES (?, ?, ?, 'headquarters', 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
      [organizationId, organizationCode, organizationName],
    );
    await connection.query(
      `INSERT INTO oa_organization_closure (
         ancestor_organization_id, descendant_organization_id, depth
       ) VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE depth = VALUES(depth)`,
      [organizationId, organizationId],
    );
    for (const cityCode of cities) {
      await connection.query(
        `INSERT INTO oa_organization_city_assignments (
           organization_id, city_code, status
         ) VALUES (?, ?, 'active')
         ON DUPLICATE KEY UPDATE status = 'active', valid_to = NULL`,
        [organizationId, cityCode],
      );
      await connection.query(
        `INSERT INTO admin_city_scopes (admin_user_id, city_code)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE city_code = VALUES(city_code)`,
        [adminUserId, cityCode],
      );
    }
    for (const permission of OA_PERMISSION_KEYS) {
      const highRisk = permission.includes("decide") || permission.includes("review");
      await connection.query(
        `INSERT INTO oa_permissions (permission_key, description, risk_level)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description), risk_level = VALUES(risk_level)`,
        [
          permission,
          `XLB OA permission: ${permission}`,
          permission.endsWith(".read") ? "read" : highRisk ? "high" : "normal",
        ],
      );
    }
    await connection.query(
      `INSERT INTO oa_memberships (
         membership_id, admin_user_id, organization_id, status, authz_version
       ) VALUES (?, ?, ?, 'active', 1)
       ON DUPLICATE KEY UPDATE status = 'active', valid_to = NULL,
         authz_version = GREATEST(authz_version, 1)`,
      [membershipId, adminUserId, organizationId],
    );
    await connection.query(
      `INSERT INTO oa_roles (role_id, organization_id, role_key, name, status)
       VALUES (?, ?, 'bootstrap_super_admin', 'OA 初始超级管理员', 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'active'`,
      [roleId, organizationId],
    );
    for (const permission of OA_PERMISSION_KEYS) {
      await connection.query(
        "INSERT IGNORE INTO oa_role_permissions (role_id, permission_key) VALUES (?, ?)",
        [roleId, permission],
      );
    }
    await connection.query(
      `INSERT INTO oa_membership_roles (
         membership_id, role_id, granted_by_membership_id
       ) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE granted_by_membership_id = VALUES(granted_by_membership_id), valid_to = NULL`,
      [membershipId, roleId, membershipId],
    );
    await connection.query(
      `INSERT INTO oa_audit_records (
         audit_id, actor_user_id, actor_membership_id, organization_id, city_code,
         permission_key, action, target_type, target_id, decision, reason_code, trace_id
       ) VALUES (?, ?, ?, ?, NULL, 'oa.authorization.manage', 'oa.bootstrap',
                 'oa_organization', ?, 'allowed', ?, ?)`,
      [randomUUID(), adminUserId, membershipId, organizationId, organizationId, reason, randomUUID()],
    );
    await connection.commit();
    process.stdout.write(`${JSON.stringify({
      ok: true,
      organizationId,
      membershipId,
      roleId,
      cityCodes: cities,
    }, null, 2)}\n`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "OA bootstrap failed"}\n`);
  process.exitCode = 1;
});
