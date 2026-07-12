import type { FastifyInstance } from "fastify";
import { registerSupportAgentRoutes } from "./agentWorkbench/supportAgentRoutes.js";
import { registerSupportSlaPolicyRoutes } from "./routing/supportSlaPolicyRoutes.js";
import { registerSupportTicketRoutes } from "./ticket/supportTicketRoutes.js";
import { registerSupportConversationRoutes } from "./conversation/supportConversationRoutes.js";
import { registerSupportRealtimeGateway } from "./conversation/supportRealtimeGateway.js";
import { registerSupportQualityRoutes } from "./quality/supportQualityRoutes.js";
import { registerSupportKnowledgeBaseRoutes } from "./knowledgeBase/supportKnowledgeBaseRoutes.js";
import { registerSupportBotRoutes } from "./bot/supportBotRoutes.js";

export async function registerSupportModule(app: FastifyInstance): Promise<void> {
  await registerSupportRealtimeGateway(app);
  await registerSupportConversationRoutes(app);
  await registerSupportQualityRoutes(app);
  await registerSupportKnowledgeBaseRoutes(app);
  await registerSupportBotRoutes(app);
  await registerSupportAgentRoutes(app);
  await registerSupportSlaPolicyRoutes(app);
  await registerSupportTicketRoutes(app);
}
