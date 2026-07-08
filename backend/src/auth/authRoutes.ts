import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { customerLogin, adminLogin } from "./authService.js";

interface LoginBody {
  phone?: string;
  username?: string;
  code?: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // ── Customer login ──
  // TODO: replace MOCK_CODE "1234" with real SMS verification
  app.post(
    "/api/auth/customer/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await customerLogin(body.phone ?? "", body.code ?? "");
      if (!result.ok) {
        return reply.status(result.statusCode).send(result);
      }
      return result;
    },
  );

  // ── Admin login ──
  // TODO: replace MOCK_CODE "1234" with real MFA/LDAP integration
  app.post(
    "/api/auth/admin/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body ?? {}) as LoginBody;
      const result = await adminLogin(body.username ?? "", body.code ?? "");
      if (!result.ok) {
        return reply.status(result.statusCode).send(result);
      }
      return result;
    },
  );
}
