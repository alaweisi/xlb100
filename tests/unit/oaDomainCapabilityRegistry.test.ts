import { describe, expect, it } from "vitest";
import {
  OA_DOMAIN_ACCESS_RULES,
  resolveOaDomainAccessRule,
} from "../../backend/src/oa/oaDomainCapabilityRegistry.js";

describe("OA domain capability registry", () => {
  it("never binds a mutation to a read permission", () => {
    expect(
      OA_DOMAIN_ACCESS_RULES.filter(
        (rule) => rule.method !== "GET" && rule.permission.endsWith(".read"),
      ),
    ).toEqual([]);
  });

  it("separates read and write permissions for mixed Admin pages", () => {
    expect(resolveOaDomainAccessRule("GET", "/api/internal/operations/skus")?.permission)
      .toBe("operations.catalog.read");
    expect(resolveOaDomainAccessRule("POST", "/api/internal/operations/skus/demo/status")?.permission)
      .toBe("operations.catalog.manage");
    expect(resolveOaDomainAccessRule("GET", "/api/internal/worker-withdrawals")?.permission)
      .toBe("finance.withdrawal.read");
    expect(resolveOaDomainAccessRule("POST", "/api/internal/worker-withdrawals/demo/review")?.permission)
      .toBe("finance.withdrawal.review");
  });

  it("requires moderation permission for raw review content", () => {
    expect(resolveOaDomainAccessRule("GET", "/api/admin/reviews/review-1/content")?.permission)
      .toBe("reviews.moderate");
  });

  it("does not expose provider refund approval through the aftersale page capability", () => {
    expect(
      resolveOaDomainAccessRule(
        "POST",
        "/api/internal/aftersale/refunds/refund-1/approve",
      ),
    ).toBeNull();
    expect(
      resolveOaDomainAccessRule(
        "POST",
        "/api/internal/aftersale/complaints/complaint-1/resolve",
      )?.permission,
    ).toBe("aftersale.manage");
  });

  it("limits settlement delegation to audit reads and dry-run plan governance", () => {
    expect(
      resolveOaDomainAccessRule(
        "GET",
        "/api/internal/settlement/worker-statement-audit",
      )?.permission,
    ).toBe("finance.settlement.read");
    expect(
      resolveOaDomainAccessRule(
        "POST",
        "/api/internal/settlement-action-governance/plans",
      )?.permission,
    ).toBe("finance.settlement.review");
    expect(
      resolveOaDomainAccessRule(
        "POST",
        "/api/internal/settlement/prepare-once",
      ),
    ).toBeNull();
    expect(
      resolveOaDomainAccessRule(
        "POST",
        "/api/internal/settlement/batches/batch-1/confirm",
      ),
    ).toBeNull();
  });

  it("denies unregistered and OA-recursive targets", () => {
    expect(resolveOaDomainAccessRule("POST", "/api/internal/operations/orders")).toBeNull();
    expect(resolveOaDomainAccessRule("GET", "/api/oa/workbench")).toBeNull();
  });
});
