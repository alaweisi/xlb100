import type { FastifyInstance } from "fastify";
import { registerSupportTicketRoutes } from "./ticket/supportTicketRoutes.js";

export async function registerSupportModule(app: FastifyInstance): Promise<void> {
  await registerSupportTicketRoutes(app);
}
