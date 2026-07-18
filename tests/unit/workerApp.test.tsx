// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../apps/worker/src/app/App";

const mocks = vi.hoisted(() => ({
  createApiClient: vi.fn((options: unknown) => ({ options })),
  requestWorkerLoginCode: vi.fn(),
  getWorkerDebugCode: vi.fn(),
  workerLogin: vi.fn(),
  getTaskPool: vi.fn(),
  acceptTask: vi.fn(),
  rejectTask: vi.fn(),
  simulateTaskTimeout: vi.fn(),
  getMyFulfillments: vi.fn(),
  getFulfillment: vi.fn(),
  startFulfillment: vi.fn(),
  completeFulfillment: vi.fn(),
  submitCertification: vi.fn(),
  getEligibility: vi.fn(),
  getReceivableBalance: vi.fn(),
  createBankAccount: vi.fn(),
  listBankAccounts: vi.fn(),
  createWithdrawalRequest: vi.fn(),
  listWithdrawalRequests: vi.fn(),
  getLocation: vi.fn(),
  upsertLocation: vi.fn(),
  listAftersaleRepairOrders: vi.fn(),
  startAftersaleRepairOrder: vi.fn(),
  completeAftersaleRepairOrder: vi.fn(),
  getFulfillmentEvidence: vi.fn(),
  uploadFulfillmentEvidence: vi.fn(),
}));

vi.mock("@xlb/api-client", () => ({
  ApiClientError: class MockApiClientError extends Error {},
  createApiClient: mocks.createApiClient,
  createAuthApi: () => ({
    requestWorkerLoginCode: mocks.requestWorkerLoginCode,
    getWorkerDebugCode: mocks.getWorkerDebugCode,
    workerLogin: mocks.workerLogin,
  }),
  workerApi: {
    create: () => ({
      getTaskPool: mocks.getTaskPool,
      acceptTask: mocks.acceptTask,
      rejectTask: mocks.rejectTask,
      simulateTaskTimeout: mocks.simulateTaskTimeout,
      getMyFulfillments: mocks.getMyFulfillments,
      getFulfillment: mocks.getFulfillment,
      startFulfillment: mocks.startFulfillment,
      completeFulfillment: mocks.completeFulfillment,
      submitCertification: mocks.submitCertification,
      getEligibility: mocks.getEligibility,
      getReceivableBalance: mocks.getReceivableBalance,
      createBankAccount: mocks.createBankAccount,
      listBankAccounts: mocks.listBankAccounts,
      createWithdrawalRequest: mocks.createWithdrawalRequest,
      listWithdrawalRequests: mocks.listWithdrawalRequests,
      getLocation: mocks.getLocation,
      upsertLocation: mocks.upsertLocation,
      listAftersaleRepairOrders: mocks.listAftersaleRepairOrders,
      startAftersaleRepairOrder: mocks.startAftersaleRepairOrder,
      completeAftersaleRepairOrder: mocks.completeAftersaleRepairOrder,
      getFulfillmentEvidence: mocks.getFulfillmentEvidence,
      uploadFulfillmentEvidence: mocks.uploadFulfillmentEvidence,
    }),
  },
}));

const workerSession = {
  ok: true,
  token: "test-worker-token",
  userId: "worker-demo-hangzhou",
  role: "worker",
};

const queuedTask = {
  dispatchTaskId: "dispatch-1",
  cityCode: "hangzhou",
  orderId: "order-1",
  skuId: "sku_home_daily_2h",
  amount: 128,
  streamName: "dispatch:hangzhou",
  status: "queued",
  createdAt: "2026-07-09T01:00:00.000Z",
};

const acceptedFulfillment = {
  fulfillmentId: "ful-1",
  acceptanceId: "acc-1",
  dispatchTaskId: "dispatch-1",
  orderId: "order-1",
  cityCode: "hangzhou",
  workerId: "worker-demo-hangzhou",
  skuId: "sku_home_daily_2h",
  status: "accepted",
  startedAt: null,
  completedAt: null,
  completionNote: null,
  createdAt: "2026-07-09T01:01:00.000Z",
  updatedAt: "2026-07-09T01:01:00.000Z",
};

const inProgressFulfillment = {
  ...acceptedFulfillment,
  status: "in_progress",
  startedAt: "2026-07-09T01:02:00.000Z",
  updatedAt: "2026-07-09T01:02:00.000Z",
};

