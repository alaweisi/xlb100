import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const supportRoot = join(
  process.cwd(),
  "apps/customer/src/features/support",
);

const conversationFiles = [
  "CustomerConversationActionController.ts",
  "CustomerConversationComponentRegistry.tsx",
  "CustomerConversationComponents.tsx",
  "CustomerConversationModule.ts",
  "CustomerConversationRoute.tsx",
  "CustomerConversationTemplate.tsx",
  "CustomerConversationTypes.ts",
];

function source(file: string): string {
  return readFileSync(join(supportRoot, file), "utf8");
}

describe("Customer CSL-16 GAP-07 source safety boundary", () => {
  it("contains no conversation API, realtime transport or fallback implementation", () => {
    const combined = conversationFiles.map(source).join("\n");
    for (const forbidden of [
      "@xlb/api-client",
      "createSupportConversation",
      "listSupportConversations",
      "getSupportConversation",
      "listSupportMessages",
      "sendSupportMessage",
      "markSupportConversationRead",
      "createSupportRealtimeTicket",
      "realtimeTicket",
      "/realtime-ticket",
      "submitSupportConversationCsat",
      "new WebSocket",
      "WebSocket(",
      "new EventSource",
      "EventSource(",
      "setInterval(",
      "fetch(",
      "XMLHttpRequest",
      "axios",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("contains no JWT URL seam or local message cache", () => {
    const combined = conversationFiles.map(source).join("\n");
    for (const forbidden of [
      "access_token=",
      "?token=",
      "jwt=",
      "accessToken",
      "Bearer ",
      "authorization:",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "messageCache",
      "optimisticMessages",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("pins L1 orchestration, GAP-07 blocking and fixed internal routes", () => {
    const module = source("CustomerConversationModule.ts");
    const route = source("CustomerConversationRoute.tsx");
    const controller = source("CustomerConversationActionController.ts");

    expect(module).toContain('orchestrationPolicy("L1")');
    expect(module).toContain('operationalManifest: "forbidden"');
    expect(route).toContain('"blocked_by_gap_07"');
    expect(route).toContain('"unavailable"');
    expect(controller).toContain('changeBrowserRoute("/support")');
    expect(controller).toContain('changeBrowserRoute("/support/tickets")');
  });
});
