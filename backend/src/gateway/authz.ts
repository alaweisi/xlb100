import type { RequestContext } from "@xlb/types";
import { assertAppTypeRole } from "./appTypeGuard.js";
import { resolveCityScope, isAdminScopedRole } from "../city/cityScopeResolver.js";
import { adminQueryGuard } from "../dal/adminQueryGuard.js";

export type AuthzResult =
  | { ok: true; context: RequestContext }
  | { ok: false; statusCode: 401 | 403; message: string };

/** Authorization guard after RequestContext has been built from a verified token. */
export function authorizeRequest(context: RequestContext): AuthzResult {
  const appGuard = assertAppTypeRole(context.appType, context.role);
  if (!appGuard.ok) {
    return { ok: false, statusCode: appGuard.statusCode, message: appGuard.message };
  }

  if (isAdminScopedRole(context.role)) {
    const scope = resolveCityScope(context.role, context.cityCode);
    const guard = adminQueryGuard(scope, context.cityCode);
    if (!guard.ok) {
      return { ok: false, statusCode: guard.statusCode, message: guard.message };
    }
  }

  return { ok: true, context };
}
