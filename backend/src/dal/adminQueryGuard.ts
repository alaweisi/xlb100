import type { RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import type { CityScope } from "../city/cityScopeResolver.js";
import { getMysqlPool } from "./mysqlPool.js";

export type AdminQueryGuardResult =
  | { ok: true }
  | { ok: false; statusCode: 403; message: string };

/** Explicit global admin marker in admin_city_scopes */
export const GLOBAL_ADMIN_CITY_MARKER = "__global__";

export class AdminScopeError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "AdminScopeError";
  }
}

/** Phase 1 sync guard — header-derived scope */
export function adminQueryGuard(
  scope: CityScope,
  requestedCityCode: CityCode | undefined,
): AdminQueryGuardResult {
  if (scope.isGlobal) {
    if (!requestedCityCode) {
      return {
        ok: false,
        statusCode: 403,
        message: "Global admin must explicitly specify city_code filter",
      };
    }
    return { ok: true };
  }

  if (scope.cityCodes.length === 0) {
    return {
      ok: false,
      statusCode: 403,
      message: "Admin scope missing: city_code required",
    };
  }

  if (!requestedCityCode) {
    return {
      ok: false,
      statusCode: 403,
      message: "Admin query must include city_code filter",
    };
  }

  if (!scope.cityCodes.includes(requestedCityCode)) {
    return {
      ok: false,
      statusCode: 403,
      message: "Admin scope leak: city_code outside allowed scope",
    };
  }

  return { ok: true };
}

export function forbidUnscopedAdminQuery(): never {
  throw new AdminScopeError("Unscoped admin query forbidden");
}

export async function fetchAdminCityScopes(
  adminUserId: string,
): Promise<CityCode[]> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT city_code FROM admin_city_scopes WHERE admin_user_id = ? ORDER BY city_code",
    [adminUserId],
  );
  return rows.map((row) => String(row.city_code));
}

export function isGlobalAdminScope(scopes: CityCode[]): boolean {
  return scopes.includes(GLOBAL_ADMIN_CITY_MARKER);
}

export async function assertAdminCityScope(
  adminUserId: string,
  cityCode: CityCode,
): Promise<void> {
  const scopes = await fetchAdminCityScopes(adminUserId);
  if (scopes.length === 0) {
    throw new AdminScopeError("Admin has no city_scope assigned");
  }
  if (isGlobalAdminScope(scopes)) {
    return;
  }
  if (!scopes.includes(cityCode)) {
    throw new AdminScopeError(
      "Admin scope leak: city_code outside allowed scope",
    );
  }
}

export async function assertAdminCanAccessCity(
  context: RequestContext,
  cityCode: CityCode,
): Promise<void> {
  if (!context.userId) {
    throw new AdminScopeError("Admin userId required for scope check");
  }
  await assertAdminCityScope(context.userId, cityCode);
}
