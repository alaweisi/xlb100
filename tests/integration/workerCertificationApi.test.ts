import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { adminAuthHeaders, bearerHeaders, workerAuthHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = workerAuthHeaders("worker-demo-hangzhou", "hangzhou");
const adminHangzhouHeaders = adminAuthHeaders("admin-hangzhou", "hangzhou");

describe.skipIf(!runDb)("workerCertificationApi integration", { timeout: 20000 }, () => {
  it("submits certification successfully", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "测试基础上门服务资格",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.certification.status).toBe("pending");
    expect(body.certification.cityCode).toBe("hangzhou");
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou" }),
      payload: {
        certType: "home_service_basic",
        certName: "测试",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe.skipIf(!runDb)("adminCertificationReview integration", { timeout: 20000 }, () => {
  it("approves pending certification and refreshes eligibility", async () => {
    const app = await buildApp();
    const submit = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "审核测试资格",
      },
    });
    const certificationId = submit.json().certification.certificationId as string;

    const approve = await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/approve`,
      headers: adminHangzhouHeaders,
      payload: {},
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().certification.status).toBe("approved");

    const eligibility = await app.inject({
      method: "GET",
      url: "/api/worker/eligibility?skuId=sku_home_daily_2h",
      headers: workerHangzhouHeaders,
    });
    expect(eligibility.statusCode).toBe(200);
    expect(eligibility.json().eligibility.isEligible).toBe(true);

    await app.close();
  });

  it("rejects pending certification with reason", async () => {
    const app = await buildApp();
    const submit = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "拒绝测试资格",
      },
    });
    const certificationId = submit.json().certification.certificationId as string;

    const reject = await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/reject`,
      headers: adminHangzhouHeaders,
      payload: { reason: "资料不完整" },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().certification.status).toBe("rejected");

    await app.close();
  });

  it("returns 409 for approved -> pending illegal transition on re-approve", async () => {
    const app = await buildApp();
    const submit = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "重复审核测试",
      },
    });
    const certificationId = submit.json().certification.certificationId as string;

    await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/approve`,
      headers: adminHangzhouHeaders,
      payload: {},
    });

    const second = await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/approve`,
      headers: adminHangzhouHeaders,
      payload: {},
    });
    expect(second.statusCode).toBe(409);

    await app.close();
  });

  it("returns 400 when reject missing reason", async () => {
    const app = await buildApp();
    const submit = await app.inject({
      method: "POST",
      url: "/api/worker/certifications",
      headers: workerHangzhouHeaders,
      payload: {
        certType: "home_service_basic",
        certName: "缺理由拒绝测试",
      },
    });
    const certificationId = submit.json().certification.certificationId as string;

    const reject = await app.inject({
      method: "POST",
      url: `/api/admin/certifications/${certificationId}/reject`,
      headers: adminHangzhouHeaders,
      payload: {},
    });
    expect(reject.statusCode).toBe(400);
    await app.close();
  });
});
