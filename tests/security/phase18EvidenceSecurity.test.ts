import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";
import { buildApp } from "../../backend/src/app.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "../integration/helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "../integration/helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe("Phase 18 evidence security boundaries", () => {
  it("contains no real cloud provider implementation or public URL success path", async () => {
    const source = await readFile(new URL("../../backend/src/providers/objectStorage/objectStorageProvider.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/aliyun|amazon|aws-sdk|putObjectResult|https:\/\//i);
    expect(source).toContain("Only local or mock is allowed");
    expect(source).toContain("externalProviderExecuted: false");
    expect(source).toContain("publicUrl: null");
  });

  it.skipIf(!runDb)("enforces the HTTP upload size ceiling", async () => {
    await ensureHangzhouWorkerEligible();
    const app = await buildApp();
    try {
      const { fulfillmentId } = await createAcceptedFulfillment(app);
      const response = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=arrival`,
        headers: { ...workerHangzhouHeaders, "content-type": "image/png", "x-file-name": "oversize.png" },
        payload: Buffer.alloc(FULFILLMENT_EVIDENCE_MAX_BYTES + 1, 0x89),
      });
      expect(response.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});
