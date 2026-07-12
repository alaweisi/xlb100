import { describe, expect, it } from "vitest";
import {
  assertSupportTicketTransition,
  InvalidSupportTicketTransitionError,
} from "../../backend/src/support/ticket/supportTicketStateMachine.js";

describe("Phase 24B support ticket state machine", () => {
  it("supports assignment, waiting, escalation, resolution, reopen, and close", () => {
    expect(() => assertSupportTicketTransition("open", "processing")).not.toThrow();
    expect(() => assertSupportTicketTransition("processing", "waiting_requester")).not.toThrow();
    expect(() => assertSupportTicketTransition("waiting_requester", "escalated")).not.toThrow();
    expect(() => assertSupportTicketTransition("escalated", "resolved")).not.toThrow();
    expect(() => assertSupportTicketTransition("resolved", "processing")).not.toThrow();
    expect(() => assertSupportTicketTransition("resolved", "closed")).not.toThrow();
  });

  it("rejects shortcuts and all transitions out of closed", () => {
    expect(() => assertSupportTicketTransition("open", "resolved")).toThrow(InvalidSupportTicketTransitionError);
    expect(() => assertSupportTicketTransition("processing", "closed")).toThrow(InvalidSupportTicketTransitionError);
    expect(() => assertSupportTicketTransition("closed", "processing")).toThrow(InvalidSupportTicketTransitionError);
  });
});
