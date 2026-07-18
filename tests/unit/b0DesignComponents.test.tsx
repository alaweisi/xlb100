// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AppleServiceCard,
  Button,
  IdentityGate,
  Input,
  LiquidGlassSurface,
  PermissionState,
} from "@xlb/ui";

afterEach(cleanup);

describe("B0 code-first design components", () => {
  it("keeps liquid glass on an explicit functional layer", () => {
    const { container } = render(
      <LiquidGlassSurface purpose="navigation" visualRole="customer">
        导航
      </LiquidGlassSurface>,
    );

    const surface = container.querySelector('[data-liquid-glass="navigation"]');
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-visual-role")).toBe("customer");
  });

  it("renders the Apple-style service card through the existing service-card contract", () => {
    const { container } = render(
      <AppleServiceCard title="水槽漏水维修" subtitle="已上传现场说明" priceText="¥168–260" actionLabel="查看详情" />,
    );

    expect(screen.getByText("水槽漏水维修")).toBeTruthy();
    expect(screen.getByText("¥168–260")).toBeTruthy();
    expect(container.querySelector('[data-service-card="apple"]')).not.toBeNull();
  });

  it("exposes identity recovery and errors without owning authentication logic", () => {
    const { container } = render(
      <IdentityGate
        visualRole="worker"
        title="师傅登录"
        description="验证身份后进入任务大厅"
        recoveryTarget="登录后返回：待接任务"
        form={<Input aria-label="验证码" />}
        actions={<Button variant="primary">登录</Button>}
        error="验证码已过期"
      />,
    );

    expect(screen.getByRole("heading", { name: "师傅登录" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("验证码已过期");
    expect(container.querySelector("[data-gate-recovery-target]")).not.toBeNull();
  });

  it("uses an assertive operational state for permission denial", () => {
    const { container } = render(
      <PermissionState title="无权访问此城市" description="当前账号仅可查看杭州" action={<Button>返回杭州</Button>} />,
    );

    const state = container.querySelector('[data-operational-state="permission"]');
    expect(state?.getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByRole("button", { name: "返回杭州" })).toBeTruthy();
  });
});
