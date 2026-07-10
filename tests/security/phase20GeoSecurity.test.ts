import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";

describe("Phase 20 geo security boundaries",()=>{
  it("contains no Amap or network execution path",async()=>{const provider=await readFile(new URL("../../backend/src/dispatch/geoProvider.ts",import.meta.url),"utf8");expect(provider).not.toMatch(/fetch\(|axios|https?:\/\/|amap|高德/i);expect(provider).toContain('externalProviderExecuted: false');});
  it("pins location, offer, and event references to city-scoped parents",async()=>{const migration=await readFile(new URL("../../db/migrations/039_phase20_lbs_lite_dispatch.sql",import.meta.url),"utf8");expect(migration).toContain("FOREIGN KEY (worker_id, city_code)");expect(migration).toContain("FOREIGN KEY (city_code, dispatch_task_id)");expect(migration).toContain("privacy_level = 'private_exact'");});
  it("keeps exact location on worker-owned routes",async()=>{const routes=await readFile(new URL("../../backend/src/worker/workerAcceptRoutes.ts",import.meta.url),"utf8");expect(routes).toContain('"/api/worker/location"');expect(routes).not.toContain('"/api/customer/location"');});
});
