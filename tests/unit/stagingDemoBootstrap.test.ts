import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadEnv } from "@xlb/config";
import {
  applyStagingDemoOperations,
  buildStagingDemoOperations,
  STAGING_DEMO_IDS,
  STAGING_DEMO_RESET_CONFIRMATION,
  validateStagingDemoBootstrapTarget,
} from "../../backend/src/demo/stagingDemoBootstrap.js";

function stubBootstrapEnv(): void {
  vi.stubEnv("NODE_ENV", "staging");
  vi.stubEnv("JWT_SECRET", "investor-demo-jwt-secret-at-least-32-characters");
  vi.stubEnv("MYSQL_HOST", "mysql.staging.internal");
  vi.stubEnv("MYSQL_DATABASE", "xlb_staging");
  vi.stubEnv("MYSQL_PASSWORD", "investor-demo-mysql-password");
  vi.stubEnv("REDIS_PASSWORD", "investor-demo-redis-password");
  vi.stubEnv("AUTH_PHONE_HASH_SECRET", "investor-demo-phone-hash-secret-at-least-32");
  vi.stubEnv("AUTH_OTP_PEPPER", "investor-demo-otp-pepper-at-least-32-chars");
  vi.stubEnv("AUTH_DEBUG_CODE_ENABLED", "false");
  vi.stubEnv("STAGING_DEMO_CUSTOMER_AUTH_ENABLED", "true");
  vi.stubEnv("STAGING_DEMO_CUSTOMER_PHONE", "13800000001");
  vi.stubEnv("STAGING_INVESTOR_DEMO_AUTH_ENABLED", "true");
  vi.stubEnv("STAGING_DEMO_WORKER_ID", STAGING_DEMO_IDS.workerId);
  vi.stubEnv("STAGING_DEMO_WORKER_PHONE", "13800000011");
  vi.stubEnv("STAGING_DEMO_ADMIN_USER_ID", STAGING_DEMO_IDS.adminUserId);
  vi.stubEnv("STAGING_DEMO_ADMIN_USERNAME", "investor_demo_hz");
  vi.stubEnv("STAGING_DEMO_CITY_CODE", "hangzhou");
  vi.stubEnv("STAGING_DEMO_RESET_ENABLED", "true");
  vi.stubEnv("STAGING_DEMO_RESET_CONFIRMATION", STAGING_DEMO_RESET_CONFIRMATION);
  vi.stubEnv("STAGING_DEMO_RESET_EXPECTED_HOST", "mysql.staging.internal");
  vi.stubEnv("STAGING_DEMO_RESET_EXPECTED_DATABASE", "xlb_staging");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("staging demo bootstrap safety", () => {
  it("exposes explicit root dry-run and apply aliases without setting safety switches", () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(rootPackage.scripts["staging:demo:bootstrap:dry-run"]).toBe(
      "node backend/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.base.json scripts/staging-demo-bootstrap.ts --dry-run",
    );
    expect(rootPackage.scripts["staging:demo:reset"]).toBe(
      "node backend/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.base.json scripts/staging-demo-bootstrap.ts --apply",
    );
    expect(rootPackage.scripts["staging:demo:reset"]).not.toMatch(
      /STAGING_DEMO_RESET_ENABLED|STAGING_DEMO_RESET_CONFIRMATION/u,
    );
  });

  it("requires staging, two explicit switches and exact host/database matches", () => {
    stubBootstrapEnv();
    expect(validateStagingDemoBootstrapTarget(loadEnv())).toMatchObject({
      environment: "staging",
      mysqlHost: "mysql.staging.internal",
      mysqlDatabase: "xlb_staging",
      cityCode: "hangzhou",
    });

    vi.stubEnv("STAGING_DEMO_RESET_CONFIRMATION", "wrong");
    expect(() => validateStagingDemoBootstrapTarget(loadEnv()))
      .toThrow("STAGING_DEMO_RESET_CONFIRMATION");
  });

  it("builds a fixed, auditable plan without broad or fuzzy deletion", () => {
    stubBootstrapEnv();
    const operations = buildStagingDemoOperations(
      validateStagingDemoBootstrapTarget(loadEnv()),
    );
    expect(operations.length).toBeGreaterThanOrEqual(30);
    const sql = operations.map((operation) => operation.sql).join("\n");
    expect(sql).not.toMatch(/\bTRUNCATE\b/iu);
    expect(sql).not.toMatch(/\bLIKE\b|\bREGEXP\b/iu);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+\w+\s*(?:;|$)/iu);
    const deletes = operations.filter((operation) => /\bDELETE\s+FROM\b/iu.test(operation.sql));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.sql).toMatch(/admin_user_id=\?/u);
    expect(deletes[0]?.sql).toMatch(/city_code<>\?/u);
    expect(deletes[0]?.params).toEqual([
      STAGING_DEMO_IDS.adminUserId,
      "hangzhou",
    ]);
    const workerScopeCleanup = operations.find(
      (operation) => operation.label === "worker_other_city_disable",
    );
    expect(workerScopeCleanup?.sql).toMatch(/worker_id=\?/u);
    expect(workerScopeCleanup?.sql).toMatch(/city_code<>\?/u);
    expect(workerScopeCleanup?.params).toEqual([
      STAGING_DEMO_IDS.workerId,
      "hangzhou",
    ]);
    for (const operation of operations.filter((item) => /^\s*INSERT\b/iu.test(item.sql))) {
      expect(operation.sql).toMatch(/ON DUPLICATE KEY UPDATE/iu);
      expect(operation.entityIds.every((id) => (
        id === STAGING_DEMO_IDS.customerId || id.startsWith("investor-demo-")
      ))).toBe(true);
    }
  });

  it("wraps every apply in one transaction and rolls back atomically", async () => {
    const events: string[] = [];
    const connection = {
      beginTransaction: async () => { events.push("begin"); },
      commit: async () => { events.push("commit"); },
      rollback: async () => { events.push("rollback"); },
      query: async () => {
        events.push("query");
        return [{ affectedRows: 1 }];
      },
    };
    const operations = [{
      label: "fixed-demo-row",
      table: "demo_table",
      sql: "INSERT INTO demo_table(id) VALUES (?) ON DUPLICATE KEY UPDATE id=VALUES(id)",
      params: ["investor-demo-row"],
      entityIds: ["investor-demo-row"],
    }];
    expect(await applyStagingDemoOperations(connection as never, operations))
      .toMatchObject([{ label: "fixed-demo-row", affectedRows: 1 }]);
    expect(events).toEqual(["begin", "query", "commit"]);

    events.length = 0;
    const failing = {
      ...connection,
      query: async () => {
        events.push("query");
        throw new Error("injected failure");
      },
    };
    await expect(applyStagingDemoOperations(failing as never, operations))
      .rejects.toThrow("injected failure");
    expect(events).toEqual(["begin", "query", "rollback"]);
  });
});