const completedFulfillment = {
  ...inProgressFulfillment,
  status: "completed",
  completedAt: "2026-07-09T01:03:00.000Z",
  completionNote: "service completed",
  updatedAt: "2026-07-09T01:03:00.000Z",
};

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

async function renderAndLogin() {
  render(<App />);
  fireEvent.change(await screen.findByLabelText("短信验证码"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录并进入任务大厅" }));
  expect(await screen.findByText(/当前账号：worker-demo-hangzhou/)).toBeTruthy();
}

describe("Worker App API wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setRoute("/worker/");
    mocks.requestWorkerLoginCode.mockResolvedValue({ ok: true, ttlSeconds: 300, expiresAt: "2026-07-09T01:05:00.000Z", attemptsLeft: 5 });
    mocks.getWorkerDebugCode.mockResolvedValue({ ok: true, code: "123456", expiresAt: "2026-07-09T01:05:00.000Z", attemptsLeft: 5 });
    mocks.workerLogin.mockResolvedValue(workerSession);
    mocks.getTaskPool.mockResolvedValue({ ok: true, cityCode: "hangzhou", tasks: [] });
    mocks.getEligibility.mockImplementation(async (skuId) => ({ ok: true, eligibility: { workerId: "worker-demo-hangzhou", cityCode: "hangzhou", skuId, isEligible: true, reasons: [] } }));
    mocks.getMyFulfillments.mockResolvedValue({ ok: true, cityCode: "hangzhou", fulfillments: [] });
    mocks.getFulfillment.mockResolvedValue({ ok: true, fulfillment: acceptedFulfillment });
    mocks.acceptTask.mockResolvedValue({
      ok: true,
      acceptance: {
        acceptanceId: "acc-1",
        dispatchTaskId: "dispatch-1",
        cityCode: "hangzhou",
        orderId: "order-1",
        workerId: "worker-demo-hangzhou",
        skuId: "sku_home_daily_2h",
        status: "accepted",
        acceptedAt: "2026-07-09T01:01:00.000Z",
        createdAt: "2026-07-09T01:01:00.000Z",
        updatedAt: "2026-07-09T01:01:00.000Z",
      },
      fulfillment: acceptedFulfillment,
      idempotent: false,
    });
    mocks.startFulfillment.mockResolvedValue({ ok: true, fulfillment: inProgressFulfillment, idempotent: false });
    mocks.completeFulfillment.mockResolvedValue({ ok: true, fulfillment: completedFulfillment, idempotent: false });
    mocks.submitCertification.mockResolvedValue({
      ok: true,
      certification: {
        certificationId: "cert-1",
        workerId: "worker-demo-hangzhou",
        cityCode: "hangzhou",
        certType: "home_service_basic",
        certName: "基础上门服务资格",
        status: "pending",
        submittedAt: "2026-07-09T01:04:00.000Z",
        reviewedAt: null,
        reviewerId: null,
        rejectReason: null,
        createdAt: "2026-07-09T01:04:00.000Z",
        updatedAt: "2026-07-09T01:04:00.000Z",
      },
    });
    mocks.getReceivableBalance.mockResolvedValue({ok:true,balance:{cityCode:"hangzhou",workerId:"worker-demo-hangzhou",currency:"CNY",accruedAmount:500,adjustedAmount:0,requestedWithdrawalAmount:100,markedPaidAmount:50,availableAmount:350,createdAt:"2026-07-10T00:00:00.000Z",updatedAt:"2026-07-10T00:00:00.000Z"}});
    mocks.listBankAccounts.mockResolvedValue({ok:true,bankAccounts:[{bankAccountId:"bank-1",cityCode:"hangzhou",workerId:"worker-demo-hangzhou",accountHolder:"Worker",bankName:"XLB Bank",bankBranch:null,bankCardMasked:"**** 1234",bankCardLast4:"1234",status:"active",createdAt:"2026-07-10T00:00:00.000Z",updatedAt:"2026-07-10T00:00:00.000Z"}]});
    mocks.listWithdrawalRequests.mockResolvedValue({ok:true,withdrawals:[]});
    mocks.createBankAccount.mockResolvedValue({ok:true,bankAccount:{bankAccountId:"bank-2",bankCardLast4:"5678"}});
    mocks.createWithdrawalRequest.mockResolvedValue({ok:true,withdrawal:{withdrawalId:"wd-1"},balance:{availableAmount:250}});
    mocks.getLocation.mockResolvedValue({ok:true,location:{locationId:"loc-1",workerId:"worker-demo-hangzhou",cityCode:"hangzhou",latitude:30.2741,longitude:120.1551,accuracyMeters:20,capturedAt:"2026-07-10T00:00:00.000Z",expiresAt:"2026-07-10T00:10:00.000Z",source:"worker_device",privacyLevel:"private_exact",freshness:"fresh"}});
    mocks.upsertLocation.mockImplementation(async(body)=>({ok:true,location:{locationId:"loc-1",workerId:"worker-demo-hangzhou",cityCode:"hangzhou",...body,expiresAt:"2026-07-10T00:10:00.000Z",source:"worker_device",privacyLevel:"private_exact",freshness:"fresh"}}));
    mocks.listAftersaleRepairOrders.mockResolvedValue({ ok: true, repairOrders: [] });
    mocks.startAftersaleRepairOrder.mockResolvedValue({ ok: true });
    mocks.completeAftersaleRepairOrder.mockResolvedValue({ ok: true });
    mocks.getFulfillmentEvidence.mockResolvedValue({ ok: true, aggregate: { fulfillmentId: "ful-1", orderId: "order-1", cityCode: "hangzhou", fulfillmentStatus: "accepted", evidence: [], confirmation: null } });
    mocks.uploadFulfillmentEvidence.mockResolvedValue({ ok: true, evidence: { evidenceId: "evidence-1" } });
  });

  afterEach(() => {
    cleanup();
  });

  it("requests a code and logs in with the entered verification code", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "获取验证码" }));
    expect(await screen.findByText("验证码已发送，300 秒内有效。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: "登录并进入任务大厅" }));
    expect(await screen.findByText(/当前账号：worker-demo-hangzhou/)).toBeTruthy();
    expect(mocks.workerLogin).toHaveBeenCalledWith("13800000001", "123456");
    expect(window.localStorage.getItem("xlb.worker.session")).toContain("test-worker-token");
  });

  it("shows an invalid-code login error", async () => {
    mocks.workerLogin.mockResolvedValueOnce({ ok: false, error: "invalid_code", statusCode: 400, attemptsLeft: 4 });
    render(<App />);

    fireEvent.change(await screen.findByLabelText("短信验证码"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录并进入任务大厅" }));

    expect(await screen.findByText("验证码无效或已过期，请重新获取")).toBeTruthy();
    expect(screen.queryByText(/当前账号：worker-demo-hangzhou/)).toBeNull();
  });

  it.each([
    ["suspended", "WORKER_ACCESS_SUSPENDED", "师傅账号已暂停接单"],
    ["disabled", "WORKER_ACCESS_DISABLED", "师傅账号已停用"],
  ])("renders the %s access gate from the verified auth contract", async (workerAccessStatus, code, title) => {
    mocks.workerLogin.mockResolvedValueOnce({
      ok: false,
      error: `worker access is ${workerAccessStatus}`,
      statusCode: 403,
      code,
      workerAccessStatus,
    });
    render(<App />);
    fireEvent.change(await screen.findByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录并进入任务大厅" }));

    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByRole("button", { name: "联系平台客服" })).toBeTruthy();
    expect(screen.queryByText("待接任务大厅")).toBeNull();
  });

  it("renders task pool data after worker login", async () => {
    mocks.getTaskPool.mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });

    await renderAndLogin();

    expect(await screen.findByText("dispatch-1")).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();
    expect(screen.getByText("sku_home_daily_2h")).toBeTruthy();
    expect(screen.getByText("¥128.00")).toBeTruthy();
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(1);
    expect(mocks.createApiClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-xlb-city-code": "hangzhou",
          Authorization: "Bearer test-worker-token",
        }),
      }),
    );
  });

  it("returns to login when the token is missing or expired", async () => {
    mocks.getTaskPool.mockRejectedValueOnce(new Error("API GET /api/worker/task-pool failed: 401"));

    await renderAndLogin();

    expect(await screen.findByText("师傅身份验证")).toBeTruthy();
    expect(screen.queryByText(/当前账号：worker-demo-hangzhou/)).toBeNull();
  });

  it("renders an empty task pool state", async () => {
    await renderAndLogin();

    expect(await screen.findByText("当前没有待接任务")).toBeTruthy();
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(1);
  });

  it("renders fulfillment list data from getMyFulfillments", async () => {
    setRoute("/worker/tasks");
    mocks.getMyFulfillments.mockResolvedValueOnce({
      ok: true,
      cityCode: "hangzhou",
      fulfillments: [acceptedFulfillment],
    });

    await renderAndLogin();

    expect(await screen.findByText("ful-1")).toBeTruthy();
    expect(screen.getAllByText("待开始").length).toBeGreaterThan(0);
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(1);
  });

  it("renders an empty fulfillment state", async () => {
    setRoute("/worker/tasks");

    await renderAndLogin();

    expect(await screen.findByText("暂无履约任务")).toBeTruthy();
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(1);
  });

  it("accepts a task and refreshes task pool plus fulfillment list", async () => {
    mocks.getTaskPool
      .mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] })
      .mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [] });
    mocks.getMyFulfillments.mockResolvedValueOnce({
      ok: true,
      cityCode: "hangzhou",
      fulfillments: [acceptedFulfillment],
    });

    await renderAndLogin();

    fireEvent.click(await screen.findByRole("button", { name: "立即接单" }));

    await waitFor(() => {
      expect(mocks.acceptTask).toHaveBeenCalledWith("dispatch-1");
    });
    expect(await screen.findByText(/接单成功：任务 dispatch-1 已承接/)).toBeTruthy();
    expect(await screen.findByText("当前没有待接任务")).toBeTruthy();
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(2);
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(1);
  });

  it("reports a duplicate accept as safely handled", async () => {
    mocks.getTaskPool.mockResolvedValue({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });
    mocks.acceptTask.mockResolvedValueOnce({
      ok: true,
      acceptance: { acceptanceId: "acc-1", dispatchTaskId: "dispatch-1" },
      fulfillment: acceptedFulfillment,
      idempotent: true,
    });
    await renderAndLogin();
    fireEvent.click(await screen.findByRole("button", { name: "立即接单" }));
    expect(await screen.findByText(/重复接单请求已安全处理/)).toBeTruthy();
  });

  it("treats a failed platform response after mutation as an unknown result", async () => {
    mocks.getTaskPool.mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });
    mocks.acceptTask.mockRejectedValueOnce(new Error("API POST /api/worker/tasks/dispatch-1/accept failed: 503"));
    await renderAndLogin();
    fireEvent.click(await screen.findByRole("button", { name: "立即接单" }));
    expect(await screen.findByText("接单结果待确认")).toBeTruthy();
    expect(screen.getByText(/操作结果暂时未知/)).toBeTruthy();
  });

  it("shows an accept failure from the backend", async () => {
    mocks.getTaskPool.mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });
    mocks.acceptTask.mockRejectedValueOnce(new Error("API POST /api/worker/tasks/dispatch-1/accept failed: 409"));

    await renderAndLogin();

    fireEvent.click(await screen.findByRole("button", { name: "立即接单" }));

    expect(await screen.findByText("接单未完成")).toBeTruthy();
    expect(screen.getByText("业务状态已被其他操作更新，请刷新后再处理。")).toBeTruthy();
  });

  it("starts and completes a fulfillment, refreshing detail after each action", async () => {
    setRoute("/worker/tasks/ful-1");
    mocks.getFulfillment
      .mockResolvedValueOnce({ ok: true, fulfillment: acceptedFulfillment })
      .mockResolvedValueOnce({ ok: true, fulfillment: inProgressFulfillment })
      .mockResolvedValueOnce({ ok: true, fulfillment: completedFulfillment });

    await renderAndLogin();

    fireEvent.click(await screen.findByRole("button", { name: "开始服务" }, { timeout: 5000 }));
    await waitFor(() => {
      expect(mocks.startFulfillment).toHaveBeenCalledWith("ful-1");
    });
    expect(await screen.findByText(/已开始服务：履约单 ful-1 状态已同步/)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "登记完工" }, { timeout: 5000 }));
    await waitFor(() => {
      expect(mocks.completeFulfillment).toHaveBeenCalledWith("ful-1", { completionNote: undefined });
    });
    expect(await screen.findByText(/完工已登记：履约单 ful-1 正在等待顾客确认/)).toBeTruthy();
    expect(mocks.getFulfillment).toHaveBeenCalledTimes(3);
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(2);
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(2);
  });

  it("submits certification through the existing worker certification API", async () => {
    setRoute("/worker/certification");

    await renderAndLogin();

    fireEvent.change(await screen.findByLabelText("资格名称（最多 128 字）"), {
      target: { value: "现场服务基础资格" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交认证申请" }));

    await waitFor(() => {
      expect(mocks.submitCertification).toHaveBeenCalledWith({
        certType: "home_service_basic",
        certName: "现场服务基础资格",
      });
    });
    expect(await screen.findByText(/认证申请 cert-1 已提交，平台返回状态：待审核/)).toBeTruthy();
  });

  it("loads the real wallet and submits a withdrawal request",async()=>{
    setRoute("/worker/wallet");await renderAndLogin();
    expect(await screen.findByText("¥350.00")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("申请金额（人民币）"),{target:{value:"100"}});
    fireEvent.click(screen.getByRole("button",{name:"提交提现申请"}));
    await waitFor(()=>expect(mocks.createWithdrawalRequest).toHaveBeenCalledWith(expect.objectContaining({bankAccountId:"bank-1",amount:100})));
  });

  it("loads and reports a private worker location",async()=>{
    setRoute("/worker/profile");await renderAndLogin();
    expect(await screen.findByText(/30.2741, 120.1551/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"更新当前位置"}));
    await waitFor(()=>expect(mocks.upsertLocation).toHaveBeenCalledWith(expect.objectContaining({latitude:30.2741,longitude:120.1551,serviceRadiusKm:10,locationSharingEnabled:true})));
  });

  it.each([
    ["放弃邀约", mocks.rejectTask, { ok: true, task: { ...queuedTask, status: "reassigning" } }, /已放弃派单邀约 dispatch-1/],
    ["模拟邀约超时", mocks.simulateTaskTimeout, { ok: true, task: { ...queuedTask, status: "reassigning" } }, /开发验证：派单邀约 dispatch-1 已进入超时状态/],
  ])("runs the %s simulation control", async (button, mutation, response, notice) => {
    mocks.getTaskPool.mockResolvedValue({ ok: true, cityCode: "hangzhou", tasks: [{ ...queuedTask, status: "offering" }] });
    mutation.mockResolvedValueOnce(response);
    await renderAndLogin();
    fireEvent.click(await screen.findByRole("button", { name: button }));
    await waitFor(() => expect(mutation).toHaveBeenCalledWith("dispatch-1"));
    expect(await screen.findByText(notice)).toBeTruthy();
  });

  it("starts an assigned repair visit", async () => {
    setRoute("/worker/repairs");
    mocks.listAftersaleRepairOrders.mockResolvedValue({ ok: true, repairOrders: [{
      repairOrderId: "repair-1", orderId: "order-1", reason: "rework", status: "assigned",
    }] });
    await renderAndLogin();
    fireEvent.click(await screen.findByRole("button", { name: "开始返工" }));
    await waitFor(() => expect(mocks.startAftersaleRepairOrder).toHaveBeenCalledWith("repair-1"));
  });

  it("uploads fulfillment evidence with the selected metadata", async () => {
    setRoute("/worker/tasks/ful-1");
    await renderAndLogin();
    const file = new File(["image"], "arrival.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText(/现场图片/), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/证据说明/), { target: { value: "front door" } });
    fireEvent.click(screen.getByRole("button", { name: "上传证据" }));
    await waitFor(() => expect(mocks.uploadFulfillmentEvidence).toHaveBeenCalledWith("ful-1", file, {
      evidenceType: "before_service", note: "front door",
    }));
  });

  it("adds a bank account and logs out without retaining the session", async () => {
    setRoute("/worker/wallet");
    await renderAndLogin();
    fireEvent.change(await screen.findByLabelText("账户姓名（最多 128 字）"), { target: { value: "Worker" } });
    fireEvent.change(screen.getByLabelText("开户银行（最多 128 字）"), { target: { value: "XLB Bank" } });
    fireEvent.change(screen.getByLabelText("银行卡号（12～32 位，可含空格）"), { target: { value: "6222021234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "保存收款账户" }));
    await waitFor(() => expect(mocks.createBankAccount).toHaveBeenCalledWith({
      accountHolder: "Worker", bankName: "XLB Bank", bankCardNumber: "6222021234567890",
    }));
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(await screen.findByText("师傅身份验证")).toBeTruthy();
    expect(window.localStorage.getItem("xlb.worker.session")).toBeNull();
  });
});
