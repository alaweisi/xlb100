import type { WorkerCertificationStatus } from "@xlb/types";

const ALLOWED_TRANSITIONS: Record<
  WorkerCertificationStatus,
  WorkerCertificationStatus[]
> = {
  pending: ["approved", "rejected"],
  approved: ["expired"],
  rejected: [],
  expired: [],
};

export class InvalidCertificationTransitionError extends Error {
  readonly statusCode = 409;

  constructor(from: WorkerCertificationStatus, to: WorkerCertificationStatus) {
    super(`Invalid certification transition: ${from} -> ${to}`);
    this.name = "InvalidCertificationTransitionError";
  }
}

export function canTransitionCertification(
  from: WorkerCertificationStatus,
  to: WorkerCertificationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCertificationTransition(
  from: WorkerCertificationStatus,
  to: WorkerCertificationStatus,
): void {
  if (!canTransitionCertification(from, to)) {
    throw new InvalidCertificationTransitionError(from, to);
  }
}

export function isTerminalCertificationStatus(
  status: WorkerCertificationStatus,
): boolean {
  return status === "rejected" || status === "expired";
}
