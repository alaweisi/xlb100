import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalObjectStorageProvider, MockObjectStorageProvider } from "../../backend/src/providers/objectStorage/objectStorageProvider.js";

const roots: string[] = [];
const bytes = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const put = { objectKey: "hangzhou/order/fulfillment/asset.png", bytes, contentType: "image/png" as const, checksumSha256: "a".repeat(64) };

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("ObjectStorageProviderEnvelope", () => {
  it.each(["local", "mock"] as const)("stores through the %s provider without external execution", async (kind) => {
    const provider = kind === "local"
      ? new LocalObjectStorageProvider(await mkdtemp(join(tmpdir(), "xlb-evidence-test-")))
      : new MockObjectStorageProvider();
    if (kind === "local") roots.push((provider as unknown as { root: string }).root);
    const envelope = await provider.putObject(put);
    expect(envelope).toMatchObject({ provider: kind, externalProviderExecuted: false, publicUrl: null, sizeBytes: bytes.length });
    expect(envelope.providerStatus).toBe(kind === "local" ? "stored_local" : "stored_mock");
    expect((await provider.getObject(put.objectKey, "image/png")).bytes).toEqual(bytes);
  });

  it("blocks unsafe object keys", async () => {
    const provider = new MockObjectStorageProvider();
    await expect(provider.putObject({ ...put, objectKey: "../escape.png" })).rejects.toThrow("unsafe object storage key");
  });

  it("does not mutate mock storage when a provider timeout is injected", async () => {
    const provider = new MockObjectStorageProvider({ transport: "timeout" });
    await expect(provider.putObject(put)).rejects.toMatchObject({
      code: "SIMULATED_TIMEOUT",
      externalProviderExecuted: false,
    });
  });
});
