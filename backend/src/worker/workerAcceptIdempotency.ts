import type { WorkerTaskAcceptance } from "@xlb/types";

export function isSameWorkerAcceptance(
  acceptance: WorkerTaskAcceptance,
  workerId: string,
): boolean {
  return acceptance.workerId === workerId && acceptance.status === "accepted";
}

export function canRetryAcceptForWorker(
  acceptance: WorkerTaskAcceptance | null,
  workerId: string,
): acceptance is WorkerTaskAcceptance {
  return acceptance !== null && isSameWorkerAcceptance(acceptance, workerId);
}
