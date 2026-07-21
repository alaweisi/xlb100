// @vitest-environment jsdom
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  baseTokens,
  BottomSheet,
  Button,
  Card,
  customerComponentRecipe,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Tabs,
  ThemeProvider,
  createThemeStyle,
} from "@xlb/ui";

describe("Customer shared component system", () => {
  it("emits one canonical L5/L6 token tree and a reference-only recipe", () => {
    const style = createThemeStyle(baseTokens) as Record<string, string | number>;

    expect(baseTokens.role.customer.component.button.primaryBackground).toBe("#e97116");
    expect(baseTokens.role.customer.component.input.minHeight).toBe("48px");
    expect(baseTokens.role.customer.component.card.radius).toBe("24px");
    expect(baseTokens.role.customer.component.overlay.blur).toBe("18px");
    expect(style["--xlb-role-customer-component-button-primary-background"]).toBe("#e97116");
    expect(style["--xlb-font-size-page-title"]).toBe("28px");
    expect(customerComponentRecipe.sourceAuthority).toBe("docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md");
    expect(customerComponentRecipe.button.primaryBackground).toBe(
      "var(--xlb-role-customer-component-button-primary-background)",
    );
    expect(JSON.stringify(customerComponentRecipe)).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("keeps neutral defaults while Customer controls consume role/component variables", () => {
    render(
      <ThemeProvider>
        <Button>Neutral</Button>
        <Button productRole="customer" variant="primary">Customer primary</Button>
        <Input aria-label="Customer input" productRole="customer" placeholder="请输入" />
        <Card productRole="customer" title="服务卡">稳定内容</Card>
      </ThemeProvider>,
    );

    const neutral = screen.getByRole("button", { name: "Neutral" });
    const primary = screen.getByRole("button", { name: "Customer primary" });
    const input = screen.getByLabelText("Customer input");
    const card = screen.getByRole("heading", { name: "服务卡" }).closest("section");

    expect(neutral.dataset.xlbProductRole).toBe("neutral");
    expect(neutral.style.minHeight).toBe("36px");
    expect(primary.dataset.xlbProductRole).toBe("customer");
    expect(primary.style.background).toBe("var(--xlb-role-customer-component-button-primary-background)");
    expect(primary.style.minHeight).toBe("var(--xlb-role-customer-component-button-primary-min-height)");
    expect(input.dataset.xlbComponent).toBe("input");
    expect(input.style.minHeight).toBe("var(--xlb-role-customer-component-input-min-height)");
    expect(card?.dataset.xlbProductRole).toBe("customer");
    expect(card?.style.background).toBe("var(--xlb-role-customer-component-card-background)");
  });

  it("provides roving tab focus and Customer touch-target sizing", () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider>
        <Tabs
          activeKey="available"
          items={[
            { key: "available", label: "可用" },
            { key: "used", label: "已使用" },
            { key: "expired", label: "已过期", disabled: true },
          ]}
          onChange={onChange}
          productRole="customer"
        />
      </ThemeProvider>,
    );

    const available = screen.getByRole("tab", { name: "可用" });
    const used = screen.getByRole("tab", { name: "已使用" });
    expect(available.tabIndex).toBe(0);
    expect(used.tabIndex).toBe(-1);
    expect(available.style.minHeight).toBe("var(--xlb-role-customer-component-tabs-min-height)");

    available.focus();
    fireEvent.keyDown(available, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("used");
    expect(document.activeElement).toBe(used);
  });

  it("announces loading, empty and error states with persistent recovery regions", () => {
    render(
      <ThemeProvider>
        <LoadingState description="正在获取服务" productRole="customer" />
        <EmptyState action={<Button productRole="customer">重新选择</Button>} productRole="customer" title="暂无服务" />
        <ErrorState action={<Button productRole="customer">重试</Button>} description="网络连接失败" productRole="customer" title="加载失败" />
      </ThemeProvider>,
    );

    const loading = screen.getByText("加载中").closest('[data-xlb-component="state"]');
    expect(loading).not.toBeNull();
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("暂无服务").closest('[data-xlb-component="state"]')?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("alert").textContent).toContain("网络连接失败");
    expect(screen.getByRole("button", { name: "重试" })).not.toBeNull();
  });

  it("traps and restores focus and closes a dialog with Escape", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <ThemeProvider>
          <button onClick={() => setOpen(true)}>打开服务确认</button>
          <Modal onClose={() => setOpen(false)} open={open} productRole="customer" title="确认服务">
            <button>确认提交</button>
          </Modal>
        </ThemeProvider>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开服务确认" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "确认服务" });
    expect(dialog.dataset.xlbMaterial).toBe("glass");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭" }));
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the same accessible dialog contract for Drawer and BottomSheet", () => {
    const close = vi.fn();
    render(
      <ThemeProvider>
        <Drawer onClose={close} open productRole="customer" title="筛选服务"><button>应用筛选</button></Drawer>
        <BottomSheet onClose={close} open productRole="customer" title="选择时间"><button>确认时间</button></BottomSheet>
      </ThemeProvider>,
    );

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(2);
    expect(dialogs.map((dialog) => dialog.getAttribute("aria-modal"))).toEqual(["true", "true"]);
    expect(dialogs.every((dialog) => dialog.dataset.xlbProductRole === "customer")).toBe(true);
    expect(screen.getAllByRole("button", { name: "关闭" }).every((button) =>
      button.style.minHeight === "var(--xlb-role-customer-component-button-min-height)"
    )).toBe(true);
  });

  it("ships protected focus, reduced-motion, forced-colors and no-blur fallbacks", () => {
    render(<ThemeProvider><span>内容</span></ThemeProvider>);
    const styles = document.querySelector("style[data-xlb-component-system='true']")?.textContent ?? "";

    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("var(--xlb-border-focus)");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("forced-colors: active");
    expect(styles).toContain("@supports not");
    expect(styles).toContain("overlay-fallback-background");
  });
});
