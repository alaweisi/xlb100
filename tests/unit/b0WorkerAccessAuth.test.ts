import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  workerStatus: "suspended",
  otpResult: { ok: true } as { ok: boolean; error?: string; statusCode?: number },
  issueLoginOtp: vi.fn(),
  verifyLoginOtp: vi.fn(),
  sendLoginOtp: vi.fn(),
}));

vi.mock("../../backend/src/dal/mysqlPool.js", () => ({
  getMysqlPool: () => ({
    query: vi.fn(async () => [[{
      worker_id: "worker-b0-auth",
      phone_masked: "138****0001",
      status: state.workerStatus,
    }], []]),
  }),
}));

vi.mock("../../backend/src/auth/phoneIdentity.js", () => ({
  hashPhoneIdentity: () => "phone-hash",
  validateMainlandPhone: () => true,
}));

vi.mock("../../backend/src/auth/otpService.js", () => ({
  issueLoginOtp: state.issueLoginOtp,
  verifyLoginOtp: state.verifyLoginOtp,
  readDebugLoginOtp: vi.fn(),
}));

vi.mock("../../backend/src/providers/sms/mockSmsProvider.js", () => ({
  smsProvider: { sendLoginOtp: state.sendLoginOtp },
}));

vi.mock("../../backend/src/auth/tokenAuth.js", () => ({
  createToken: () => "worker-token",
  verifyToken: vi.fn(),
}));

import { requestWorkerLoginCode, workerLogin } from "../../backend/src/auth/authService.js";

describe("B0 师傅访问状态认证契约", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.workerStatus = "suspended";
    state.otpResult = { ok: true };
    state.issueLoginOtp.mockResolvedValue({ ok: true, code: "123456", expiresAt: "2026-07-17T10:00:00.000Z", ttlSeconds: 300, attemptsLeft: 5 });
    state.verifyLoginOtp.mockImplementation(async () => state.otpResult);
    state.sendLoginOtp.mockResolvedValue(undefined);
  });

  it("发送验证码时不暴露暂停或停用状态", async () => {
    const result = await requestWorkerLoginCode("13800000001");
    expect(result).toMatchObject({ ok: true, ttlSeconds: 300 });
    expect(result).not.toHaveProperty("workerAccessStatus");
  });

  it.each([
    ["suspended", "WORKER_ACCESS_SUSPENDED"],
    ["disabled", "WORKER_ACCESS_DISABLED"],
  ] as const)("验证码验证后返回 %s 权威状态且不签发令牌", async (workerStatus, code) => {
    state.workerStatus = workerStatus;
    const result = await workerLogin("13800000001", "123456");
    expect(result).toMatchObject({ ok: false, statusCode: 403, code, workerAccessStatus: workerStatus });
    expect(result).not.toHaveProperty("token");
  });

  it("验证码未通过时不暴露师傅访问状态", async () => {
    state.workerStatus = "disabled";
    state.otpResult = { ok: false, error: "invalid verification code", statusCode: 401 };
    const result = await workerLogin("13800000001", "000000");
    expect(result).toMatchObject({ ok: false, statusCode: 401 });
    expect(result).not.toHaveProperty("workerAccessStatus");
  });
});
