import type { CityCode } from "@xlb/types";
import type { CityScope } from "../city/cityScopeResolver.js";

export type AdminQueryGuardResult =
  | { ok: true }
  | { ok: false; statusCode: 403; message: string };

/** Ensure admin queries include a valid city scope (Phase 1 skeleton) */
export function adminQueryGuard(
  scope: CityScope,
  requestedCityCode: CityCode | undefined,
): AdminQueryGuardResult {
  if (scope.isGlobal) {
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
