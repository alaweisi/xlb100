/** Phase 4 event handlers — no dispatch; Phase 5 consumes outbox stream */

export const EVENT_HANDLERS_PHASE = 4;

export function registerEventHandlers(): void {
  // Phase 4: handlers are outbox-only; no dispatch / ledger side effects
}
