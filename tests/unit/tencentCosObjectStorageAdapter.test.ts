import COS from "cos-nodejs-sdk-v5";
import { describe, expect, it, vi } from "vitest";
import {
  TencentCosObjectStorageAdapter,
  TencentCosOperationError,
  type CosClient,
} from "../../backend/src/providers/objectStorage/tencentCosObjectStorageAdapter.js";

const config = {
  bucket: "xlb-evidence-1250000000",
  region: "ap-guangzhou",
  secretId: "unused-in-injected-test",
  secretKey: "unused-in-injected-test",
  timeoutMs: 10_000,
};
const bytes = Buffer.from("evidence");
const put = {
  objectKey: "hangzhou/order/fulfillment/asset.png",
  bytes,
  contentType: "image/png" as const,
  checksumSha256: "a".repeat(64),
};

function fakeClient(overrides: Partial<CosClient> = {}): CosClient {
  return {
    putObject: vi.fn(async (_params: COS.PutObjectParams) => ({
      ETag: "etag",
      Location: "private-location",
    })),
    getObject: vi.fn(async (_params: COS.GetObjectParams) => ({ Body: bytes, ETag: "etag" })),
    deleteObject: vi.fn(async (_params: COS.DeleteObjectParams) => ({})),
    ...overrides,
  };
}

describe("TencentCosObjectStorageAdapter", () => {
  it("uses a private object request and never exposes a public URL", async () => {
    const client = fakeClient();
    const receipt = await new TencentCosObjectStorageAdapter(config, client).putObject(put);
    expect(client.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: config.bucket,
      Region: config.region,
      Key: put.objectKey,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: "image/png",
      ACL: "private",
      Headers: { "x-cos-forbid-overwrite": "true" },
      "x-cos-meta-sha256": put.checksumSha256,
    }));
    expect(receipt).toMatchObject({
      provider: "cos",
      providerStatus: "stored_cos",
      externalProviderExecuted: true,
      storageUri: `cos://${config.bucket}/${put.objectKey}`,
      publicUrl: null,
    });
  });

  it("gets and deletes through the injected client", async () => {
    const client = fakeClient();
    const adapter = new TencentCosObjectStorageAdapter(config, client);
    await expect(adapter.getObject(put.objectKey, "image/png")).resolves.toEqual({
      bytes,
      contentType: "image/png",
    });
    await adapter.deleteObject(put.objectKey);
    expect(client.deleteObject).toHaveBeenCalledWith({
      Bucket: config.bucket,
      Region: config.region,
      Key: put.objectKey,
    });
  });

  it("blocks unsafe keys before any external request", async () => {
    const client = fakeClient();
    const adapter = new TencentCosObjectStorageAdapter(config, client);
    await expect(adapter.putObject({ ...put, objectKey: "../escape.png" }))
      .rejects.toThrow("unsafe object storage key");
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it("maps SDK failures without leaking request URLs or credentials", async () => {
    const client = fakeClient({
      putObject: vi.fn(async () => {
        throw {
          code: "AccessDenied",
          statusCode: 403,
          RequestId: "request-123",
          url: "https://secret-bearing-url.example",
          message: config.secretKey,
        };
      }),
    });
    const adapter = new TencentCosObjectStorageAdapter(config, client);
    const promise = adapter.putObject(put);
    await expect(promise).rejects.toMatchObject<TencentCosOperationError>({
      code: "AccessDenied",
      statusCode: 403,
      requestId: "request-123",
    });
    await expect(promise).rejects.not.toThrow(config.secretKey);
    await expect(promise).rejects.not.toThrow("secret-bearing-url");
  });
});
