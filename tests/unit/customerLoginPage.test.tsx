// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requestCustomerOtp: vi.fn(),
  loginCustomerWithOtp: vi.fn(),
}));

vi.mock("../../apps/customer/src/features/auth/customerAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/customer/src/features/auth/customerAuth")>();
  return {
    ...actual,
    requestCustomerOtp: authMocks.requestCustomerOtp,
    loginCustomerWithOtp: authMocks.loginCustomerWithOtp,
  };
});

import { CustomerLoginPage } from "../../apps/customer/src/pages/CustomerLoginPage";

beforeEach(() => {
  authMocks.requestCustomerOtp.mockReset().mockResolvedValue({
    ok: true,
    expiresAt: "2030-01-01T00:05:00.000Z",
    ttlSeconds: 300,
    attemptsLeft: 5,
  });
  authMocks.loginCustomerWithOtp.mockReset().mockResolvedValue({
    token: "customer-token",
    userId: "customer-123",
  });
});

describe("CustomerLoginPage", () => {
  it("requires a valid phone and user-entered six-digit code", async () => {
    const onLogin = vi.fn();
    render(<CustomerLoginPage onLogin={onLogin} />);

    const send = screen.getByRole("button", { name: "Send code" });
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect((signIn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "13800138000" } });
    fireEvent.click(send);
    await screen.findByText(/Verification code sent/u);
    expect(authMocks.requestCustomerOtp).toHaveBeenCalledWith("13800138000");
    expect(screen.queryByRole("button", { name: /debug/iu })).toBeNull();

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({
      token: "customer-token",
      userId: "customer-123",
    }));
    expect(authMocks.loginCustomerWithOtp).toHaveBeenCalledWith("13800138000", "123456");
  });

  it("explains why an expired session returned to login", () => {
    render(<CustomerLoginPage reason="expired" onLogin={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Your session expired. Please sign in again.");
  });
});
