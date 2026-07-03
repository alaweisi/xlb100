import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "xlb-backend",
    phase: "0",
    brand: "喜乐帮 / XLB",
  }));

  app.get("/api/system/status", async () => ({
    ok: true,
    project: "XLB",
    phase: "0",
    apps: ["customer", "worker", "admin"],
    backend: "ready",
  }));

  return app;
}
