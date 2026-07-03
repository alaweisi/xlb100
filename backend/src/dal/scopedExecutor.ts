import type { CityCode } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { requireCityCode } from "../city/cityResolver.js";

export type ScopedQuery<T> = {
  cityCode: CityCode;
  payload: T;
};

export type ScopedExecutorResult<T> =
  | { ok: true; value: ScopedQuery<T> }
  | { ok: false; statusCode: 400; message: string };

/** Phase 1 skeleton — enforce city_code on all scoped data access */
export function scopedExecutor<T>(
  context: RequestContext,
  payload: T,
): ScopedExecutorResult<T> {
  const cityResult = requireCityCode(context.cityCode);
  if (!cityResult.ok) {
    return { ok: false, statusCode: 400, message: cityResult.message };
  }

  return {
    ok: true,
    value: {
      cityCode: cityResult.cityCode,
      payload,
    },
  };
}

export function assertCityCodeFilter(
  context: RequestContext,
  filterCityCode?: CityCode,
): ScopedExecutorResult<void> {
  const scoped = scopedExecutor(context, undefined);
  if (!scoped.ok) {
    return scoped;
  }

  if (filterCityCode && filterCityCode !== scoped.value.cityCode) {
    return {
      ok: false,
      statusCode: 400,
      message: "city_code filter mismatch with request context",
    };
  }

  return { ok: true, value: scoped.value };
}
