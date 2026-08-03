import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadEnv } from "@xlb/config";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import {
  assertStagingDemoUniqueOwnership,
  buildStagingDemoUniqueOwnershipChecks,
  buildStagingDemoOperations,
  executeStagingDemoOperations,
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
  vi.stubEnv("STAGING_DEMO_CUSTOMER_PHONE", INVESTOR_DEMO_IDENTITIES.customer.phone);
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

  it("keeps the fixed Customer seed and account documentation aligned with the contract", () => {
    const seed = readFileSync(
      new URL("../../db/seed/011_customers_admin_users.seed.sql", import.meta.url),
      "utf8",
    );
    const accountDoc = readFileSync(
      new URL("../../docs/mobile/INVESTOR_DEMO_ANDROID.md", import.meta.url),
      "utf8",
    );
    const expectedSeedTuple = `('${INVESTOR_DEMO_IDENTITIES.customer.id}', '${INVESTOR_DEMO_IDENTITIES.customer.phone}'`;
    expect(seed.includes(expectedSeedTuple)).toBe(true);
    expect(seed).toMatch(/ON DUPLICATE KEY UPDATE\s+phone = VALUES\(phone\)/u);
    expect(accountDoc.includes(INVESTOR_DEMO_IDENTITIES.customer.id)).toBe(true);
    expect(accountDoc.includes(INVESTOR_DEMO_IDENTITIES.customer.phone)).toBe(true);
  });

  it("builds a fixed, auditable plan without broad or fuzzy deletion", () => {
    stubBootstrapEnv();
    const operations = buildStagingDemoOperations(
      validateStagingDemoBootstrapTarget(loadEnv()),
    );
    expect(operations.length).toBeGreaterThanOrEqual(30);
    const sql = operations
      .filter((operation) => "sql" in operation)
      .map((operation) => operation.sql)
      .join("\n");
    expect(sql).not.toMatch(/\bTRUNCATE\b/iu);
    expect(sql).not.toMatch(/\bLIKE\b|\bREGEXP\b/iu);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+\w+\s*(?:;|$)/iu);
    const deletes = operations.filter(
      (operation) => "sql" in operation && /\bDELETE\s+FROM\b/iu.test(operation.sql),
    );
    expect(deletes).toHaveLength(1);
    const deleteOperation = deletes[0];
    expect(deleteOperation && "sql" in deleteOperation ? deleteOperation.sql : "")
      .toMatch(/admin_user_id=\?/u);
    expect(deleteOperation && "sql" in deleteOperation ? deleteOperation.sql : "")
      .toMatch(/city_code<>\?/u);
    expect(deleteOperation && "params" in deleteOperation ? deleteOperation.params : [])
      .toEqual([
      STAGING_DEMO_IDS.adminUserId,
      "hangzhou",
    ]);
    const workerScopeCleanup = operations.find(
      (operation) => operation.label === "worker_other_city_disable",
    );
    expect(workerScopeCleanup && "sql" in workerScopeCleanup ? workerScopeCleanup.sql : "")
      .toMatch(/worker_id=\?/u);
    expect(workerScopeCleanup && "sql" in workerScopeCleanup ? workerScopeCleanup.sql : "")
      .toMatch(/city_code<>\?/u);
    expect(workerScopeCleanup && "params" in workerScopeCleanup ? workerScopeCleanup.params : [])
      .toEqual([
      STAGING_DEMO_IDS.workerId,
      "hangzhou",
    ]);
    const workerLocation = operations.find(
      (operation) => operation.label === "worker_demo_location",
    );
    expect(workerLocation && "sql" in workerLocation ? workerLocation.sql : "")
      .toMatch(/INSERT\s+INTO\s+worker_locations/iu);
    expect(workerLocation && "params" in workerLocation ? workerLocation.params : [])
      .toEqual([
        STAGING_DEMO_IDS.workerLocationId,
        STAGING_DEMO_IDS.workerId,
        "hangzhou",
      ]);
    const dispatchPreference = operations.find(
      (operation) => operation.label === "worker_dispatch_preferences",
    );
    expect(dispatchPreference && "sql" in dispatchPreference ? dispatchPreference.sql : "")
      .toMatch(/location_sharing_enabled=1/iu);
    for (const operation of operations.filter(
      (item) => "sql" in item && /^\s*INSERT\b/iu.test(item.sql),
    )) {
      if (!("sql" in operation)) throw new Error("expected SQL operation");
      expect(operation.sql).toMatch(/ON DUPLICATE KEY UPDATE/iu);
      expect(operation.entityIds.every((id) => (
        id === STAGING_DEMO_IDS.customerId || id.startsWith("investor-demo-")
      ))).toBe(true);
    }
    const historyReview = operations.find(
      (operation) => operation.label === "history_review",
    );
    expect(historyReview && "execute" in historyReview).toBe(true);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+order_reviews\b/iu);
  });

  it("wraps every apply in one transaction and rolls back atomically", async () => {
    const events: string[] = [];
    const connection = {
      beginTransaction: async () => { events.push("begin"); },
      commit: async () => { events.push("commit"); },
      rollback: async () => { events.push("rollback"); },
      query: async (sql: string) => {
        events.push("query");
        return sql.startsWith("SELECT")
          ? [[]]
          : [{ affectedRows: 1 }];
      },
    };
    stubBootstrapEnv();
    const target = validateStagingDemoBootstrapTarget(loadEnv());
    const operations = [{
      label: "fixed-demo-row",
      table: "demo_table",
      sql: "INSERT INTO demo_table(id) VALUES (?) ON DUPLICATE KEY UPDATE id=VALUES(id)",
      params: ["investor-demo-row"],
      entityIds: ["investor-demo-row"],
    }];
    expect(await executeStagingDemoOperations(connection as never, target, operations))
      .toMatchObject([{ label: "fixed-demo-row", affectedRows: 1 }]);
    expect(events[0]).toBe("begin");
    expect(events.slice(-2)).toEqual(["query", "commit"]);
    expect(events.slice(1, -2).every((event) => event === "query")).toBe(true);

    events.length = 0;
    let inserts = 0;
    const failing = {
      ...connection,
      query: async (sql: string) => {
        events.push("query");
        if (sql.startsWith("SELECT")) return [[]];
        inserts += 1;
        throw new Error("injected failure");
      },
    };
    await expect(executeStagingDemoOperations(failing as never, target, operations))
      .rejects.toThrow("injected failure");
    expect(events[0]).toBe("begin");
    expect(events.slice(-2)).toEqual(["query", "rollback"]);
    expect(inserts).toBe(1);
  });

  it("fails closed on a non-demo unique-key owner before transaction writes", async () => {
    stubBootstrapEnv();
    const target = validateStagingDemoBootstrapTarget(loadEnv());
    const checks = buildStagingDemoUniqueOwnershipChecks(target);
    let mutations = 0;
    const connection = {
      beginTransaction: async () => { mutations += 1; },
      commit: async () => { mutations += 1; },
      rollback: async () => { mutations += 1; },
      query: async (sql: string) => {
        if (sql.includes("FROM customers WHERE phone=?")) {
          return [[{ owner_id: "ordinary-customer" }]];
        }
        if (!sql.startsWith("SELECT")) mutations += 1;
        return [[]];
      },
    };
    await expect(assertStagingDemoUniqueOwnership(connection as never, checks))
      .rejects.toThrow("customer.phone@customers:1");
    expect(mutations).toBe(0);
    let transactionStarts = 0;
    let transactionRollbacks = 0;
    const guardedConnection = {
      ...connection,
      beginTransaction: async () => { transactionStarts += 1; },
      rollback: async () => { transactionRollbacks += 1; },
    };
    await expect(executeStagingDemoOperations(
      guardedConnection as never,
      target,
      buildStagingDemoOperations(target),
    )).rejects.toThrow("staging demo unique ownership collision");
    expect(mutations).toBe(0);
    expect(transactionStarts).toBe(1);
    expect(transactionRollbacks).toBe(1);
  });
});
