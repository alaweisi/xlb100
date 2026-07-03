import type { AppType } from "./app.js";
import type { CityCode } from "./city.js";
import type { Role } from "./rbac.js";

export interface RequestContext {
  traceId: string;
  appType: AppType;
  role: Role;
  cityCode?: CityCode;
  userId?: string;
  requestStartedAt: string;
  requestId?: string;
  correlationId?: string;
}
