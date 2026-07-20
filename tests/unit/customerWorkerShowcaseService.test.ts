import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@xlb/types";

const pool = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../backend/src/dal/mysqlPool.js", () => ({
  getMysqlPool: () => pool,
}));

import { CustomerOperationsService } from "../../backend/src/customer/customerOperationsService";

const customerContext: RequestContext = {
  traceId: "trace-customer-showcase",
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  userId: "customer-a",
  requestStartedAt: "2026-07-21T00:00:00.000Z",
};

describe("customer worker capability showcase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only a privacy-safe display projection with no direct worker action data", async () => {
    pool.query.mockResolvedValueOnce([[
      {
        worker_id: "worker-private-id",
        display_name: "张三",
        skill_names: "家庭保洁\u001f家电清洗",
        rating_count: 20,
        rating_sum: 96,
        approved_cert_count: 2,
        phone: "13800000000",
        online_status: "online",
      },
    ]]);

    const response = await new CustomerOperationsService().listWorkerShowcase(customerContext);
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];

    expect(params).toEqual(["hangzhou"]);
    expect(sql).toContain("q.is_eligible=1");
    expect(sql).toContain("s.is_enabled=1");
    expect(sql).not.toMatch(/phone|latitude|longitude|online_status|dispatch_status/i);
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toEqual({
      showcaseId: expect.stringMatching(/^[a-f0-9]{16}$/),
      displayName: "张师傅",
      skillCategoryNames: ["家庭保洁", "家电清洗"],
      averageRating: 4.8,
      ratingCount: 20,
      certificationLabel: "平台认证",
    });
    expect(Object.keys(response.items[0] ?? {}).sort()).toEqual([
      "averageRating",
      "certificationLabel",
      "displayName",
      "ratingCount",
      "showcaseId",
      "skillCategoryNames",
    ]);
    expect(JSON.stringify(response)).not.toContain("worker-private-id");
    expect(JSON.stringify(response)).not.toContain("13800000000");
    expect(response.disclosure).toContain("不能联系、指定或直接预约师傅");
    expect(response.disclosure).toContain("平台统一派单");
  });

  it("rejects non-customer callers", async () => {
    await expect(new CustomerOperationsService().listWorkerShowcase({
      ...customerContext,
      appType: "worker",
      role: "worker",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
