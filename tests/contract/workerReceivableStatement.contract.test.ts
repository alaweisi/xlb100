import { describe, expect, it } from "vitest";
import {
  generateWorkerReceivableStatementsResponseSchema,
  getWorkerReceivableStatementResponseSchema,
  listWorkerReceivableStatementsResponseSchema,
  workerReceivableStatementCreatedEventPayloadSchema,
  workerReceivableStatementSchema,
} from "@xlb/validators";

describe("worker receivable statement contract", () => {
  const now = new Date().toISOString();
  const statement = {
    statementId: "wrs-1",
    cityCode: "hangzhou",
    queueId: "spq-1",
    settlementPayableId: "spy-1",
    settlementBatchId: "stb-1",
    workerId: "wrk-1",
    currency: "CNY" as const,
    grossAmount: 89,
    platformFeeAmount: 8.9,
    workerReceivableAmount: 80.1,
    itemCount: 1,
    status: "created" as const,
    generatedAt: now,
    generatedBy: "operator-1",
    createdAt: now,
    updatedAt: now,
  };

  it("accepts generate response", () => {
    expect(generateWorkerReceivableStatementsResponseSchema.parse({
      ok: true,
      statements: [statement],
      idempotent: false,
    })).toBeTruthy();
  });

  it("accepts list and detail responses", () => {
    expect(listWorkerReceivableStatementsResponseSchema.parse({ ok: true, statements: [statement] })).toBeTruthy();
    expect(getWorkerReceivableStatementResponseSchema.parse({
      ok: true,
      statement,
      lines: [{
        lineId: "wrl-1",
        statementId: "wrs-1",
        cityCode: "hangzhou",
        settlementItemId: "sti-1",
        settlementBatchId: "stb-1",
        workerId: "wrk-1",
        orderId: "ord-1",
        fulfillmentId: "ful-1",
        skuId: "sku-1",
        currency: "CNY",
        grossAmount: 89,
        platformFeeAmount: 8.9,
        workerReceivableAmount: 80.1,
        createdAt: now,
      }],
    })).toBeTruthy();
  });

  it("rejects payout-like fields on statement schema", () => {
    expect(() => workerReceivableStatementSchema.parse({
      ...statement,
      payoutId: "bad",
    })).toThrow();
  });
});

describe("worker.receivable.statement.created event contract", () => {
  it("accepts valid payload without payout fields", () => {
    const payload = workerReceivableStatementCreatedEventPayloadSchema.parse({
      statementId: "wrs-1",
      queueId: "spq-1",
      payableId: "spy-1",
      batchId: "stb-1",
      cityCode: "hangzhou",
      workerId: "wrk-1",
      currency: "CNY",
      grossAmount: 89,
      platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1,
      itemCount: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: "operator-1",
    });
    expect(payload).not.toHaveProperty("payoutId");
    expect(payload).not.toHaveProperty("provider");
  });
});
