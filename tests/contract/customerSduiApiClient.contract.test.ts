import { describe, expect, it } from "vitest";
import type { ApiClient } from "@xlb/api-client";
import { createCustomerSduiApi } from "@xlb/api-client";
import { validCustomerSduiDefinition } from "../helpers/customerSduiTestKit.js";

describe("Customer SDUI API client contract", () => {
  it("uses the dedicated read and idempotent control-plane endpoints", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown; retry?: string }> = [];
    const client = {
      get: async (path: string) => { calls.push({ method: "GET", path }); return {} as never; },
      post: async (path: string, body?: unknown, options?: { retry?: string }) => {
        calls.push({ method: "POST", path, body, retry: options?.retry }); return {} as never;
      },
      patch: async (path: string, body?: unknown, options?: { retry?: string }) => {
        calls.push({ method: "PATCH", path, body, retry: options?.retry }); return {} as never;
      },
      delete: async () => ({} as never),
      postBinary: async () => ({} as never),
    } as ApiClient;
    const api = createCustomerSduiApi(client);

    await api.getPublishedManifest("customer.home", { appVersion: "1.2.3", locale: "zh-CN" });
    await api.createDraft("customer.home", {
      definition: validCustomerSduiDefinition(), idempotencyKey: "api-client-create-1",
    });
    await api.updateDraft("customer.home", "sdui_rev_1", {
      expectedVersion: 1, definition: validCustomerSduiDefinition(), idempotencyKey: "api-client-update-1",
    });
    await api.setKillSwitch("customer.home", {
      expectedVersion: 1, enabled: true, reason: "safety stop", idempotencyKey: "api-client-kill-1",
    });

    expect(calls[0]).toEqual({
      method: "GET",
      path: "/api/customer/sdui/pages/customer.home/manifest?appVersion=1.2.3&locale=zh-CN",
    });
    expect(calls.slice(1).every((call) => call.retry === "idempotent")).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(expect.arrayContaining([
      "POST /api/internal/customer-sdui/pages/customer.home/revisions",
      "PATCH /api/internal/customer-sdui/pages/customer.home/revisions/sdui_rev_1",
      "POST /api/internal/customer-sdui/pages/customer.home/kill-switch",
    ]));
  });
});
