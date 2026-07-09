import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

function sendError(reply: FastifyReply, result: { statusCode: number }) {
  return reply.status(result.statusCode).send(result);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/customer/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestCustomerLoginCode(body.phone ?? "");
      if (!result.ok) return sendError(reply, result);
      app.log.info({ phone: body.phone, expiresAt: result.expiresAt }, "customer login OTP issued");
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

  app.get(
    "/api/auth/customer/debug-code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as { phone?: string };
      const result = await debugCustomerLoginCode(query.phone ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  app.post(
    "/api/auth/admin/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestAdminLoginCode(body.username ?? "");
      if (!result.ok) return sendError(reply, result);
      app.log.info({ username: body.username, expiresAt: result.expiresAt }, "admin login OTP issued");
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

  app.get(
    "/api/auth/admin/debug-code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as { username?: string };
      const result = await debugAdminLoginCode(query.username ?? "");
      if (!result.ok) return sendError(reply, result);
      return result;
    },
  );

  app.post(
    "/api/auth/worker/code",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await requestWorkerLoginCode(body.phone ?? "");
      if (!result.ok) return sendError(reply, result);
      app.log.info({ phone: body.phone, expiresAt: result.expiresAt }, "worker login OTP issued");
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
