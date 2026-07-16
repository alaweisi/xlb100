import { z } from "zod";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const objectStorageProviderKindSchema = z.enum(["local", "mock", "cos"]);
export const objectStorageProviderStatusSchema = z.enum(["stored_local", "stored_mock", "stored_cos"]);
export const fulfillmentEvidenceTypeSchema = z.enum([
  "arrival",
  "before_service",
  "diagnosis",
  "material",
  "after_service",
  "completion",
]);
export const evidenceContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const objectStorageProviderEnvelopeSchema = z.object({
  provider: objectStorageProviderKindSchema,
  providerName: z.enum(["xlb-local-filesystem", "xlb-memory-mock", "tencent-cos"]),
  providerStatus: objectStorageProviderStatusSchema,
  externalProviderExecuted: z.boolean(),
  objectKey: z.string().min(1).max(255),
  storageUri: z.string().min(1).max(512),
  publicUrl: z.null(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(FULFILLMENT_EVIDENCE_MAX_BYTES),
  contentType: evidenceContentTypeSchema,
  storedAt: z.string().datetime(),
}).superRefine((value, context) => {
  const expected = {
    local: {
      providerName: "xlb-local-filesystem",
      providerStatus: "stored_local",
      externalProviderExecuted: false,
      storageUriPrefix: "xlb-local://",
    },
    mock: {
      providerName: "xlb-memory-mock",
      providerStatus: "stored_mock",
      externalProviderExecuted: false,
      storageUriPrefix: "xlb-mock://",
    },
    cos: {
      providerName: "tencent-cos",
      providerStatus: "stored_cos",
      externalProviderExecuted: true,
      storageUriPrefix: "cos://",
    },
  } as const;
  const contract = expected[value.provider];
  if (value.providerName !== contract.providerName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["providerName"], message: "providerName must match provider" });
  }
  if (value.providerStatus !== contract.providerStatus) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["providerStatus"], message: "providerStatus must match provider" });
  }
  if (value.externalProviderExecuted !== contract.externalProviderExecuted) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["externalProviderExecuted"], message: "external execution flag must match provider" });
  }
  if (!value.storageUri.startsWith(contract.storageUriPrefix)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storageUri"], message: "storage URI must match provider" });
  }
  if (value.provider === "cos" && !/^cos:\/\/[^/]+\/.+/.test(value.storageUri)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storageUri"], message: "COS URI must include bucket and object key" });
  }
});

export const createFulfillmentEvidenceMetadataSchema = z.object({
  evidenceType: fulfillmentEvidenceTypeSchema,
  complaintId: z.string().min(1).max(64).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  capturedAt: z.string().datetime().optional(),
}).strict();

export const decideFulfillmentConfirmationRequestSchema = z.object({
  decision: z.enum(["confirmed", "disputed"]),
  note: z.string().trim().min(2).max(500).optional(),
  complaintId: z.string().min(1).max(64).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "disputed" && !value.complaintId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["complaintId"], message: "disputed confirmation requires complaintId" });
  }
  if (value.decision === "disputed" && !value.note) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "disputed confirmation requires note" });
  }
  if (value.decision === "confirmed" && value.complaintId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["complaintId"], message: "confirmed decision cannot bind a complaint" });
  }
});

export const mediaAssetSchema = z.object({
  mediaAssetId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  fulfillmentId: z.string().min(1).max(64),
  complaintId: z.string().min(1).max(64).nullable(),
  uploadedByType: z.literal("worker"),
  uploadedById: z.string().min(1).max(64),
  originalFileName: z.string().min(1).max(255),
  contentType: evidenceContentTypeSchema,
  sizeBytes: z.number().int().positive().max(FULFILLMENT_EVIDENCE_MAX_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  signatureValidated: z.literal(true),
  securityScanStatus: z.literal("not_malware_scanned_local"),
  storage: objectStorageProviderEnvelopeSchema,
  createdAt: z.string().datetime(),
});

export const fulfillmentEvidenceSchema = z.object({
  evidenceId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  fulfillmentId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  complaintId: z.string().min(1).max(64).nullable(),
  mediaAssetId: z.string().min(1).max(64),
  evidenceType: fulfillmentEvidenceTypeSchema,
  note: z.string().max(500).nullable(),
  capturedAt: z.string().datetime(),
  createdByWorkerId: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  mediaAsset: mediaAssetSchema,
});

export const customerConfirmationStatusSchema = z.enum(["pending", "confirmed", "disputed"]);
