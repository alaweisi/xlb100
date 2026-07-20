// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCustomerSession,
  CUSTOMER_ORDER_HISTORY_KEY,
  CUSTOMER_PHONE_STORAGE_KEY,
  CUSTOMER_TOKEN_STORAGE_KEY,
  CUSTOMER_USER_ID_STORAGE_KEY,
  isValidCustomerPhone,
  loginCustomerWithOtp,
  readStoredCustomerSession,
  requestCustomerOtp,
} from "../../apps/customer/src/features/auth/customerAuth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Customer production OTP session", () => {
  it("requests and verifies a user-entered OTP without calling a debug endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        ok: true,
        expiresAt: "2030-01-01T00:05:00.000Z",
        ttlSeconds: 300,
        attemptsLeft: 5,
      }))
      .mockResolvedValueOnce(json({
        ok: true,
        token: "customer-access-token",
        userId: "customer-123",
        role: "customer",
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCustomerOtp("13800138000")).resolves.toMatchObject({ ttlSeconds: 300 });
    await expect(loginCustomerWithOtp("13800138000", "123456")).resolves.toEqual({
      token: "customer-access-token",
      userId: "customer-123",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/customer/code", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ phone: "13800138000" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/customer/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", code: "123456" }),
    }));
    expect(fetchMock.mock.calls.flat().join(" ")).not.toContain("debug-code");
    expect(readStoredCustomerSession()).toEqual({ token: "customer-access-token", userId: "customer-123" });
  });

  it("rejects malformed input before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isValidCustomerPhone("13800138000")).toBe(true);
    expect(isValidCustomerPhone("123")) .toBe(false);
    await expect(requestCustomerOtp("123")).rejects.toThrow(/11 位/u);
    await expect(loginCustomerWithOtp("13800138000", "123")).rejects.toThrow(/6 位/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears authentication and account-scoped local history on logout or 401", () => {
    window.localStorage.setItem(CUSTOMER_TOKEN_STORAGE_KEY, "token");
    window.localStorage.setItem(CUSTOMER_USER_ID_STORAGE_KEY, "customer-123");
    window.localStorage.setItem(CUSTOMER_PHONE_STORAGE_KEY, "13800138000");
    window.localStorage.setItem(CUSTOMER_ORDER_HISTORY_KEY, JSON.stringify(["order-1"]));

    clearCustomerSession();

    expect(window.localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOMER_USER_ID_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOMER_PHONE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOMER_ORDER_HISTORY_KEY)).toBeNull();
    expect(readStoredCustomerSession()).toBeNull();
  });
});
