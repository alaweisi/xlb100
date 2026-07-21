// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerBottomNav } from "../../apps/customer/src/pages/customerPageShell";

afterEach(cleanup);

describe("B0 顾客端主导航", () => {
  it("提供首页、客服、新报修、订单和我的五项核心入口", () => {
    render(<CustomerBottomNav currentRoute="home" />);

    const createOrderEntry = screen.getByRole("link", { name: "新报修" });
    const supportEntry = screen.getByRole("link", { name: "客服" });

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["首页", "客服", "新报修", "订单", "我的"]);
    expect(createOrderEntry.getAttribute("href")).toBe("/customer/order/create");
    expect(createOrderEntry.getAttribute("data-prominent")).toBe("true");
    expect(supportEntry.getAttribute("href")).toBe("/customer/support");
  });
});
