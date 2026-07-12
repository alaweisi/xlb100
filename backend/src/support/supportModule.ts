import type { FastifyInstance } from "fastify";
import { registerSupportAgentRoutes } from "./agentWorkbench/supportAgentRoutes.js";
import { registerSupportSlaPolicyRoutes } from "./routing/supportSlaPolicyRoutes.js";
import { registerSupportTicketRoutes } from "./ticket/supportTicketRoutes.js";

export async function registerSupportModule(app: FastifyInstance): Promise<void> {
  await registerSupportAgentRoutes(app);
  await registerSupportSlaPolicyRoutes(app);
  await registerSupportTicketRoutes(app);
}
