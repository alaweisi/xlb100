import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { adminAuthHeaders, workerAuthHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = workerAuthHeaders("worker-demo-hangzhou", "hangzhou");
const adminHangzhouHeaders = adminAuthHeaders("admin-hangzhou", "hangzhou");
const adminShanghaiHeaders = adminAuthHeaders("admin-hangzhou", "shanghai");

describe.skipIf(!runDb)("adminCertificationReview integration", { timeout: 20000 }, () => {
  it("requires admin city scope for approve", async () => {
    const app = await buildApp();
    const submit = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "scope测试资格",
      },
    });
    const certificationId = submit.json().certification.certificationId as string;

    const wrongCity = await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/approve`,
      headers: adminShanghaiHeaders,
      payload: {},
    });
    expect(wrongCity.statusCode).toBe(403);

    await app.close();
  });
});
