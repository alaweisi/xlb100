import type { CityCode } from "./city.js";

export const FULFILLMENT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

export type ObjectStorageProviderKind = "local" | "mock" | "cos";
export type ObjectStorageProviderStatus = "stored_local" | "stored_mock" | "stored_cos";

export interface ObjectStorageProviderEnvelope {
  provider: ObjectStorageProviderKind;
  providerName: "xlb-local-filesystem" | "xlb-memory-mock" | "tencent-cos";
  providerStatus: ObjectStorageProviderStatus;
  externalProviderExecuted: boolean;
  objectKey: string;
  storageUri: string;
  publicUrl: null;
  checksumSha256: string;
  sizeBytes: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  storedAt: string;
}

export type FulfillmentEvidenceType =
  | "arrival"
  | "before_service"
  | "diagnosis"
  | "material"
  | "after_service"
  | "completion";

export type MediaSecurityScanStatus = "not_malware_scanned_local";

export interface MediaAsset {
  mediaAssetId: string;
  cityCode: CityCode;
  orderId: string;
  fulfillmentId: string;
  complaintId: string | null;
  uploadedByType: "worker";
  uploadedById: string;
  originalFileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  checksumSha256: string;
  signatureValidated: true;
  securityScanStatus: MediaSecurityScanStatus;
  storage: ObjectStorageProviderEnvelope;
  createdAt: string;
}

export interface FulfillmentEvidence {
  evidenceId: string;
  cityCode: CityCode;
  fulfillmentId: string;
  orderId: string;
  complaintId: string | null;
  mediaAssetId: string;
  evidenceType: FulfillmentEvidenceType;
  note: string | null;
  capturedAt: string;
  createdByWorkerId: string;
  createdAt: string;
  mediaAsset: MediaAsset;
}

export type CustomerConfirmationStatus = "pending" | "confirmed" | "disputed";

export interface FulfillmentCustomerConfirmation {
  confirmationId: string;
  cityCode: CityCode;
  fulfillmentId: string;
  orderId: string;
  customerId: string;
  status: CustomerConfirmationStatus;
  complaintId: string | null;
  customerNote: string | null;
  evidenceSnapshot: Array<{
    evidenceId: string;
    mediaAssetId: string;
    evidenceType: FulfillmentEvidenceType;
    checksumSha256: string;
    capturedAt: string;
  }>;
  confirmedAt: string | null;
  disputedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentEvidenceAggregate {
  fulfillmentId: string;
  orderId: string;
  cityCode: CityCode;
  fulfillmentStatus: string;
  evidence: FulfillmentEvidence[];
  confirmation: FulfillmentCustomerConfirmation | null;
}

export interface CreateFulfillmentEvidenceMetadata {
  evidenceType: FulfillmentEvidenceType;
  complaintId?: string;
  note?: string;
  capturedAt?: string;
}

export interface DecideFulfillmentConfirmationRequest {
  decision: "confirmed" | "disputed";
  note?: string;
  complaintId?: string;
}
