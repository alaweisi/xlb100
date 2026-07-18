// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table } from "@xlb/ui";
import {
  labelAdminMobileTables,
  observeAdminMobileTables,
} from "../../apps/admin/src/app/mobile-table-labels";

describe("运营 App 移动表格字段标签", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("@xlb/ui Table 为每个数据格提供可显示标签和表头关联", () => {
    render(
      <main className="admin-mobile-content">
        <Table
          columns={[
            { key: "order", title: "订单编号", render: (row: { orderId: string }) => row.orderId },
            {
              key: "action",
              title: <span aria-label="可用操作">•••</span>,
              mobileLabel: "操作",
              render: () => <button type="button">查看</button>,
            },
          ]}
          getRowKey={(row) => row.orderId}
          rows={[{ orderId: "ORD-1001" }]}
        />
      </main>,
    );

    const table = screen.getByRole("table");
    expect(table.classList.contains("xlb-responsive-table")).toBe(true);
    const cells = screen.getAllByRole("cell");
    expect(cells[0].getAttribute("data-label")).toBe("订单编号");
    expect(cells[1].getAttribute("data-label")).toBe("操作");
    expect(cells[0].getAttribute("headers")).toBe(screen.getByRole("columnheader", { name: "订单编号" }).id);
    expect(screen.getByRole("columnheader", { name: "订单编号" }).getAttribute("scope")).toBe("col");
  });

  it("为 admin 原生 table 自动补齐字段名，并保留页面自定义标签", () => {
    document.body.innerHTML = `
      <main class="admin-mobile-content">
        <table id="dispatches">
          <thead><tr><th>师傅</th><th>状态</th></tr></thead>
          <tbody><tr><td>张师傅</td><td data-label="当前进度">待接单</td></tr></tbody>
        </table>
      </main>`;

    labelAdminMobileTables(document);

    const headers = document.querySelectorAll("th");
    const cells = document.querySelectorAll("td");
    expect(cells[0].getAttribute("data-label")).toBe("师傅");
    expect(cells[0].getAttribute("headers")).toBe(headers[0].id);
    expect(cells[1].getAttribute("data-label")).toBe("当前进度");
    expect(headers[0].getAttribute("scope")).toBe("col");
  });

  it("异步装载的原生表格也会被观察器标注", async () => {
    document.body.innerHTML = '<main class="admin-mobile-content"></main>';
    const stop = observeAdminMobileTables(document);
    document.querySelector("main")!.innerHTML = `
      <table><thead><tr><th>工单状态</th></tr></thead><tbody><tr><td>处理中</td></tr></tbody></table>`;

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("td")?.getAttribute("data-label")).toBe("工单状态");
    stop();
  });

  it("移动样式将 data-label 作为卡片内可见字段名渲染", () => {
    const css = fs.readFileSync(path.resolve("apps/admin/src/app/mobile-tables.css"), "utf8");
    expect(css).toContain("tbody td[data-label]::before");
    expect(css).toContain("content: attr(data-label)");
    expect(css).toContain("grid-template-columns");
    expect(css).toContain(".admin-mobile-content tbody td[data-label]");
  });
});
