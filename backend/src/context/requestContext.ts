import type { RequestContext } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { requestContextSchema } from "@xlb/validators";
import type { TokenPayload } from "../auth/tokenAuth.js";
import { extractBearerToken, verifyToken } from "../auth/tokenAuth.js";
import { resolveCityCode } from "../city/cityResolver.js";
import { resolveTraceId } from "./traceId.js";

export type BuildContextOptions = {
  headers: Record<string, string | string[] | undefined>;
  requireCityCode?: boolean;
  requireAuth?: boolean;
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

function resolveTokenPayload(
  headers: Record<string, string | string[] | undefined>,
  requireAuth: boolean,
): { ok: true; payload: TokenPayload } | { ok: false; statusCode: 401; message: string } {
  const bearer = extractBearerToken(headers);
  if (!bearer.ok) {
    return requireAuth
      ? { ok: false, statusCode: 401, message: bearer.error }
      : { ok: false, statusCode: 401, message: "authorization bearer token required" };
  }

  const verified = verifyToken(bearer.token);
  if (!verified.ok) {
    return { ok: false, statusCode: 401, message: verified.error };
  }

  return { ok: true, payload: verified.payload };
}

export function buildRequestContext(
  options: BuildContextOptions,
): BuildContextResult {
  const { headers, requireCityCode = false, requireAuth = true } = options;

  const token = resolveTokenPayload(headers, requireAuth);
  if (!token.ok) {
    return {
      ok: false,
      statusCode: token.statusCode,
      message: token.message,
    };
  }

  const cityCodeRaw = readHeader(headers, XLB_HEADERS.cityCode);
  if (requireCityCode && !cityCodeRaw) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missing required header: x-xlb-city-code",
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
  const context: RequestContext = {
    traceId,
    appType: token.payload.appType as RequestContext["appType"],
    role: token.payload.role as RequestContext["role"],
    cityCode,
    userId: token.payload.sub,
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
