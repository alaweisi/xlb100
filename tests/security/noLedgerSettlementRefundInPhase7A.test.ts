import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fulfillmentDir = join(root, "backend/src/fulfillment");

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith(".ts")) return [full];
    return [];
  });
}

describe("noLedgerSettlementRefundInPhase7A", () => {
  it("fulfillment module has no ledger imports", () => {
    const forbidden = ["ledgerService", "settlementService", "refundService"];
    for (const file of listTsFiles(fulfillmentDir)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toContain(pattern);
      }
    }
  });
});
