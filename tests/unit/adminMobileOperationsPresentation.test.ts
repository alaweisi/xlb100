import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageRoot = "apps/admin/src/pages";
const pages = [
  "AdminOverviewPage.tsx",
  "EnterpriseOpsPage.tsx",
  "PlatformOperationsPage.tsx",
  "SupportTicketsPage.tsx",
  "SupportQualityPage.tsx",
  "SupportKnowledgeBasePage.tsx",
  "SupportRoutingConfigPage.tsx",
  "ReviewModerationPage.tsx",
  "MarketingOperationsPage.tsx",
];

describe("后台运营手机 App 呈现", () => {
  it("让首页与八个运营页共同使用移动任务台容器", () => {
    for (const page of pages) {
      const source = readFileSync(`${pageRoot}/${page}`, "utf8");
      expect(source, page).toContain("./mobile-ops.css");
      expect(source, page).toContain("mobile-ops");
    }
  });

  it("在 390 像素画面把宽表变为任务卡并保持触控尺寸", () => {
    const css = readFileSync(`${pageRoot}/mobile-ops.css`, "utf8");
    expect(css).toContain("max-width: 390px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".mobile-ops tbody tr");
    expect(css).toContain("display: block");
    expect(css).toContain("overflow-wrap: anywhere");
  });

  it("保留手机即时处理并标出复杂配置的办公自动化边界", () => {
    for (const page of ["EnterpriseOpsPage.tsx", "SupportTicketsPage.tsx", "SupportKnowledgeBasePage.tsx", "SupportRoutingConfigPage.tsx"]) {
      const source = readFileSync(`${pageRoot}/${page}`, "utf8");
      expect(source, page).toContain("承接边界");
      expect(source, page).toContain("手机端保留");
    }
    const knowledge = readFileSync(`${pageRoot}/SupportKnowledgeBasePage.tsx`, "utf8");
    expect(knowledge).toContain('className="mobile-ops__confirm-bar"');
    expect(knowledge).toContain("简体中文");
  });
});
