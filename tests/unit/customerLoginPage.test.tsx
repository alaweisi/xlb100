// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("keeps the unauthenticated surface inside the Customer mobile app frame", () => {
    const css = readFileSync(
      join(process.cwd(), "apps/customer/src/app/mobile-shell.css"),
      "utf8",
    );

    expect(css).toContain(".customer-auth-page {");
    expect(css).toContain(".customer-auth-panel {");
    expect(css).toContain("width: min(100%, 430px);");
    expect(css).toContain("min-height: 100dvh;");
  });

  it("requires a valid phone and user-entered six-digit code", async () => {
    const onLogin = vi.fn();
    render(<CustomerLoginPage onLogin={onLogin} />);

    const send = screen.getByRole("button", { name: "获取验证码" });
    const signIn = screen.getByRole("button", { name: "登录并继续" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect((signIn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.click(send);
    await screen.findByText(/验证码已发送/u);
    expect(authMocks.requestCustomerOtp).toHaveBeenCalledWith("13800138000");
    expect(screen.queryByRole("button", { name: /debug/iu })).toBeNull();

    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录并继续" }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({
      token: "customer-token",
      userId: "customer-123",
    }));
    expect(authMocks.loginCustomerWithOtp).toHaveBeenCalledWith("13800138000", "123456");
  });

  it("explains why an expired session returned to login", () => {
    render(<CustomerLoginPage reason="expired" onLogin={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("登录状态已失效，请重新登录。");
  });

  it("auto-fills an explicitly returned isolated cloud-test code", async () => {
    authMocks.requestCustomerOtp.mockResolvedValueOnce({
      ok: true,
      expiresAt: "2030-01-01T00:05:00.000Z",
      ttlSeconds: 300,
      attemptsLeft: 5,
      debugCode: "654321",
    });
    render(<CustomerLoginPage onLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800138000" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    await screen.findByText("隔离云测验证码：654321，已自动填入。");
    expect((screen.getByLabelText("短信验证码") as HTMLInputElement).value).toBe("654321");
  });
});
