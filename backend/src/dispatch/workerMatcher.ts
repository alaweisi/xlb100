/**
 * Phase 5A worker matcher — PLACEHOLDER ONLY.
 * Phase 5A does NOT assign workers.
 * Phase 6 (certification) required before worker eligibility matching.
 */

export type WorkerMatchResult = {
  matched: false;
  reason: "phase5a_no_worker_assignment";
};

export function matchWorker(): WorkerMatchResult {
  return {
    matched: false,
    reason: "phase5a_no_worker_assignment",
  };
}
