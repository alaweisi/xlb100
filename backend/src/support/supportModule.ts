import type { FastifyInstance } from "fastify";
import { registerSupportAgentRoutes } from "./agentWorkbench/supportAgentRoutes.js";
import { registerSupportTicketRoutes } from "./ticket/supportTicketRoutes.js";

export async function registerSupportModule(app: FastifyInstance): Promise<void> {
  await registerSupportAgentRoutes(app);
  await registerSupportTicketRoutes(app);
}
