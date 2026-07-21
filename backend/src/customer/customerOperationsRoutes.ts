import type { FastifyInstance, FastifyReply } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { CustomerOperationsError, customerOperationsService } from "./customerOperationsService.js";

function fail(error: unknown, reply: FastifyReply) {
  if (error instanceof CustomerOperationsError) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  throw error;
}

export async function registerCustomerOperationsRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });
  app.get("/api/customer/worker-showcase", { preHandler }, async (request, reply) => {
    try { return await customerOperationsService.listWorkerShowcase(getRequestContext(request)); }
    catch (error) { return fail(error, reply); }
  });
  app.get("/api/customer/profile", { preHandler }, async (request, reply) => {
    try { return { ok: true, profile: await customerOperationsService.getProfile(getRequestContext(request)) }; }
    catch (error) { return fail(error, reply); }
  });
  app.post("/api/customer/profile", { preHandler }, async (request, reply) => {
    try { return { ok: true, profile: await customerOperationsService.updateProfile(getRequestContext(request), request.body) }; }
    catch (error) { return fail(error, reply); }
  });
  app.get("/api/customer/addresses", { preHandler }, async (request, reply) => {
    try { return { ok: true, addresses: await customerOperationsService.listAddresses(getRequestContext(request)) }; }
    catch (error) { return fail(error, reply); }
  });
  app.post("/api/customer/addresses", { preHandler }, async (request, reply) => {
    try { return { ok: true, address: await customerOperationsService.createAddress(getRequestContext(request), request.body) }; }
    catch (error) { return fail(error, reply); }
  });
  app.post("/api/customer/addresses/:addressId", { preHandler }, async (request, reply) => {
    const { addressId } = request.params as { addressId: string };
    try { return { ok: true, address: await customerOperationsService.updateAddress(getRequestContext(request), addressId, request.body) }; }
    catch (error) { return fail(error, reply); }
  });
  app.post("/api/customer/addresses/:addressId/delete", { preHandler }, async (request, reply) => {
    const { addressId } = request.params as { addressId: string };
    try { return { ok: true, ...(await customerOperationsService.deleteAddress(getRequestContext(request), addressId)) }; }
    catch (error) { return fail(error, reply); }
  });
}
