import type { Pool, PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { FulfillmentEvidenceRepository } from "../../backend/src/fulfillment/evidence/fulfillmentEvidenceRepository.js";

const envelope = {
  provider: "cos" as const,
  providerName: "tencent-cos" as const,
  providerStatus: "stored_cos" as const,
  externalProviderExecuted: true,
  objectKey: "hangzhou/order/fulfillment/asset.png",
  storageUri: "cos://xlb-evidence-123456/hangzhou/order/fulfillment/asset.png",
  publicUrl: null,
  checksumSha256: "a".repeat(64),
  sizeBytes: 8,
  contentType: "image/png" as const,
  storedAt: "2026-07-16T00:00:00.000Z",
};

describe("COS evidence repository mapping", () => {
  it("persists the truthful external execution flag", async () => {
    const query = vi.fn(async () => [{ affectedRows: 1 }]);
    const repository = new FulfillmentEvidenceRepository({} as Pool);
    await repository.insertMediaAsset({ query } as unknown as PoolConnection, {
      mediaAssetId: "asset-1",
      cityCode: "hangzhou",
      orderId: "order-1",
      fulfillmentId: "fulfillment-1",
      complaintId: null,
      workerId: "worker-1",
      originalFileName: "asset.png",
      envelope,
    });
    const parameters = query.mock.calls[0]?.[1] as unknown[];
    expect(parameters).toContain("cos");
    expect(parameters).toContain("tencent-cos");
    expect(parameters).toContain("stored_cos");
    expect(parameters).toContain(1);
    expect(parameters).toContain(envelope.storageUri);
  });

  it("maps persisted COS rows without downgrading external execution", async () => {
    const query = vi.fn(async () => [[{
      media_asset_id: "asset-1",
      city_code: "hangzhou",
      order_id: "order-1",
      fulfillment_id: "fulfillment-1",
      complaint_id: null,
      uploaded_by_type: "worker",
      uploaded_by_id: "worker-1",
      original_file_name: "asset.png",
      content_type: "image/png",
      size_bytes: 8,
      checksum_sha256: "a".repeat(64),
      signature_validated: 1,
      security_scan_status: "not_malware_scanned_local",
      storage_provider: "cos",
      storage_provider_name: "tencent-cos",
      storage_provider_status: "stored_cos",
      external_provider_executed: 1,
      object_key: envelope.objectKey,
      storage_uri: envelope.storageUri,
      public_url: null,
      stored_at: new Date(envelope.storedAt),
      created_at: new Date(envelope.storedAt),
    }]]);
    const repository = new FulfillmentEvidenceRepository({ query } as unknown as Pool);
    await expect(repository.findMediaAsset("hangzhou", "asset-1")).resolves.toMatchObject({
      storage: { provider: "cos", externalProviderExecuted: true, storageUri: envelope.storageUri },
    });
  });
});
