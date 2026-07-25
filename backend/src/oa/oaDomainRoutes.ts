import type {
  FastifyInstance,
  FastifyReply,
  LightMyRequestResponse,
} from "fastify";
import type { OutgoingHttpHeaders } from "node:http";
import { XLB_HEADERS } from "@xlb/types";
import { createToken } from "../auth/tokenAuth.js";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  OaAuthorizationError,
  oaAuthorizationService,
} from "./oaAuthorizationService.js";
import { resolveOaDomainAccessRule } from "./oaDomainCapabilityRegistry.js";

function wildcard(request: { params: unknown }): string {
  const value = (request.params as { "*"?: unknown })["*"];
  return typeof value === "string" ? value : "";
}

function safeTargetPath(value: string): string | null {
  if (!value || value.includes("\\") || value.includes("\0")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.split("/").includes("..") || decoded.includes("//")) return null;
  const path = `/${value.replace(/^\/+/u, "")}`;
  return path.startsWith("/api/") && !path.startsWith("/api/oa/") ? path : null;
}

function copyResponseHeaders(reply: FastifyReply, headers: OutgoingHttpHeaders) {
  for (const name of ["content-type", "content-disposition", "retry-after"] as const) {
    const value = headers[name];
    if (value !== undefined) reply.header(name, value);
  }
}

export async function registerOaDomainRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.route({
    method: ["GET", "POST", "PATCH", "DELETE"],
    url: "/api/oa/domains/*",
    preHandler,
    handler: async (request, reply) => {
      const targetPath = safeTargetPath(wildcard(request));
      if (!targetPath) {
        return reply.status(404).send({ ok: false, error: "OA domain route is not allowed" });
      }
      const targetUrl = new URL(targetPath, "http://xlb.local");
      const rule = resolveOaDomainAccessRule(request.method, targetUrl.pathname);
      if (!rule) {
        return reply.status(403).send({
          ok: false,
          error: "OA domain action is not in the capability registry",
          reasonCode: "oa_domain_action_unregistered",
        });
      }

      const context = getRequestContext(request);
      const cityCode = context.cityCode!;
      try {
        const principal = await oaAuthorizationService.authorize(
          context,
          rule.permission,
          [cityCode],
        );
        await oaAuthorizationService.recordAudit(context, {
          organizationId: principal.organization.organizationId,
          cityCode,
          permission: rule.permission,
          action: `oa.domain.${rule.id}`,
          targetType: "oa_domain_route",
          targetId: targetUrl.pathname,
          decision: "allowed",
          reasonCode: "capability_registry_allowed",
        });

        const queryIndex = request.url.indexOf("?");
        const query = queryIndex >= 0 ? request.url.slice(queryIndex) : "";
        const injectRequest = app.inject as unknown as (
          options: Record<string, unknown>,
        ) => Promise<LightMyRequestResponse>;
        const response = await injectRequest({
          method: request.method as "GET" | "POST" | "PATCH" | "DELETE",
          url: `${targetPath}${query}`,
          headers: {
            authorization: `Bearer ${createToken(principal.userId, rule.internalRole, "admin")}`,
            [XLB_HEADERS.cityCode]: cityCode,
            [XLB_HEADERS.traceId]: context.traceId,
            accept: String(request.headers.accept ?? "application/json"),
            "content-type": String(request.headers["content-type"] ?? "application/json"),
          },
          payload: request.method === "GET" ? undefined : request.body,
        });
        copyResponseHeaders(reply, response.headers);
        return reply.status(response.statusCode).send(response.rawPayload);
      } catch (error) {
        if (error instanceof OaAuthorizationError) {
          return reply.status(error.statusCode).send({
            ok: false,
            error: error.message,
            reasonCode: error.reasonCode,
          });
        }
        throw error;
      }
    },
  });
}
