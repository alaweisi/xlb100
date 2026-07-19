import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@xlb/config";
import { hashAuthAuditIdentity, maskPhone } from "./phoneIdentity.js";
import { extractBearerToken, verifyToken } from "./tokenAuth.js";
import { revokeToken } from "./tokenRevocation.js";
import {
  adminLogin,
  customerLogin,
  debugAdminLoginCode,
  debugCustomerLoginCode,
  debugWorkerLoginCode,
  requestAdminLoginCode,
  requestCustomerLoginCode,
  requestWorkerLoginCode,
  workerLogin,
} from "./authService.js";

interface LoginBody {
  phone?: string;
  username?: string;
  code?: string;
}

function sendError(reply: FastifyReply, result: { statusCode: number; retryAfterSeconds?: number }) {
  if (result.retryAfterSeconds) reply.header("Retry-After", result.retryAfterSeconds);
  return reply.status(result.statusCode).send(result);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const env = loadEnv();
  const registerDebugRoutes = env.nodeEnv !== "production" && env.authDebugCodeEnabled;
  app.post(
    "/api/auth/customer/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestCustomerLoginCode(body.phone ?? "");
      if (!result.ok) return sendError(reply, result);
      request.log.info({
        securityEvent: "otp_issued",
        authScope: "customer",
        identityRef: hashAuthAuditIdentity("customer", body.phone ?? ""),
        phoneMasked: maskPhone(body.phone ?? ""),
        expiresAt: result.expiresAt,
      }, "customer login OTP issued");
      return result;
    },
  );

  app.post(
    "/api/auth/customer/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await customerLogin(body.phone ?? "", body.code ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  app.post(
    "/api/auth/customer/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bearer = extractBearerToken(request.headers);
      if (!bearer.ok) return reply.status(401).send({ ok: false, error: bearer.error });
      const verified = verifyToken(bearer.token);
      if (!verified.ok) return reply.status(401).send({ ok: false, error: verified.error });
      if (verified.payload.appType !== "customer" || verified.payload.role !== "customer") {
        return reply.status(403).send({ ok: false, error: "Customer token required" });
      }
      await revokeToken(verified.payload);
      return { ok: true as const };
    },
  );

  if (registerDebugRoutes) {
    app.get(
      "/api/auth/customer/debug-code",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = (request.query ?? {}) as { phone?: string };
        const result = await debugCustomerLoginCode(query.phone ?? "");
        if (!result.ok) return sendError(reply, result);
        return result;
      },
    );
  }

  app.post(
    "/api/auth/admin/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestAdminLoginCode(body.username ?? "");
      if (!result.ok) return sendError(reply, result);
      request.log.info({
        securityEvent: "otp_issued",
        authScope: "admin",
        identityRef: hashAuthAuditIdentity("admin", body.username ?? ""),
        expiresAt: result.expiresAt,
      }, "admin login OTP issued");
      return result;
    },
  );

  app.post(
    "/api/auth/admin/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await adminLogin(body.username ?? "", body.code ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  if (registerDebugRoutes) {
    app.get(
      "/api/auth/admin/debug-code",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = (request.query ?? {}) as { username?: string };
        const result = await debugAdminLoginCode(query.username ?? "");
        if (!result.ok) return sendError(reply, result);
        return result;
      },
    );
  }

  app.post(
    "/api/auth/worker/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestWorkerLoginCode(body.phone ?? "");
      if (!result.ok) return sendError(reply, result);
      request.log.info({
        securityEvent: "otp_issued",
        authScope: "worker",
        identityRef: hashAuthAuditIdentity("worker", body.phone ?? ""),
        phoneMasked: maskPhone(body.phone ?? ""),
        expiresAt: result.expiresAt,
      }, "worker login OTP issued");
      return result;
    },
  );

  app.post(
    "/api/auth/worker/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await workerLogin(body.phone ?? "", body.code ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  if (registerDebugRoutes) {
    app.get(
      "/api/auth/worker/debug-code",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = (request.query ?? {}) as { phone?: string };
        const result = await debugWorkerLoginCode(query.phone ?? "");
        if (!result.ok) return sendError(reply, result);
        return result;
      },
    );
  }
}
