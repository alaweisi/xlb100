import { describe, it, expect } from "vitest";
import {
  RepositoryBase,
  RepositoryContextError,
} from "../../backend/src/dal/repositoryBase.js";
import type { RequestContext } from "@xlb/types";

class TestRepository extends RepositoryBase {
  getContext(context?: RequestContext) {
    return this.requireContext(context);
  }
}

describe("repositoryBase", () => {
  it("requires RequestContext for queries", () => {
    const repo = new TestRepository();
    expect(() => repo.getContext()).toThrow(RepositoryContextError);
  });

  it("accepts valid RequestContext", () => {
    const repo = new TestRepository();
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "admin",
      role: "admin",
      cityCode: "hangzhou",
      requestStartedAt: new Date().toISOString(),
    };
    expect(repo.getContext(ctx)).toBe(ctx);
  });
});
