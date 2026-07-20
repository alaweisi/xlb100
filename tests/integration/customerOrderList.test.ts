import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const customerA = "wave2c-order-list-a";
const customerB = "wave2c-order-list-b";
const headersADeviceOne = bearerHeaders({ appType: "customer", role: "customer", userId: customerA, cityCode: "hangzhou" });
const headersADeviceTwo = bearerHeaders({ appType: "customer", role: "customer", userId: customerA, cityCode: "hangzhou" });
const headersB = bearerHeaders({ appType: "customer", role: "customer", userId: customerB, cityCode: "hangzhou" });
const headersAShanghai = bearerHeaders({ appType: "customer", role: "customer", userId: customerA, cityCode: "shanghai" });
const workerHeaders = bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou", cityCode: "hangzhou" });

describe.skipIf(!runDb)("customer order list, pagination and cross-device query", { timeout: 45_000 }, () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await getMysqlPool().query("DELETE FROM customers WHERE id IN (?, ?)", [customerA, customerB]);
    await getMysqlPool().query(
      "INSERT INTO customers(id, phone, name) VALUES(?, ?, ?), (?, ?, ?)",
      [customerA, "16690003001", "Wave2C A", customerB, "16690003002", "Wave2C B"],
    );
    for (let index = 0; index < 3; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: headersADeviceOne,
        payload: { skuId: "sku_home_daily_2h", quantity: 1, ...serviceAddressSchedulePayload },
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    const other = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: headersB,
      payload: { skuId: "sku_home_daily_2h", quantity: 1, ...serviceAddressSchedulePayload },
    });
    expect(other.statusCode, other.body).toBe(200);
  });

  afterAll(async () => {
    await getMysqlPool().query(
      "DELETE FROM event_outbox WHERE aggregate_id IN (SELECT order_id FROM orders WHERE customer_id IN (?, ?))",
      [customerA, customerB],
    );
    await getMysqlPool().query(
      "DELETE FROM order_price_snapshots WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id IN (?, ?))",
      [customerA, customerB],
    );
    await getMysqlPool().query("DELETE FROM orders WHERE customer_id IN (?, ?)", [customerA, customerB]);
    await getMysqlPool().query("DELETE FROM customers WHERE id IN (?, ?)", [customerA, customerB]);
    await app.close();
  });

  it("returns the same server-backed customer history on another device", async () => {
    const firstDevice = await app.inject({ method: "GET", url: "/api/customer/orders?limit=20", headers: headersADeviceOne });
    const secondDevice = await app.inject({ method: "GET", url: "/api/customer/orders?limit=20", headers: headersADeviceTwo });
    expect(firstDevice.statusCode, firstDevice.body).toBe(200);
    expect(secondDevice.statusCode, secondDevice.body).toBe(200);
    expect(secondDevice.json().orders.map((item: { orderId: string }) => item.orderId))
      .toEqual(firstDevice.json().orders.map((item: { orderId: string }) => item.orderId));
    expect(firstDevice.json().orders).toHaveLength(3);
    expect(firstDevice.json().orders.every((item: { customerId: string; cityCode: string }) =>
      item.customerId === customerA && item.cityCode === "hangzhou")).toBe(true);
  });

  it("uses stable cursor pages without duplicates", async () => {
    const first = await app.inject({ method: "GET", url: "/api/customer/orders?limit=2", headers: headersADeviceOne });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().orders).toHaveLength(2);
    expect(first.json().nextCursor).toEqual(expect.any(String));
    const second = await app.inject({
      method: "GET",
      url: `/api/customer/orders?limit=2&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: headersADeviceOne,
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().orders).toHaveLength(1);
    expect(second.json().nextCursor).toBeNull();
    const ids = [...first.json().orders, ...second.json().orders].map((item: { orderId: string }) => item.orderId);
    expect(new Set(ids).size).toBe(3);
  });

  it("fails closed for another customer, another city, tampering and non-customer apps", async () => {
    const first = await app.inject({ method: "GET", url: "/api/customer/orders?limit=1", headers: headersADeviceOne });
    const cursor = first.json().nextCursor as string;
    const tampered = Buffer.from(`${Buffer.from(cursor, "base64url").toString("utf8")}x`).toString("base64url");
    const calls = [
      app.inject({ method: "GET", url: `/api/customer/orders?cursor=${encodeURIComponent(cursor)}`, headers: headersB }),
      app.inject({ method: "GET", url: `/api/customer/orders?cursor=${encodeURIComponent(cursor)}`, headers: headersAShanghai }),
      app.inject({ method: "GET", url: `/api/customer/orders?cursor=${encodeURIComponent(tampered)}`, headers: headersADeviceOne }),
    ];
    for (const response of await Promise.all(calls)) expect(response.statusCode, response.body).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/customer/orders", headers: workerHeaders })).statusCode).toBe(403);
  });
});
