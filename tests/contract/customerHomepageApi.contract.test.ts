import { describe, expect, it, vi } from "vitest";
import { createCustomerOrderApi } from "../../packages/api-client/src/customer.js";
import type { ApiClient } from "../../packages/api-client/src/createApiClient.js";

describe("customer homepage API contract", () => {
  it("connects the worker capability showcase to its authenticated customer endpoint", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, items: [], disclosure: "" });
    const client = { get, post: vi.fn() } as unknown as ApiClient;

    await createCustomerOrderApi(client).listWorkerShowcase();

    expect(get).toHaveBeenCalledWith("/api/customer/worker-showcase");
  });
});
