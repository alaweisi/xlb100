import assert from "node:assert/strict";

const backendPort = Number(process.env.XLB_TKE_BACKEND_PORT ?? 13000);
const frontendPorts = {
  customer: Number(process.env.XLB_TKE_CUSTOMER_PORT ?? 14173),
  worker: Number(process.env.XLB_TKE_WORKER_PORT ?? 14174),
  admin: Number(process.env.XLB_TKE_ADMIN_PORT ?? 14175),
};

async function get(path) {
  const response = await fetch(`http://127.0.0.1:${backendPort}${path}`);
  const text = await response.text();
  return { response, text };
}

const live = await get("/health/live");
assert.equal(live.response.status, 200);
assert.equal(JSON.parse(live.text).status, "live");

const ready = await get("/health/ready");
assert.equal(ready.response.status, 200, ready.text);
const readyPayload = JSON.parse(ready.text);
assert.equal(readyPayload.status, "ready");
assert.equal(readyPayload.database, "xlb_tke_acceptance");
assert.equal(readyPayload.mysql, "ok");
assert.equal(readyPayload.redis, "ok");

for (const [name, port] of Object.entries(frontendPorts)) {
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const body = await response.text();
  assert.equal(response.status, 200, `${name} returned ${response.status}`);
  assert.match(body, /<div\s+id="root"/i, `${name} did not serve its application shell`);
}

await new Promise((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${backendPort}/api/support/realtime?ticket=invalid`);
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("WebSocket invalid-ticket close timed out"));
  }, 10_000);
  socket.addEventListener("close", (event) => {
    clearTimeout(timer);
    try {
      assert.equal(event.code, 1008);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
  socket.addEventListener("error", () => {
    // The close event carries the contract assertion.
  });
});

const heartbeatDeadline = Date.now() + 60_000;
let heartbeat = 0;
while (Date.now() < heartbeatDeadline) {
  const metrics = await get("/metrics");
  assert.equal(metrics.response.status, 200);
  const match = metrics.text.match(/^xlb_job_worker_last_heartbeat_timestamp_seconds\s+([\d.]+)$/m);
  heartbeat = Number(match?.[1] ?? 0);
  if (heartbeat > 0) break;
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
assert.ok(heartbeat > 0, "jobs deployment did not publish a heartbeat");

console.log("tke-acceptance: backend, three frontends, WebSocket and jobs heartbeat passed");
