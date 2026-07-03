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

export class ScopedExecutorError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ScopedExecutorError";
  }
}

export type CityScopedWhere = {
  clause: string;
  params: [CityCode];
};

/** Assert RequestContext carries a valid city_code for scoped data access */
export function assertCityScopedContext(context: RequestContext): CityCode {
  if (!context.cityCode) {
    throw new ScopedExecutorError("city_code is required in RequestContext");
  }
  const cityResult = requireCityCode(context.cityCode);
  if (!cityResult.ok) {
    throw new ScopedExecutorError(cityResult.message);
  }
  return cityResult.cityCode;
}

export function buildCityScopedWhere(
  cityCode: CityCode,
  column = "city_code",
): CityScopedWhere {
  return {
    clause: `${column} = ?`,
    params: [cityCode],
  };
}

export async function executeCityScoped<T>(
  context: RequestContext,
  fn: (cityCode: CityCode) => Promise<T>,
): Promise<T> {
  const cityCode = assertCityScopedContext(context);
  return fn(cityCode);
}

/** Phase 1 compatible result-style executor */
export function scopedExecutor<T>(
  context: RequestContext,
  payload: T,
): ScopedExecutorResult<T> {
  try {
    const cityCode = assertCityScopedContext(context);
    return { ok: true, value: { cityCode, payload } };
  } catch (error) {
    const message =
      error instanceof ScopedExecutorError
        ? error.message
        : "city_code scope validation failed";
    return { ok: false, statusCode: 400, message };
  }
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
