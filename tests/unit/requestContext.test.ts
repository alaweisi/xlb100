import { describe, it, expect } from "vitest";
import { requestContextSchema } from "@xlb/validators";

describe("requestContext", () => {
  it("validates minimal request context", () => {
    const result = requestContextSchema.safeParse({
      traceId: "trace-1",
      appType: "customer",
      role: "customer",
    });
    expect(result.success).toBe(true);
  });

  it.todo("Phase 1: enforce city_code rules");
});
