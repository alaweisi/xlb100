import { describe, expect, it } from "vitest";
import { ledgerEntrySchema } from "@xlb/validators";

describe("ledger entry contract", () => {
  it("accepts only fulfillment.completed CNY entries", () => {
    const value = { entryId: "len", cityCode: "hangzhou", accountId: "account", accountType: "worker", ownerId: "worker", sourceType: "fulfillment.completed", sourceId: "ful", direction: "credit", amount: 80.1, currency: "CNY", description: "Worker receivable accrued", createdAt: new Date().toISOString() };
    expect(ledgerEntrySchema.safeParse(value).success).toBe(true);
    expect(ledgerEntrySchema.safeParse({ ...value, sourceType: "order.paid" }).success).toBe(false);
  });
});
