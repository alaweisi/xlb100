import type { RequestContext } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import {
  requestContextHeadersSchema,
  requestContextSchema,
} from "@xlb/validators";
import { resolveCityCode } from "../city/cityResolver.js";
import { resolveTraceId } from "./traceId.js";

export type BuildContextOptions = {
  headers: Record<string, string | string[] | undefined>;
  requireCityCode?: boolean;
};

export type BuildContextResult =
  | { ok: true; context: RequestContext }
  | { ok: false; statusCode: 400 | 401; message: string; details?: unknown };

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function buildRequestContext(
  options: BuildContextOptions,
): BuildContextResult {
  const { headers, requireCityCode = false } = options;

  const appType = readHeader(headers, XLB_HEADERS.appType);
  const role = readHeader(headers, XLB_HEADERS.role);
  const cityCodeRaw = readHeader(headers, XLB_HEADERS.cityCode);

  if (!appType || !role) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missing required headers: x-xlb-app-type and x-xlb-role",
    };
  }

  if (requireCityCode && !cityCodeRaw) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missing required header: x-xlb-city-code",
    };
  }

  const headerParse = requestContextHeadersSchema.safeParse({
    [XLB_HEADERS.traceId]: readHeader(headers, XLB_HEADERS.traceId),
    [XLB_HEADERS.appType]: appType,
    [XLB_HEADERS.role]: role,
    [XLB_HEADERS.cityCode]: cityCodeRaw,
    [XLB_HEADERS.userId]: readHeader(headers, XLB_HEADERS.userId),
  });

  if (!headerParse.success) {
    return {
      ok: false,
      statusCode: 400,
      message: "Invalid request context headers",
      details: headerParse.error.flatten(),
    };
  }

  let cityCode: string | undefined;
  if (cityCodeRaw) {
    const cityResult = resolveCityCode(cityCodeRaw);
    if (!cityResult.ok) {
      return {
        ok: false,
        statusCode: 400,
        message: cityResult.message,
      };
    }
    cityCode = cityResult.cityCode;
  }

  const traceId = resolveTraceId(headers);
  const userId = readHeader(headers, XLB_HEADERS.userId);

  const context: RequestContext = {
    traceId,
    appType: headerParse.data["x-xlb-app-type"],
    role: headerParse.data["x-xlb-role"],
    cityCode,
    userId,
    requestStartedAt: new Date().toISOString(),
    requestId: traceId,
    correlationId: traceId,
  };

  const validated = requestContextSchema.safeParse(context);
  if (!validated.success) {
    return {
      ok: false,
      statusCode: 400,
      message: "Invalid request context",
      details: validated.error.flatten(),
    };
  }

  return { ok: true, context: validated.data };
}
