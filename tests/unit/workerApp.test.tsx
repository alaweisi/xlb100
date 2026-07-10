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
}));

vi.mock("@xlb/api-client", () => ({
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
  fireEvent.change(await screen.findByLabelText("code"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Login" }));
  expect(await screen.findByText(/Authenticated as worker-demo-hangzhou/)).toBeTruthy();
}

describe("Worker App API wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRoute("/worker/");
    mocks.requestWorkerLoginCode.mockResolvedValue({ ok: true, ttlSeconds: 300, expiresAt: "2026-07-09T01:05:00.000Z", attemptsLeft: 5 });
    mocks.getWorkerDebugCode.mockResolvedValue({ ok: true, code: "123456", expiresAt: "2026-07-09T01:05:00.000Z", attemptsLeft: 5 });
    mocks.workerLogin.mockResolvedValue(workerSession);
    mocks.getTaskPool.mockResolvedValue({ ok: true, cityCode: "hangzhou", tasks: [] });
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
  });

  afterEach(() => {
    cleanup();
  });

  it("requests a code, fills the local debug code, and logs in", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Code sent. It expires in 300s.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fill debug code" }));
    await waitFor(() => {
      expect(mocks.getWorkerDebugCode).toHaveBeenCalledWith("13800000001");
    });
    expect((screen.getByLabelText("code") as HTMLInputElement).value).toBe("123456");

    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByText(/Authenticated as worker-demo-hangzhou/)).toBeTruthy();
    expect(mocks.workerLogin).toHaveBeenCalledWith("13800000001", "123456");
  });

  it("shows an invalid-code login error", async () => {
    mocks.workerLogin.mockResolvedValueOnce({ ok: false, error: "invalid_code", statusCode: 400, attemptsLeft: 4 });
    render(<App />);

    fireEvent.change(await screen.findByLabelText("code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("invalid_code")).toBeTruthy();
    expect(screen.queryByText(/Authenticated as worker-demo-hangzhou/)).toBeNull();
  });

  it("renders task pool data after worker login", async () => {
    mocks.getTaskPool.mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });

    await renderAndLogin();

    expect(await screen.findByText("dispatch-1")).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();
    expect(screen.getByText("sku_home_daily_2h")).toBeTruthy();
    expect(screen.getByText("CNY 128.00")).toBeTruthy();
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

    expect(await screen.findByText("Worker Login")).toBeTruthy();
    expect(screen.queryByText(/Authenticated as worker-demo-hangzhou/)).toBeNull();
  });

  it("renders an empty task pool state", async () => {
    await renderAndLogin();

    expect(await screen.findByText("No queued task")).toBeTruthy();
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
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(1);
  });

  it("renders an empty fulfillment state", async () => {
    setRoute("/worker/tasks");

    await renderAndLogin();

    expect(await screen.findByText("No fulfillment yet")).toBeTruthy();
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

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mocks.acceptTask).toHaveBeenCalledWith("dispatch-1");
    });
    expect(await screen.findByText(/Accepted dispatch-1/)).toBeTruthy();
    expect(await screen.findByText("No queued task")).toBeTruthy();
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(2);
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(1);
  });

  it("shows an accept failure from the backend", async () => {
    mocks.getTaskPool.mockResolvedValueOnce({ ok: true, cityCode: "hangzhou", tasks: [queuedTask] });
    mocks.acceptTask.mockRejectedValueOnce(new Error("API POST /api/worker/tasks/dispatch-1/accept failed: 409"));

    await renderAndLogin();

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(await screen.findByText("Accept failed")).toBeTruthy();
    expect(screen.getByText("API POST /api/worker/tasks/dispatch-1/accept failed: 409")).toBeTruthy();
  });

  it("starts and completes a fulfillment, refreshing detail after each action", async () => {
    setRoute("/worker/tasks/ful-1");
    mocks.getFulfillment
      .mockResolvedValueOnce({ ok: true, fulfillment: acceptedFulfillment })
      .mockResolvedValueOnce({ ok: true, fulfillment: inProgressFulfillment })
      .mockResolvedValueOnce({ ok: true, fulfillment: completedFulfillment });

    await renderAndLogin();

    fireEvent.click(await screen.findByRole("button", { name: "Start service" }));
    await waitFor(() => {
      expect(mocks.startFulfillment).toHaveBeenCalledWith("ful-1");
    });
    expect(await screen.findByText(/Fulfillment ful-1 is now in_progress/)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "Complete service" }));
    await waitFor(() => {
      expect(mocks.completeFulfillment).toHaveBeenCalledWith("ful-1");
    });
    expect(await screen.findByText(/Fulfillment ful-1 is now completed/)).toBeTruthy();
    expect(mocks.getFulfillment).toHaveBeenCalledTimes(3);
    expect(mocks.getTaskPool).toHaveBeenCalledTimes(2);
    expect(mocks.getMyFulfillments).toHaveBeenCalledTimes(2);
  });

  it("submits certification through the existing worker certification API", async () => {
    setRoute("/worker/certification");

    await renderAndLogin();

    fireEvent.change(await screen.findByLabelText("certName"), {
      target: { value: "现场服务基础资格" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit certification" }));

    await waitFor(() => {
      expect(mocks.submitCertification).toHaveBeenCalledWith({
        certType: "home_service_basic",
        certName: "现场服务基础资格",
      });
    });
    expect(await screen.findByText(/Certification cert-1 submitted with status pending/)).toBeTruthy();
  });

  it("loads the real wallet and submits a withdrawal request",async()=>{
    setRoute("/worker/wallet");await renderAndLogin();
    expect(await screen.findByText("CNY 350.00")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount"),{target:{value:"100"}});
    fireEvent.click(screen.getByRole("button",{name:"Submit request"}));
    await waitFor(()=>expect(mocks.createWithdrawalRequest).toHaveBeenCalledWith(expect.objectContaining({bankAccountId:"bank-1",amount:100})));
  });

  it("loads and reports a private worker location",async()=>{
    setRoute("/worker/profile");await renderAndLogin();
    expect(await screen.findByText(/30.2741, 120.1551/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Report current location"}));
    await waitFor(()=>expect(mocks.upsertLocation).toHaveBeenCalledWith(expect.objectContaining({latitude:30.2741,longitude:120.1551,serviceRadiusKm:10,locationSharingEnabled:true})));
  });
});
