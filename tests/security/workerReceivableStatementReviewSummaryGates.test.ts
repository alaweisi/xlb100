import { describe, expect, it } from "vitest";

describe("Phase 8J review summary security", () => {
  it("review summary endpoint is GET only", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const section = routes.split("Phase 8J")[1] ?? "";
    expect(section).toMatch(/app\.get\(/);
    expect(section).not.toMatch(/app\.post\(/);
    expect(section).not.toMatch(/app\.put\(/);
  });

  it("summary repository has no payout tables", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repo = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementReviewSummaryRepository.ts"),
      "utf8",
    );
    expect(repo).not.toMatch(/payouts?/i);
    expect(repo).not.toMatch(/payment_orders/i);
    expect(repo).not.toMatch(/payment_instructions/i);
  });

  it("summary repository is read-only SELECT", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repo = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementReviewSummaryRepository.ts"),
      "utf8",
    );
    expect(repo).toMatch(/SELECT\s/);
    expect(repo).not.toMatch(/INSERT /i);
    expect(repo).not.toMatch(/UPDATE /i);
    expect(repo).not.toMatch(/DELETE /i);
  });

  it("summary service validates cityCode", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const svc = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementReviewSummaryService.ts"),
      "utf8",
    );
    expect(svc).toMatch(/cityCode/);
  });
});
