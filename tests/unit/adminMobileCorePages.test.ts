import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pages = [
  "SettlementOpsPage.tsx",
  "SettlementStatementDetailPage.tsx",
  "SettlementExportReviewPage.tsx",
  "SettlementActionGovernancePage.tsx",
  "OrderTracePage.tsx",
  "WorkerWithdrawalsPage.tsx",
  "AftersaleOpsPage.tsx",
  "DispatchBoardPage.tsx",
];

const pageRoot = path.resolve("apps/admin/src/pages");

describe("后台手机核心业务页", () => {
  it.each(pages)("%s 使用统一手机操作流且不再渲染桌面 Table", (file) => {
    const source = fs.readFileSync(path.join(pageRoot, file), "utf8");
    expect(source).toContain('import "./mobile-core.css"');
    expect(source).toContain("admin-mobile-core");
    expect(source).not.toMatch(/\bTable\b/);
  });

  it("统一样式锁定 390px 安全布局、触控尺寸和底部操作区", () => {
    const source = fs.readFileSync(path.join(pageRoot, "mobile-core.css"), "utf8");
    expect(source).toContain("min-height: 44px");
    expect(source).toContain("overflow-wrap: anywhere");
    expect(source).toContain(".admin-mobile-bottom-actions");
    expect(source).toContain("position: sticky");
    expect(source).toContain("@media (max-width: 430px)");
  });
});
