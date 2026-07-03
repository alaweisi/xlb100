import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { buildApp } from "../../backend/src/app.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createQueuedDispatchTask,
  workerHangzhouHeaders,
} from "../integration/helpers/acceptTestHelper.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe("noFulfillmentCompleteInPhase7A", () => {
  it("gate script check-no-fulfillment-complete-in-phase7a.ps1 passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-fulfillment-complete-in-phase7a.ps1")}"`,
      { encoding: "utf-8" },
    );
  });

  it.skipIf(!runDb)("complete endpoint returns 404", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    const fulfillmentId = acceptRes.json().fulfillment.fulfillmentId as string;

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect([404, 405]).toContain(res.statusCode);
    await app.close();
  });
});
