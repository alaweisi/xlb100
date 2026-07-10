import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";

describe("Phase 19 enterprise security boundaries",()=>{
  it("keeps API key auth separate and forbids plaintext key persistence",async()=>{const auth=await readFile(new URL("../../backend/src/enterprise/businessApiAuth.ts",import.meta.url),"utf8");const migration=await readFile(new URL("../../db/migrations/037_phase19_enterprise_openapi_webhooks.sql",import.meta.url),"utf8");expect(auth).toContain("x-xlb-api-key");expect(auth).not.toContain("authorization");expect(migration).toContain("secret_hash CHAR(64)");expect(migration).not.toMatch(/api_key\s+VARCHAR|secret_plaintext/i);});
  it("contains no payment, payout, refund, settlement, or dispatch mutation imports",async()=>{const service=await readFile(new URL("../../backend/src/enterprise/enterpriseService.ts",import.meta.url),"utf8");expect(service).not.toMatch(/^import .*\/(payment|ledger|settlement|dispatch|aftersale\/refund)/m);expect(service).not.toMatch(/UPDATE\s+(payment_orders|ledger_|settlement_|dispatch_)/i);});
  it("pins agreement and webhook delivery references to the same enterprise tenant",async()=>{const hardening=await readFile(new URL("../../db/migrations/038_phase19_enterprise_tenant_hardening.sql",import.meta.url),"utf8");expect(hardening).toContain("FOREIGN KEY (city_code, business_client_id, agreement_price_id)");expect(hardening).toContain("FOREIGN KEY (city_code, business_client_id, subscription_id)");});
});
