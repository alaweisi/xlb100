import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@xlb/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared API client conditional request contract", () => {
  it("sends per-request If-None-Match and resolves 304 from the supplied cache value", async () => {
    const cached = { revision: "cached-revision" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 304,
      headers: { ETag: "\"cached-etag\"" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const metadata: Array<{ status: number; etag?: string }> = [];
    const client = createApiClient({
      baseUrl: "https://customer.test",
      headers: { Authorization: "Bearer token" },
      maxRetries: 0,
    });

    const result = await client.get("/api/customer/sdui/pages/customer.home/manifest", {
      headers: { "If-None-Match": "\"cached-etag\"" },
      notModifiedValue: cached,
      onResponseMetadata: (value) => {
        metadata.push({ status: value.status, etag: value.headers.etag });
      },
    });

    expect(result).toBe(cached);
    expect(metadata).toEqual([{ status: 304, etag: "\"cached-etag\"" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://customer.test/api/customer/sdui/pages/customer.home/manifest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "If-None-Match": "\"cached-etag\"",
        }),
      }),
    );
  });

  it("rejects a 304 response when the caller has no cached representation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    const client = createApiClient({ baseUrl: "https://customer.test", maxRetries: 0 });
    await expect(client.get("/manifest")).rejects.toMatchObject({
      kind: "http",
      status: 304,
    });
  });

  it("rejects a malformed cached representation instead of bypassing response validation on 304", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 304 })));
    const client = createApiClient({ baseUrl: "https://customer.test", maxRetries: 0 });

    await expect(client.get("/manifest", {
      notModifiedValue: { revision: 42 },
      validate: (value) => {
        const candidate = value as { revision?: unknown };
        if (typeof candidate.revision !== "string") throw new TypeError("revision must be a string");
        return { revision: candidate.revision };
      },
    })).rejects.toMatchObject({
      kind: "response_format",
      message: expect.stringContaining("cached response failed validation"),
    });
  });
});
