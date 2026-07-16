import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createObjectStorageProvider,
  type PutObjectInput,
} from "../../backend/src/providers/objectStorage/objectStorageProvider.js";
import type { CosClient } from "../../backend/src/providers/objectStorage/tencentCosObjectStorageAdapter.js";

const roots: string[] = [];
const input: PutObjectInput = {
  objectKey: "hangzhou/order/fulfillment/asset.png",
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  contentType: "image/png",
  checksumSha256: "a".repeat(64),
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function cosEnvironment() {
  const root = await mkdtemp(join(tmpdir(), "xlb-cos-factory-"));
  roots.push(root);
  const secretId = join(root, "secret-id");
  const secretKey = join(root, "secret-key");
  await writeFile(secretId, "test-secret-id");
  await writeFile(secretKey, "test-secret-key");
  return {
    XLB_OBJECT_STORAGE_PROVIDER: "cos",
    XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED: "true",
    XLB_COS_BUCKET: "xlb-evidence-123456",
    XLB_COS_REGION: "ap-guangzhou",
    XLB_COS_SECRET_ID_FILE: secretId,
    XLB_COS_SECRET_KEY_FILE: secretKey,
  };
}

describe("Tencent COS provider factory", () => {
  it("rejects either half of the double switch", () => {
    expect(() => createObjectStorageProvider({ XLB_OBJECT_STORAGE_PROVIDER: "cos" }))
      .toThrow("XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true");
    expect(() => createObjectStorageProvider({ XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED: "true" }))
      .toThrow("XLB_OBJECT_STORAGE_PROVIDER=cos");
  });

  it("creates a private COS provider only with both switches and injected transport", async () => {
    const client: CosClient = {
      putObject: vi.fn(async () => ({} as never)),
      getObject: vi.fn(async () => ({ Body: input.bytes } as never)),
      deleteObject: vi.fn(async () => ({} as never)),
    };
    const provider = createObjectStorageProvider(await cosEnvironment(), { cosClient: client });
    expect(provider.kind).toBe("cos");
    await expect(provider.putObject(input)).resolves.toMatchObject({
      provider: "cos",
      providerName: "tencent-cos",
      providerStatus: "stored_cos",
      externalProviderExecuted: true,
      publicUrl: null,
    });
    expect(client.putObject).toHaveBeenCalledTimes(1);
  });
});
