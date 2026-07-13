import type { FastifyInstance } from "fastify";
import { registerNotificationRoutes } from "../routes/notificationRoutes.js";

export async function registerNotificationModule(app: FastifyInstance): Promise<void> {
  await registerNotificationRoutes(app);
}
