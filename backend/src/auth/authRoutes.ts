import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@xlb/config";
import { hashAuthAuditIdentity, maskPhone } from "./phoneIdentity.js";
import {
  adminLogin,
  customerLogin,
  debugAdminLoginCode,
  debugOaLoginCode,
  debugDashboardLoginCode,
  debugCustomerLoginCode,
  debugWorkerLoginCode,
  requestAdminLoginCode,
  requestOaLoginCode,
  requestDashboardLoginCode,
  requestCustomerLoginCode,
  requestWorkerLoginCode,
  oaLogin,
  dashboardLogin,
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
    "/api/auth/dashboard/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestDashboardLoginCode(body.username ?? "");
      if (!result.ok) return sendError(reply, result);
      request.log.info({
        securityEvent: "otp_issued",
        authScope: "dashboard",
        identityRef: hashAuthAuditIdentity("dashboard", body.username ?? ""),
        expiresAt: result.expiresAt,
      }, "dashboard login OTP issued");
      return result;
    },
  );

  app.post(
    "/api/auth/dashboard/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await dashboardLogin(body.username ?? "", body.code ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  if (registerDebugRoutes) {
    app.get(
      "/api/auth/dashboard/debug-code",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = (request.query ?? {}) as { username?: string };
        const result = await debugDashboardLoginCode(query.username ?? "");
        if (!result.ok) return sendError(reply, result);
        return result;
      },
    );
  }

  app.post(
    "/api/auth/oa/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestOaLoginCode(body.username ?? "");
      if (!result.ok) return sendError(reply, result);
      request.log.info({
        securityEvent: "otp_issued",
        authScope: "oa",
        identityRef: hashAuthAuditIdentity("oa", body.username ?? ""),
        expiresAt: result.expiresAt,
      }, "OA headquarters login OTP issued");
      return result;
    },
  );

  app.post(
    "/api/auth/oa/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await oaLogin(body.username ?? "", body.code ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  if (registerDebugRoutes) {
    app.get(
      "/api/auth/oa/debug-code",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const query = (request.query ?? {}) as { username?: string };
        const result = await debugOaLoginCode(query.username ?? "");
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
