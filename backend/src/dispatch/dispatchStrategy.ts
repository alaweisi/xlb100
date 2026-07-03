/** Phase 5A dispatch strategy — placeholder; no worker matching */

export type DispatchStrategyResult = {
  strategy: "city_stream_only";
  assignWorker: false;
};

export function resolveDispatchStrategy(): DispatchStrategyResult {
  return {
    strategy: "city_stream_only",
    assignWorker: false,
  };
}
