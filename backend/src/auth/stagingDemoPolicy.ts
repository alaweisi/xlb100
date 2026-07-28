import type { FastifyReply, FastifyRequest } from "fastify";
import type { TokenPayload } from "./tokenAuth.js";
import { extractBearerToken, verifyToken } from "./tokenAuth.js";
import { stagingDemoIdentityIsActive } from "./stagingDemoIdentity.js";

export type StagingDemoPolicyDecision =
  | { allowed: true }
  | { allowed: false; statusCode: 403; error: string };

const ADMIN_DEMO_GET_ROUTES: readonly RegExp[] = [
  /^\/api\/system\/status$/u,
  /^\/api\/city-config\/current$/u,
  /^\/api\/catalog$/u,
  /^\/api\/pricing\/quote$/u,
  /^\/api\/internal\/operations\/orders$/u,
  /^\/api\/internal\/operations\/skus$/u,
  /^\/api\/internal\/dispatch\/board$/u,
  /^\/api\/dispatch\/tasks$/u,
  /^\/api\/internal\/admin\/order-traces\/[A-Za-z0-9._:-]{1,128}$/u,
];

const ADMIN_DEMO_POST_ROUTES = new Set([
  "/api/internal/dispatch/run-once",
  "/api/internal/dispatch/match-once",
  "/api/internal/dispatch/retry-once",
]);

export function stagingDemoRequestPolicy(
  payload: Pick<TokenPayload, "demo" | "appType">,
  method: string,
  path: string,
): StagingDemoPolicyDecision {
  if (payload.demo !== "investor" || payload.appType !== "admin") {
    return { allowed: true };
  }
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "OPTIONS" || normalizedMethod === "HEAD") {
    return { allowed: true };
  }
  if (
    normalizedMethod === "GET"
    && ADMIN_DEMO_GET_ROUTES.some((pattern) => pattern.test(path))
  ) {
    return { allowed: true };
  }
  if (normalizedMethod === "POST" && ADMIN_DEMO_POST_ROUTES.has(path)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    statusCode: 403,
    error: "staging demo administrator is not permitted to perform this operation",
  };
}

export async function stagingDemoRequestGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const bearer = extractBearerToken(request.headers);
  if (!bearer.ok) return;
  const verified = verifyToken(bearer.token);
  if (!verified.ok || verified.payload.demo !== "investor") return;
  if (!await stagingDemoIdentityIsActive(verified.payload)) {
    return reply.status(401).send({
      ok: false,
      error: "staging demo identity authorization has been revoked",
    });
  }

  const path = request.url.split("?", 1)[0] ?? request.url;
  const decision = stagingDemoRequestPolicy(
    verified.payload,
    request.method,
    path,
  );
  if (decision.allowed) return;
  return reply.status(decision.statusCode).send({
    ok: false,
    error: decision.error,
  });
}
