import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("noCertificationWithoutCity", () => {
  it("returns 400 for __global__ cityCode on certification submit", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: {
        [XLB_HEADERS.appType]: "worker",
        [XLB_HEADERS.role]: "worker",
        [XLB_HEADERS.cityCode]: "__global__",
        [XLB_HEADERS.userId]: "worker-demo-hangzhou",
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
