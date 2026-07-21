import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 24D three-app conversation UI bindings", () => {
  it.each([
    ["customer", "apps/customer/src/pages/CustomerSupportPage.tsx"],
    ["worker", "apps/worker/src/pages/WorkerSupportPage.tsx"],
  ])("binds %s conversation create/list/detail and REST fallback", (_name, path) => {
    const page = source(path);
    expect(page).toContain("createConversation");
    expect(page).toContain("listConversations");
    expect(page).toContain("getConversation");
    expect(page).toContain("sendConversationMessage");
    expect(page).toMatch(/REST fallback|发送消息/u);
  });

  it("binds the Admin accept, transfer and close lifecycle", () => {
    const page = source("apps/admin/src/pages/SupportTicketsPage.tsx");
    expect(page).toContain("acceptSupportConversation");
    expect(page).toContain("transferSupportConversation");
    expect(page).toContain("closeSupportConversation");
    expect(page).toContain("Realtime conversation queue");
  });
});
