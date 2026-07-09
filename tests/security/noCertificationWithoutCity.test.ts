import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("noCertificationWithoutCity", () => {
  it("returns 400 for __global__ cityCode on certification submit", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: {
        ...bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou" }),
        [XLB_HEADERS.cityCode]: "__global__",
      },
      payload: {
        certType: "home_service_basic",
        certName: "test",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
