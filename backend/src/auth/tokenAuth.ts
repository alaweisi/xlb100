import type { FastifyRequest, FastifyReply } from "fastify";
import { getRequestContext } from "../context/requestContextMiddleware.js";
import { verifyToken } from "./authService.js";

/**
 * Fastify preHandler that attempts JWT token authentication.
 *
 * Token-first, header fallback:
 * - If Authorization: Bearer <token> is present → verify JWT → overwrite context.userId/role/appType
 * - If no Authorization header → skip silently (existing header-based auth continues)
 * - If token is present but invalid → return 401
 */
export async function tryTokenAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) return; // no token, fallback to header auth

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    await reply.status(401).send({ ok: false, error: "invalid authorization header format" });
    return;
  }

  const token = match[1];
  const result = verifyToken(token);
  if (!result.ok) {
    await reply.status(401).send({ ok: false, error: result.error });
    return;
  }

  // Overwrite context with verified token identity
  const ctx = getRequestContext(request);
  ctx.userId = result.payload.sub;
  ctx.role = result.payload.role as typeof ctx.role;
  ctx.appType = result.payload.appType as typeof ctx.appType;
}
