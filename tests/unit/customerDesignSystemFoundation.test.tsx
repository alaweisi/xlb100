// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BrandLogo,
  BrandLogoProvider,
  CustomerButton,
  CustomerComponentRegistry,
  CustomerDesignSystemRoot,
  CustomerStatePanel,
  customerThemeTokens,
} from "@xlb/customer-components";

describe("Customer design-system foundation", () => {
  it("uses the approved Customer palette without changing shared base tokens", () => {
    expect(customerThemeTokens.surface.page).toBe("#CFEFEF");
    expect(customerThemeTokens.color.accent).toBe("#FF6A00");
    expect(customerThemeTokens.text.primary).toBe("#1F2D2D");
  });

  it("renders xlb100 by default and supports runtime brand replacement", () => {
    const { rerender } = render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "xlb100" }).textContent).toContain("xlb100");

    rerender(
      <BrandLogoProvider value={{ kind: "image", src: "/brand/new-mark.png", accessibleName: "喜乐帮", fallbackText: "xlb100" }}>
        <BrandLogo />
      </BrandLogoProvider>,
    );

    const logo = screen.getByRole("img", { name: "喜乐帮" });
    const image = logo.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/brand/new-mark.png");
    fireEvent.error(image!);
    expect(screen.getByRole("img", { name: "喜乐帮" }).textContent).toContain("xlb100");
  });

  it("applies the Customer theme and preserves accessible action states", () => {
    render(
      <CustomerDesignSystemRoot>
        <CustomerButton busy>提交订单</CustomerButton>
        <CustomerStatePanel kind="error" title="加载失败" description="请稍后重试" />
      </CustomerDesignSystemRoot>,
    );

    const submit = screen.getByRole("button", { name: "提交订单" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("加载失败");
  });

  it("registers dynamic page components deterministically", () => {
    type Type = "service_grid" | "recommend_list";
    type Props = { title: string };
    const registry = new CustomerComponentRegistry<Type, Props>();
    const ServiceGrid = ({ title }: Props) => <section>{title}</section>;

    registry.register("service_grid", ServiceGrid);

    expect(registry.has("service_grid")).toBe(true);
    expect(registry.resolve("service_grid")).toBe(ServiceGrid);
    expect(registry.resolve("recommend_list")).toBeNull();
    expect(registry.list()).toEqual(["service_grid"]);
    expect(() => registry.register("service_grid", ServiceGrid)).toThrow(/already registered/);
  });
});
