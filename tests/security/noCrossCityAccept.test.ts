import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { workerHangzhouHeaders } from "../integration/helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("noCrossCityAccept", () => {
  it("returns 403 for worker not bound to request city", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/worker/tasks/dpt_fake/accept",
      headers: {
        ...workerHangzhouHeaders,
        "x-xlb-city-code": "shanghai",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
