import type { AppType, Role } from "@xlb/types";

const APP_ROLE_MATRIX: Record<AppType, readonly Role[]> = {
  customer: ["customer"],
  worker: ["worker"],
  admin: ["admin", "operator", "auditor"],
  oa: ["admin"],
  dashboard: ["admin", "operator", "auditor"],
};

export type AppTypeGuardResult =
  | { ok: true }
  | { ok: false; statusCode: 401; message: string };

export function assertAppTypeRole(
  appType: AppType,
  role: Role,
): AppTypeGuardResult {
  const allowed = APP_ROLE_MATRIX[appType];
  if (!allowed.includes(role)) {
    return {
      ok: false,
      statusCode: 401,
      message: `Role '${role}' is not allowed for appType '${appType}'`,
    };
  }
  return { ok: true };
}

export function getAllowedRoles(appType: AppType): readonly Role[] {
  return APP_ROLE_MATRIX[appType];
}
