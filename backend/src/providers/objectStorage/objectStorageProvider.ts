import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { loadProviderReadinessConfig } from "@xlb/config";
import type { ObjectStorageProviderEnvelope, ObjectStorageProviderKind } from "@xlb/types";
import type { ProviderFaultPlan } from "../providerSimulation.js";
import { applyProviderFault } from "../providerSimulation.js";

export interface PutObjectInput {
  objectKey: string;
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  checksumSha256: string;
}

export interface StoredObject {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

export interface ObjectStorageProvider {
  readonly kind: ObjectStorageProviderKind;
  putObject(input: PutObjectInput): Promise<ObjectStorageProviderEnvelope>;
  getObject(objectKey: string, contentType: StoredObject["contentType"]): Promise<StoredObject>;
  deleteObject(objectKey: string): Promise<void>;
}

function assertSafeObjectKey(objectKey: string): void {
  if (!/^[a-z0-9][a-z0-9/_-]*\.(?:jpg|png|webp)$/.test(objectKey) || objectKey.includes("..")) {
    throw new Error("unsafe object storage key");
  }
}

export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly kind = "local" as const;

  constructor(
    private readonly root = process.env.XLB_OBJECT_STORAGE_ROOT ?? join(tmpdir(), "xlb-object-storage"),
    private readonly faultPlan: ProviderFaultPlan = {},
  ) {}

  private resolvePath(objectKey: string): string {
    assertSafeObjectKey(objectKey);
    const root = resolve(this.root);
    const target = resolve(root, ...objectKey.split("/"));
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("object key escapes local storage root");
    return target;
  }

  async putObject(input: PutObjectInput): Promise<ObjectStorageProviderEnvelope> {
    await applyProviderFault("object_storage", this.faultPlan);
    const target = this.resolvePath(input.objectKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.bytes, { flag: "wx" });
    return {
      provider: "local",
      providerName: "xlb-local-filesystem",
      providerStatus: "stored_local",
      externalProviderExecuted: false,
      objectKey: input.objectKey,
      storageUri: `xlb-local://${input.objectKey}`,
      publicUrl: null,
      checksumSha256: input.checksumSha256,
      sizeBytes: input.bytes.length,
      contentType: input.contentType,
      storedAt: new Date().toISOString(),
    };
  }

  async getObject(objectKey: string, contentType: StoredObject["contentType"]): Promise<StoredObject> {
    await applyProviderFault("object_storage", this.faultPlan);
    return { bytes: await readFile(this.resolvePath(objectKey)), contentType };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await applyProviderFault("object_storage", this.faultPlan);
    try { await unlink(this.resolvePath(objectKey)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class MockObjectStorageProvider implements ObjectStorageProvider {
  readonly kind = "mock" as const;
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly faultPlan: ProviderFaultPlan = {}) {}

  async putObject(input: PutObjectInput): Promise<ObjectStorageProviderEnvelope> {
    await applyProviderFault("object_storage", this.faultPlan);
    assertSafeObjectKey(input.objectKey);
    if (this.objects.has(input.objectKey)) throw new Error("mock object already exists");
    this.objects.set(input.objectKey, { bytes: Buffer.from(input.bytes), contentType: input.contentType });
    return {
      provider: "mock",
      providerName: "xlb-memory-mock",
      providerStatus: "stored_mock",
      externalProviderExecuted: false,
      objectKey: input.objectKey,
      storageUri: `xlb-mock://${input.objectKey}`,
      publicUrl: null,
      checksumSha256: input.checksumSha256,
      sizeBytes: input.bytes.length,
      contentType: input.contentType,
      storedAt: new Date().toISOString(),
    };
  }

  async getObject(objectKey: string, contentType: StoredObject["contentType"]): Promise<StoredObject> {
    await applyProviderFault("object_storage", this.faultPlan);
    assertSafeObjectKey(objectKey);
    const stored = this.objects.get(objectKey);
    if (!stored) throw new Error("mock object not found");
    if (stored.contentType !== contentType) throw new Error("mock object content type mismatch");
    return { bytes: Buffer.from(stored.bytes), contentType };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await applyProviderFault("object_storage", this.faultPlan);
    assertSafeObjectKey(objectKey);
    this.objects.delete(objectKey);
  }
}

export function createObjectStorageProvider(): ObjectStorageProvider {
  const configured = loadProviderReadinessConfig().objectStorageProvider;
  if (configured === "local") return new LocalObjectStorageProvider();
  if (configured === "mock") return new MockObjectStorageProvider();
  throw new Error(`Unsupported XLB_OBJECT_STORAGE_PROVIDER: ${configured}. Only local or mock is allowed.`);
}

export const objectStorageProvider = createObjectStorageProvider();
