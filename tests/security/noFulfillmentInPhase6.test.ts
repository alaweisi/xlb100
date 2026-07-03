import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const complianceDir = join(root, "backend/src/compliance");

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith(".ts")) return [full];
    return [];
  });
}

describe("noFulfillmentInPhase6", () => {
  it("compliance module has no fulfillment imports", () => {
    const forbidden = ["fulfillmentService", "fulfillmentStatus", "from \"../fulfillment"];
    for (const file of listTsFiles(complianceDir)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toContain(pattern);
      }
    }
  });

  it("compliance module has no ledger/refund imports", () => {
    const forbidden = ["ledgerService", "refundService", "from \"../ledger", "from \"../aftersale"];
    for (const file of listTsFiles(complianceDir)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toContain(pattern);
      }
    }
  });
});
