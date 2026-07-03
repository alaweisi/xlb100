import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = {
  [XLB_HEADERS.appType]: "worker",
  [XLB_HEADERS.role]: "worker",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "worker-demo-hangzhou",
};

const adminHangzhouHeaders = {
  [XLB_HEADERS.appType]: "admin",
  [XLB_HEADERS.role]: "operator",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "admin-hangzhou",
};

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
      headers: {
        ...adminHangzhouHeaders,
        [XLB_HEADERS.cityCode]: "shanghai",
      },
      payload: {},
    });
    expect(wrongCity.statusCode).toBe(403);

    await app.close();
  });
});
