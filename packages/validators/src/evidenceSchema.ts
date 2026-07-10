import { z } from "zod";
import { FULFILLMENT_EVIDENCE_MAX_BYTES } from "@xlb/types";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const objectStorageProviderKindSchema = z.enum(["local", "mock"]);
export const objectStorageProviderStatusSchema = z.enum(["stored_local", "stored_mock"]);
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
  providerName: z.enum(["xlb-local-filesystem", "xlb-memory-mock"]),
  providerStatus: objectStorageProviderStatusSchema,
  externalProviderExecuted: z.literal(false),
  objectKey: z.string().min(1).max(255),
  storageUri: z.string().min(1).max(512),
  publicUrl: z.null(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(FULFILLMENT_EVIDENCE_MAX_BYTES),
  contentType: evidenceContentTypeSchema,
  storedAt: z.string().datetime(),
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
