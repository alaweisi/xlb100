import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, createApiClient } from "../../packages/api-client/src/index.js";

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
  ...init,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API client reliability", () => {
  it("classifies network, HTTP, and response-format failures", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response('{"token":"secret-value","phone":"13800138000","padding":"' + "x".repeat(3_000) + '"}', { status: 400 }))
      .mockResolvedValueOnce(new Response("not-json"));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "https://api.example", maxRetries: 0 });

    await expect(client.get("/network")).rejects.toMatchObject({ kind: "network" });
    const httpError = await client.post("/http", {}).catch((error: unknown) => error) as ApiClientError;
    expect(httpError).toMatchObject({ kind: "http", status: 400 });
    expect(httpError.responseBody?.length).toBeLessThanOrEqual(2_048);
    expect(httpError.responseBody).not.toContain("secret-value");
    expect(httpError.responseBody).not.toContain("13800138000");
    await expect(client.get("/format")).rejects.toMatchObject({ kind: "response_format" });
  });

  it("distinguishes timeout from external cancellation and also maps body-read aborts", async () => {
    const abortingFetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", abortingFetch);
    const client = createApiClient({ baseUrl: "https://api.example", timeoutMs: 5, maxRetries: 0 });
    await expect(client.get("/slow")).rejects.toMatchObject({ kind: "timeout" });

    const external = new AbortController();
    const cancelled = client.get("/cancel", { signal: external.signal });
    external.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" });

    const bodyReadFetch = vi.fn((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    } as Response));
    vi.stubGlobal("fetch", bodyReadFetch);
    await expect(client.get("/slow-body")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("retries GET retryable failures but never POST or binary by default", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "", maxRetries: 1, retryDelayMs: 0 });

    await expect(client.get("/safe")).resolves.toEqual({ ok: true });
    await expect(client.post("/unsafe", {})).rejects.toMatchObject({ kind: "network" });
    await expect(client.postBinary("/binary", new Blob(["x"]), { contentType: "text/plain", fileName: "x.txt" }))
      .rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries an explicitly idempotent POST", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "", maxRetries: 1, retryDelayMs: 0 });
    await expect(client.post("/idempotent", {}, { retry: "idempotent" })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows callers to disable the otherwise-safe GET retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "", maxRetries: 2, retryDelayMs: 0 });
    await expect(client.get("/once", { retry: "none" })).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["numeric", "60"],
    ["HTTP-date", new Date(Date.now() + 60_000).toUTCString()],
  ])("honours but bounds %s Retry-After", async (_label, retryAfter) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": retryAfter } }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "", maxRetries: 1, maxRetryAfterMs: 5 });
    const started = Date.now();
    await expect(client.get("/limited")).resolves.toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns a failed runtime validator into response_format", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: true })));
    const client = createApiClient({ baseUrl: "", maxRetries: 0 });
    await expect(client.get("/shape", { validate: () => { throw new TypeError("missing id"); } }))
      .rejects.toMatchObject({ kind: "response_format" });
  });

  it("notifies the authenticated app when a request returns 401", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: "token expired" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));
    const client = createApiClient({ baseUrl: "", maxRetries: 0, onUnauthorized });

    const error = await client.get("/private").catch((caught: unknown) => caught) as ApiClientError;

    expect(error).toMatchObject({ kind: "http", status: 401, path: "/private" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith(error);
  });

  it("removes the external abort listener after a completed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: true })));
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const client = createApiClient({ baseUrl: "", maxRetries: 0 });
    await client.get("/done", { signal: controller.signal });
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
