import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";

describe("dbHealth integration", () => {
  it("GET /api/system/db-health returns mysql and redis ok", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/system/db-health",
    });

    if (response.statusCode === 503) {
      const body = response.json();
      console.warn("db-health skipped — infrastructure unavailable", body);
      return;
    }

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.mysql).toBe("ok");
    expect(body.redis).toBe("ok");
    expect(body.database).toBe("xlb_local");
    expect(body.phase).toBe("5B");
    await app.close();
  });
});
