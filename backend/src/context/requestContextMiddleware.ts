import type { FastifyReply, FastifyRequest } from "fastify";
import type { RequestContext } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { buildRequestContext } from "./requestContext.js";

declare module "fastify" {
  interface FastifyRequest {
    xlbContext?: RequestContext;
  }
}

export type RequestContextMiddlewareOptions = {
  requireCityCode?: boolean;
  requireAuth?: boolean;
};

export function createRequestContextMiddleware(
  options: RequestContextMiddlewareOptions = {},
) {
  const { requireCityCode = false, requireAuth = true } = options;

  return async function requestContextMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const result = buildRequestContext({
      headers: request.headers,
      requireCityCode,
      requireAuth,
    });

    if (!result.ok) {
      return reply.status(result.statusCode).send({
        ok: false,
        error: result.message,
        details: result.details,
      });
    }

    request.xlbContext = result.context;
    reply.header(XLB_HEADERS.traceId, result.context.traceId);
  };
}

export function getRequestContext(request: FastifyRequest): RequestContext {
  if (!request.xlbContext) {
    throw new Error("RequestContext not initialized on request");
  }
  return request.xlbContext;
}
