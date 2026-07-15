import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../backend/src/app";

describe("project status contract", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("reports the locked Phase 29 runtime status consistently", async () => {
    app = await buildApp();

    const health = await app.inject({ method: "GET", url: "/health" });
    const system = await app.inject({ method: "GET", url: "/api/system/status" });

    expect(health.json()).toMatchObject({
      status: "ok",
      service: "xlb-backend",
      phase: "29",
    });
    expect(system.json()).toMatchObject({
      ok: true,
      project: "XLB",
      phase: "29",
      foundation: "phase29-marketing-coupon",
    });
  });

  it("keeps public entry-point documentation linked to the canonical state", async () => {
    const [rootReadme, testsReadme] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("tests/README.md", "utf8"),
    ]);

    expect(rootReadme).toContain("Phase 29 已锁定");
    expect(rootReadme).toContain("docs/CURRENT_STATE.md");
    expect(rootReadme).not.toContain("当前阶段：** Phase 3");
    expect(testsReadme).toContain("测试体系覆盖");
    expect(testsReadme).toContain("../docs/CURRENT_STATE.md");
    expect(testsReadme).not.toContain("Phase 0：占位测试");
  });
});
