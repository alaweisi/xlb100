import type { CityCode } from "./city.js";

export type WorkerCertificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface WorkerCertification {
  certificationId: string;
  workerId: string;
  cityCode: CityCode;
  certType: string;
  certName: string;
  status: WorkerCertificationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
}
