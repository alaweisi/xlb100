import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Phase 8A migration boundary", () => {
  it("creates only ledger foundation tables", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const sql = readFileSync(join(root, "db/migrations/012_ledger_accrual_foundation.sql"), "utf8");
    const tables = [...sql.matchAll(/CREATE\s+TABLE\s+(\w+)/gi)].map((match) => match[1]);
    expect(tables).toEqual(["ledger_accounts", "ledger_entries", "ledger_accruals"]);
    expect(sql).not.toMatch(/CREATE\s+TABLE\s+(settlement|payout|refund|aftersale)/i);
  });
});
