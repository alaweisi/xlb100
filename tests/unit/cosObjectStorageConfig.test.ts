import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCosObjectStorageConfig } from "../../packages/config/src/cosObjectStorage.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function secretEnvironment(): Promise<Record<string, string>> {
  const root = await mkdtemp(join(tmpdir(), "xlb-cos-config-"));
  roots.push(root);
  const secretIdFile = join(root, "secret-id");
  const secretKeyFile = join(root, "secret-key");
  await Promise.all([
    writeFile(secretIdFile, "test-secret-id\n"),
    writeFile(secretKeyFile, "test-secret-key\n"),
  ]);
  return {
    XLB_COS_BUCKET: "xlb-evidence-1250000000",
    XLB_COS_REGION: "ap-guangzhou",
    XLB_COS_SECRET_ID_FILE: secretIdFile,
    XLB_COS_SECRET_KEY_FILE: secretKeyFile,
  };
}

describe("Tencent COS configuration", () => {
  it("loads credentials from mounted files and applies a bounded timeout", async () => {
    const config = loadCosObjectStorageConfig(await secretEnvironment());
    expect(config).toEqual({
      bucket: "xlb-evidence-1250000000",
      region: "ap-guangzhou",
      secretId: "test-secret-id",
      secretKey: "test-secret-key",
      timeoutMs: 10_000,
    });
  });

  it("does not accept inline credentials as a substitute for secret files", async () => {
    const environment = await secretEnvironment();
    delete environment.XLB_COS_SECRET_ID_FILE;
    Object.assign(environment, { XLB_COS_SECRET_ID: "inline-secret" });
    expect(() => loadCosObjectStorageConfig(environment)).toThrow(
      "XLB_COS_SECRET_ID_FILE is required",
    );
  });

  it("rejects malformed bucket, region, and timeout values", async () => {
    const environment = await secretEnvironment();
    expect(() => loadCosObjectStorageConfig({ ...environment, XLB_COS_BUCKET: "no-appid" }))
      .toThrow("XLB_COS_BUCKET");
    expect(() => loadCosObjectStorageConfig({ ...environment, XLB_COS_REGION: "guangzhou" }))
      .toThrow("XLB_COS_REGION");
    expect(() => loadCosObjectStorageConfig({ ...environment, XLB_COS_TIMEOUT_MS: "999" }))
      .toThrow("XLB_COS_TIMEOUT_MS");
  });
});
