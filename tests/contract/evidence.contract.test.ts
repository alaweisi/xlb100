import { describe, expect, it } from "vitest";
import {
  decideFulfillmentConfirmationRequestSchema,
  objectStorageProviderEnvelopeSchema,
} from "@xlb/validators";

const envelope = {
  provider: "local",
  providerName: "xlb-local-filesystem",
  providerStatus: "stored_local",
  externalProviderExecuted: false,
  objectKey: "hangzhou/order/fulfillment/asset.png",
  storageUri: "xlb-local://hangzhou/order/fulfillment/asset.png",
  publicUrl: null,
  checksumSha256: "a".repeat(64),
  sizeBytes: 8,
  contentType: "image/png",
  storedAt: "2026-07-10T00:00:00.000Z",
};

describe("Phase 18 evidence contracts", () => {
  it("accepts only an honest local/mock provider envelope", () => {
    expect(objectStorageProviderEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(objectStorageProviderEnvelopeSchema.safeParse({ ...envelope, provider: "oss" }).success).toBe(false);
    expect(objectStorageProviderEnvelopeSchema.safeParse({ ...envelope, externalProviderExecuted: true }).success).toBe(false);
    expect(objectStorageProviderEnvelopeSchema.safeParse({ ...envelope, publicUrl: "https://oss.example/proof.png" }).success).toBe(false);
  });

  it("requires a complaint and note for customer disputes", () => {
    expect(decideFulfillmentConfirmationRequestSchema.safeParse({ decision: "confirmed" }).success).toBe(true);
    expect(decideFulfillmentConfirmationRequestSchema.safeParse({ decision: "disputed" }).success).toBe(false);
    expect(decideFulfillmentConfirmationRequestSchema.safeParse({ decision: "disputed", complaintId: "cmp-1", note: "result differs" }).success).toBe(true);
  });
});
