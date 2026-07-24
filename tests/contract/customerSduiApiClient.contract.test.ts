import { describe, expect, it } from "vitest";
import type { ApiClient } from "@xlb/api-client";
import { createCustomerSduiApi } from "@xlb/api-client";
import { validCustomerSduiDefinition } from "../helpers/customerSduiTestKit.js";

describe("Customer SDUI API client contract", () => {
  it("uses the dedicated read and idempotent control-plane endpoints", async () => {
    const calls: Array<{
      method: string;
      path: string;
      body?: unknown;
      retry?: string;
      validated?: boolean;
      headers?: Record<string, string>;
    }> = [];
    const client = {
      get: async (path: string, options?: {
        validate?: unknown;
        headers?: Record<string, string>;
        notModifiedValue?: unknown;
        onResponseMetadata?: (value: { status: number; headers: Record<string, string> }) => void;
      }) => {
        calls.push({
          method: "GET",
          path,
          validated: typeof options?.validate === "function",
          headers: options?.headers,
        });
        if (options?.notModifiedValue !== undefined) {
          options.onResponseMetadata?.({ status: 304, headers: { etag: "\"cached-etag\"" } });
          return options.notModifiedValue as never;
        }
        return {} as never;
      },
      post: async (path: string, body?: unknown, options?: { retry?: string; validate?: unknown }) => {
        calls.push({
          method: "POST", path, body, retry: options?.retry, validated: typeof options?.validate === "function",
        }); return {} as never;
      },
      patch: async (path: string, body?: unknown, options?: { retry?: string; validate?: unknown }) => {
        calls.push({
          method: "PATCH", path, body, retry: options?.retry, validated: typeof options?.validate === "function",
        }); return {} as never;
      },
      delete: async () => ({} as never),
      postBinary: async () => ({} as never),
    } as ApiClient;
    const api = createCustomerSduiApi(client);

    await api.getPublishedManifest("customer.home", { appVersion: "1.2.3", locale: "zh-CN" });
    const cachedEnvelope = { schemaVersion: "1.0" } as never;
    const conditional = await api.getPublishedManifestConditional(
      "customer.home",
      { appVersion: "1.2.3", locale: "zh-CN" },
      { etag: "\"cached-etag\"", envelope: cachedEnvelope },
    );
    await api.listRevisions("customer.home", { status: "published", cursor: "10", limit: 25 });
    await api.getRevision("customer.home", "sdui_rev_1");
    await api.getKillSwitch("customer.home");
    await api.listAudits("customer.home", { action: "publish", revisionId: "sdui_rev_1", limit: 20 });
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
      validated: true,
      headers: undefined,
    });
    expect(calls[1]).toMatchObject({
      method: "GET",
      headers: { "If-None-Match": "\"cached-etag\"" },
      validated: true,
    });
    expect(conditional).toEqual({
      etag: "\"cached-etag\"",
      envelope: cachedEnvelope,
      notModified: true,
    });
    expect(calls.filter((call) => call.method !== "GET").every((call) => call.retry === "idempotent")).toBe(true);
    expect(calls.every((call) => call.validated)).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(expect.arrayContaining([
      "POST /api/internal/customer-sdui/pages/customer.home/revisions",
      "GET /api/internal/customer-sdui/pages/customer.home/revisions?status=published&cursor=10&limit=25",
      "GET /api/internal/customer-sdui/pages/customer.home/revisions/sdui_rev_1",
      "GET /api/internal/customer-sdui/pages/customer.home/kill-switch",
      "GET /api/internal/customer-sdui/pages/customer.home/audits?action=publish&revisionId=sdui_rev_1&limit=20",
      "PATCH /api/internal/customer-sdui/pages/customer.home/revisions/sdui_rev_1",
      "POST /api/internal/customer-sdui/pages/customer.home/kill-switch",
    ]));
  });

  it("accepts a no-store safety envelope without requiring an ETag", async () => {
    const safetyEnvelope = {
      schemaVersion: "1.0",
      resolutionReason: "kill_switch",
      killSwitchActive: true,
      manifest: null,
    } as never;
    const client = {
      get: async (_path: string, options?: {
        onResponseMetadata?: (value: {
          status: number;
          headers: Record<string, string>;
        }) => void;
      }) => {
        options?.onResponseMetadata?.({ status: 200, headers: {} });
        return safetyEnvelope;
      },
      post: async () => ({} as never),
      patch: async () => ({} as never),
      delete: async () => ({} as never),
      postBinary: async () => ({} as never),
    } as ApiClient;

    const result = await createCustomerSduiApi(client).getPublishedManifestConditional(
      "customer.home",
      { appVersion: "2.0.0", locale: "zh-CN" },
      { etag: "\"stale-published-etag\"", envelope: {} as never },
    );

    expect(result).toEqual({
      etag: null,
      envelope: safetyEnvelope,
      notModified: false,
    });
  });
});
