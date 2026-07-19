import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Phase24F UI", () => {
  it("shows CSAT only for closed Support details and uses API confirmation", async () => {
    for (const file of [
      "apps/customer/src/pages/CustomerSupportPage.tsx",
      "apps/worker/src/pages/WorkerSupportPage.tsx",
    ]) {
      const text = await readFile(file, "utf8");
      expect(text).toMatch(/(?:status === "closed"|uiStateIs\([^\n]*status, "closed"\))/);
      expect(text).toContain("submitCsat");
      expect(text).toMatch(/Rate support 5\/5|评价客服 5 分/);
    }
  });

  it("provides navigable Admin rubric review dashboard", async () => {
    const page = await readFile("apps/admin/src/pages/SupportQualityPage.tsx", "utf8");
    const app = await readFile("apps/admin/src/app/App.tsx", "utf8");
    const hash = await readFile("apps/admin/src/hashParams.ts", "utf8");
    for (const token of [
      "createSupportQualityRubric",
      "createSupportQualityReview",
      "getSupportQualityDashboard",
    ]) {
      expect(page).toContain(token);
    }
    expect(app).toContain("客服质量");
    expect(hash).toContain("/support-quality");
  });
});
