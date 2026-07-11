import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "../../packages/api-client/src/auth.js";
import { createCustomerOrderApi } from "../../packages/api-client/src/customer.js";
import type { ApiClient, ApiRequestOptions } from "../../packages/api-client/src/createApiClient.js";
import { createWorkerApi } from "../../packages/api-client/src/worker.js";

function recordingClient() {
  const get = vi.fn().mockResolvedValue(undefined);
  const post = vi.fn().mockResolvedValue(undefined);
  const postBinary = vi.fn().mockResolvedValue(undefined);
  return { client: { get, post, postBinary } as ApiClient, get, post };
}

function validatorFrom(call: unknown[], optionIndex: number): NonNullable<ApiRequestOptions<unknown>["validate"]> {
  const options = call[optionIndex] as ApiRequestOptions<unknown> | undefined;
  expect(options?.validate).toBeTypeOf("function");
  return options!.validate!;
}

describe("critical API response validation wiring", () => {
  it("wires validators into every login and OTP request call", async () => {
    const { client, post } = recordingClient();
    const api = createAuthApi(client);
    await api.requestCustomerLoginCode("13800138000");
    await api.customerLogin("13800138000", "123456");
    await api.requestAdminLoginCode("admin");
    await api.adminLogin("admin", "123456");
    await api.requestWorkerLoginCode("13800138000");
    await api.workerLogin("13800138000", "123456");

    expect(post).toHaveBeenCalledTimes(6);
    for (const call of post.mock.calls) {
      expect(() => validatorFrom(call, 2)({ ok: true })).toThrow();
    }
    expect(() => validatorFrom(post.mock.calls[0]!, 2)({ ok: true, expiresAt: "2026-07-11T00:00:00Z", ttlSeconds: 300, attemptsLeft: 5 })).not.toThrow();
    expect(() => validatorFrom(post.mock.calls[1]!, 2)({ ok: true, token: "jwt", userId: "customer-1", role: "customer" })).not.toThrow();
  });

  it("wires validators into order and payment creation/read/mutation calls", async () => {
    const { client, get, post } = recordingClient();
    const api = createCustomerOrderApi(client);
    const orderBody = {
      skuId: "sku", quantity: 1, addressProvince: "ZJ", addressCity: "HZ",
      addressDistrict: "XH", detailAddress: "1", contactName: "A",
      contactPhone: "13800138000", scheduledAt: "2026-01-01T00:00:00Z",
      scheduledTimeSlot: "morning" as const,
    };
    await api.createOrder(orderBody);
    await api.getOrder("order-1");
    await api.confirmService("order-1");
    await api.createPaymentOrder({ orderId: "order-1" });
    await api.mockPaySuccess({ paymentOrderId: "pay-1", providerTradeNo: "mock-1", status: "paid" });

    expect(() => validatorFrom(post.mock.calls[0]!, 2)({ ok: true, order: {} })).toThrow();
    expect(() => validatorFrom(get.mock.calls[0]!, 1)({ ok: true, order: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[1]!, 2)({ ok: true, order: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[2]!, 2)({ ok: true, paymentOrder: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[3]!, 2)({ ok: true, paymentOrder: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[0]!, 2)({ ok: true, order: { orderId: "order-1", cityCode: "330100", customerId: "customer-1", skuId: "sku-1", status: "pending_dispatch", totalAmount: 100, currency: "CNY" } })).not.toThrow();
    expect(() => validatorFrom(post.mock.calls[2]!, 2)({ ok: true, paymentOrder: { paymentOrderId: "pay-1", orderId: "order-1", cityCode: "330100", status: "pending", amount: 100, currency: "CNY" } })).not.toThrow();
  });

  it("wires validators into task pool, accept, and fulfillment lifecycle calls", async () => {
    const { client, get, post } = recordingClient();
    const api = createWorkerApi(client);
    await api.getTaskPool();
    await api.acceptTask("task-1");
    await api.getMyFulfillments();
    await api.getFulfillment("fulfillment-1");
    await api.startFulfillment("fulfillment-1");
    await api.completeFulfillment("fulfillment-1");

    expect(() => validatorFrom(get.mock.calls[0]!, 1)({ ok: true, tasks: [{}] })).toThrow();
    expect(() => validatorFrom(post.mock.calls[0]!, 2)({ ok: true, acceptance: {}, fulfillment: {} })).toThrow();
    expect(() => validatorFrom(get.mock.calls[1]!, 1)({ ok: true, fulfillments: [{}] })).toThrow();
    expect(() => validatorFrom(get.mock.calls[2]!, 1)({ ok: true, fulfillment: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[1]!, 2)({ ok: true, fulfillment: {} })).toThrow();
    expect(() => validatorFrom(post.mock.calls[2]!, 2)({ ok: true, fulfillment: {} })).toThrow();
    expect(() => validatorFrom(get.mock.calls[0]!, 1)({ ok: true, cityCode: "330100", tasks: [] })).not.toThrow();
  });
});
