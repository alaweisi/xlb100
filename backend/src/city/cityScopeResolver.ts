import type { CityCode } from "@xlb/types";
import type { Role } from "@xlb/types";

const ADMIN_SCOPED_ROLES: Role[] = ["admin", "operator", "auditor"];

export type CityScope = {
  cityCodes: CityCode[];
  isGlobal: boolean;
};

/** Resolve admin city scope from request city_code header (Phase 1 skeleton) */
export function resolveCityScope(
  role: Role,
  cityCode: CityCode | undefined,
): CityScope {
  if (!ADMIN_SCOPED_ROLES.includes(role)) {
    return { cityCodes: cityCode ? [cityCode] : [], isGlobal: false };
  }

  if (!cityCode) {
    return { cityCodes: [], isGlobal: false };
  }

  return { cityCodes: [cityCode], isGlobal: false };
}

export function isAdminScopedRole(role: Role): boolean {
  return ADMIN_SCOPED_ROLES.includes(role);
}
