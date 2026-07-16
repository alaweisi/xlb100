import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  getLiveHealthStatus,
  toReadyHealthStatus,
  type DbHealthStatus,
} from "../../backend/src/observability/health.js";

const baseDependencyHealth: DbHealthStatus = {
  ok: true,
  mysql: "ok",
  redis: "ok",
  database: "xlb_test",
  phase: "test",
  dataReliability: {
    ready: true,
    state: "fresh",
    observedAt: new Date().toISOString(),
    snapshotAgeSeconds: 0,
    reasons: [],
  },
  jobWorker: { state: "fresh", ageSeconds: 0, observedAt: new Date().toISOString() },
};

describe("TKE health contracts", () => {
  it("keeps liveness independent from MySQL and Redis", async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "GET", url: "/health/live" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject(getLiveHealthStatus());
    } finally {
      await app.close();
    }
  });

  it("maps healthy dependencies to ready", () => {
    expect(toReadyHealthStatus(baseDependencyHealth)).toMatchObject({
      ok: true,
      status: "ready",
      service: "xlb-backend",
    });
  });

  it("maps a dependency failure to not_ready without changing liveness", () => {
    expect(toReadyHealthStatus({
      ...baseDependencyHealth,
      ok: false,
      mysql: "error",
    })).toMatchObject({
      ok: false,
      status: "not_ready",
      mysql: "error",
    });
    expect(getLiveHealthStatus()).toMatchObject({ ok: true, status: "live" });
  });
});
