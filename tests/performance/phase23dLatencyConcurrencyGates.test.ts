import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { adminAuthHeaders, bearerHeaders } from "../integration/helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const sampleCount = 24;
const p95BudgetMs = Number(process.env.XLB_PHASE23D_CITY_CONFIG_P95_MAX_MS ?? 1_000);
const customerHeaders = bearerHeaders({ appType: "customer", role: "customer", userId: "phase23d-performance", cityCode: "hangzhou" });
const adminHeaders = adminAuthHeaders("admin-hangzhou", "hangzhou", "admin");

type CityConfigRow = RowDataPacket & {
  version: number;
  is_open: number;
  timezone: string;
  service_enabled: number;
  pricing_enabled: number;
};

function percentile(samples: number[], value: number): number {
  if (samples.length === 0) throw new Error("percentile requires samples");
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(value * sorted.length) - 1)]!;
}

describe.skipIf(!runDb)("Phase 23D p95 and concurrent correctness gate", { timeout: 120_000 }, () => {
  it("keeps CityConfig CAS exact while individual request p95 remains bounded", async () => {
    const app = await buildApp();
    const pool = getMysqlPool();
    let original: CityConfigRow | undefined;
    try {
      const [rows] = await pool.query<CityConfigRow[]>(
        "SELECT version,is_open,timezone,service_enabled,pricing_enabled FROM city_configs WHERE city_code='hangzhou'",
      );
      original = rows[0];
      expect(original).toBeDefined();

      for (let index = 0; index < 3; index += 1) {
        const warmup = await app.inject({ method: "GET", url: "/api/city-config/current", headers: customerHeaders });
        expect(warmup.statusCode, warmup.body).toBe(200);
      }

      const samples = await Promise.all(Array.from({ length: sampleCount }, async () => {
        const startedAt = performance.now();
        const response = await app.inject({
          method: "POST",
          url: "/api/admin/city-config/update",
          headers: adminHeaders,
          payload: {
            cityCode: "hangzhou",
            expectedVersion: original!.version,
            serviceEnabled: original!.service_enabled === 1,
          },
        });
        return { statusCode: response.statusCode, body: response.body, durationMs: performance.now() - startedAt };
      }));

      expect(samples.filter(sample => sample.statusCode === 200), samples.map(sample => `${sample.statusCode}:${sample.body}`).join("\n")).toHaveLength(1);
      expect(samples.filter(sample => sample.statusCode === 409)).toHaveLength(sampleCount - 1);
      expect(samples.every(sample => sample.statusCode === 200 || sample.statusCode === 409)).toBe(true);

      const p95Ms = percentile(samples.map(sample => sample.durationMs), 0.95);
      process.stdout.write(`[phase23d] CityConfig CAS p95=${p95Ms.toFixed(1)}ms budget=${p95BudgetMs}ms samples=${sampleCount}\n`);
      expect(Number.isFinite(p95BudgetMs) && p95BudgetMs > 0).toBe(true);
      expect(p95Ms).toBeLessThan(p95BudgetMs);

      const [finalRows] = await pool.query<(RowDataPacket & { version: number; service_enabled: number })[]>(
        "SELECT version,service_enabled FROM city_configs WHERE city_code='hangzhou'",
      );
      expect(finalRows[0]).toMatchObject({ version: original!.version + 1, service_enabled: original!.service_enabled });
    } finally {
      if (original) {
        await pool.query(
          `UPDATE city_configs SET version=?,is_open=?,timezone=?,service_enabled=?,pricing_enabled=? WHERE city_code='hangzhou'`,
          [original.version, original.is_open, original.timezone, original.service_enabled, original.pricing_enabled],
        );
      }
      await app.close();
    }
  });
});
