import { describe, it, expect } from "vitest";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("noGlobalInCities (DB-backed)", () => {
  it("cities table contains only real cities", async () => {
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT city_code FROM cities ORDER BY city_code",
    );
    const codes = rows.map((r) => String(r.city_code));
    expect(codes).not.toContain("__global__");
    expect(codes).toEqual(["beijing", "hangzhou", "shanghai"]);
  });

  it("admin_city_scopes may contain __global__ marker", async () => {
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT city_code FROM admin_city_scopes WHERE city_code = '__global__'",
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
