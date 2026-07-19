import type { RequestContext, Role } from "@xlb/types";

const DEFAULT_ADMIN_ROLES: readonly Role[] = ["admin", "operator", "auditor"];

/**
 * OA is a separate headquarters surface. Its token is accepted only when it is
 * bound to the admin role; city access is still checked independently.
 */
export function isOaHeadquartersContext(context: RequestContext): boolean {
  return context.appType === "oa" && context.role === "admin";
}

/**
 * Preserve each Admin workflow's existing role allowlist while granting the
 * explicitly authenticated OA headquarters principal the superset capability.
 */
export function canAccessAdminOperation(
  context: RequestContext,
  adminRoles: readonly Role[] = DEFAULT_ADMIN_ROLES,
): boolean {
  return isOaHeadquartersContext(context)
    || (context.appType === "admin" && adminRoles.includes(context.role));
}
