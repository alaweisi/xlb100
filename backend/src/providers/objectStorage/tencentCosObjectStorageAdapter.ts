import COS from "cos-nodejs-sdk-v5";
import type { CosObjectStorageConfig } from "@xlb/config";
import type { ObjectStorageProviderEnvelope } from "@xlb/types";
import type {
  ObjectStorageProvider,
  PutObjectInput,
  StoredObject,
} from "./objectStorageProvider.js";
import { assertSafeObjectKey } from "./objectStorageKey.js";

export interface CosClient {
  putObject(params: COS.PutObjectParams): Promise<COS.PutObjectResult>;
  getObject(params: COS.GetObjectParams): Promise<COS.GetObjectResult>;
  deleteObject(params: COS.DeleteObjectParams): Promise<COS.DeleteObjectResult>;
}

export type TencentCosObjectReceipt = ObjectStorageProviderEnvelope & {
  provider: "cos";
  providerName: "tencent-cos";
  providerStatus: "stored_cos";
  externalProviderExecuted: true;
};

export class TencentCosOperationError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly requestId?: string;

  constructor(operation: "put" | "get" | "delete", cause: unknown) {
    const detail = cause as { code?: unknown; statusCode?: unknown; RequestId?: unknown };
    const code = typeof detail?.code === "string" ? detail.code : "COS_OPERATION_FAILED";
    super(`Tencent COS ${operation} failed (${code})`);
    this.name = "TencentCosOperationError";
    this.code = code;
    if (typeof detail?.statusCode === "number") this.statusCode = detail.statusCode;
    if (typeof detail?.RequestId === "string") this.requestId = detail.RequestId;
  }
}

export class TencentCosObjectStorageAdapter implements ObjectStorageProvider {
  readonly kind = "cos" as const;
  private readonly client: CosClient;

  constructor(
    private readonly config: CosObjectStorageConfig,
    client?: CosClient,
  ) {
    this.client = client ?? new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Timeout: config.timeoutMs,
      Protocol: "https:",
    });
  }

  async putObject(input: PutObjectInput): Promise<TencentCosObjectReceipt> {
    assertSafeObjectKey(input.objectKey);
    try {
      await this.client.putObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: input.objectKey,
        Body: input.bytes,
        ContentLength: input.bytes.length,
        ContentType: input.contentType,
        ACL: "private",
        Headers: { "x-cos-forbid-overwrite": "true" },
        "x-cos-meta-sha256": input.checksumSha256,
      });
    } catch (error) {
      throw new TencentCosOperationError("put", error);
    }

    return {
      provider: "cos",
      providerName: "tencent-cos",
      providerStatus: "stored_cos",
      externalProviderExecuted: true,
      objectKey: input.objectKey,
      storageUri: `cos://${this.config.bucket}/${input.objectKey}`,
      publicUrl: null,
      checksumSha256: input.checksumSha256,
      sizeBytes: input.bytes.length,
      contentType: input.contentType,
      storedAt: new Date().toISOString(),
    };
  }

  async getObject(
    objectKey: string,
    contentType: StoredObject["contentType"],
  ): Promise<StoredObject> {
    assertSafeObjectKey(objectKey);
    try {
      const result = await this.client.getObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: objectKey,
      });
      return { bytes: Buffer.from(result.Body), contentType };
    } catch (error) {
      throw new TencentCosOperationError("get", error);
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    assertSafeObjectKey(objectKey);
    try {
      await this.client.deleteObject({
        Bucket: this.config.bucket,
        Region: this.config.region,
        Key: objectKey,
      });
    } catch (error) {
      throw new TencentCosOperationError("delete", error);
    }
  }
}
