// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerBottomNav } from "../../apps/customer/src/pages/customerPageShell";

afterEach(cleanup);

describe("B0 顾客端主导航", () => {
  it("中央加号打开全量服务目录，客服取代消息入口", () => {
    render(<CustomerBottomNav currentRoute="home" />);

    const serviceEntry = screen.getByRole("link", { name: "下单" });
    const supportEntry = screen.getByRole("link", { name: "客服" });

    expect(serviceEntry.getAttribute("href")).toBe("/customer/services");
    expect(serviceEntry.getAttribute("data-prominent")).toBe("true");
    expect(supportEntry.getAttribute("href")).toBe("/customer/support");
    expect(screen.queryByRole("link", { name: "消息" })).toBeNull();
  });
});
