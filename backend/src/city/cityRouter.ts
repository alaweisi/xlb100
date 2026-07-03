import type { RequestContext } from "@xlb/types";
import { requireCityCode } from "./cityResolver.js";

export type CityRouteDecision =
  | { allowed: true; cityCode: string }
  | { allowed: false; statusCode: 400; message: string };

/** Route guard: city_code must be present and valid for city-scoped routes */
export function cityRouter(context: RequestContext): CityRouteDecision {
  const result = requireCityCode(context.cityCode);
  if (!result.ok) {
    return { allowed: false, statusCode: 400, message: result.message };
  }
  return { allowed: true, cityCode: result.cityCode };
}

export function isCityScopedRoute(path: string): boolean {
  return path.startsWith("/api/debug/") || path.startsWith("/api/admin/");
}
