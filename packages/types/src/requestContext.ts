import type { AppType } from "./app.js";
import type { CityCode } from "./city.js";
import type { Role } from "./rbac.js";
import type { OaBackofficeContext } from "./oa.js";

export interface RequestContext {
  traceId: string;
  appType: AppType;
  role: Role;
  cityCode?: CityCode;
  userId?: string;
  demo?: "investor";
  requestStartedAt: string;
  requestId?: string;
  correlationId?: string;
  backoffice?: OaBackofficeContext;
}
