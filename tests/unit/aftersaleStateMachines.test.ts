import { describe, expect, it } from "vitest";
import {
  assertComplaintTransition,
  assertCompensationIntentTransition,
  assertRepairOrderTransition,
  InvalidAftersaleTransitionError,
} from "../../backend/src/aftersale/case/aftersaleStateMachines.js";

describe("aftersale state machines", () => {
  it("supports complaint triage, resolution, and close", () => {
    expect(() => assertComplaintTransition("submitted", "triaged")).not.toThrow();
    expect(() => assertComplaintTransition("triaged", "in_progress")).not.toThrow();
    expect(() => assertComplaintTransition("in_progress", "resolved")).not.toThrow();
    expect(() => assertComplaintTransition("resolved", "closed")).not.toThrow();
  });

  it("supports assigned repair lifecycle", () => {
    expect(() => assertRepairOrderTransition("assigned", "in_progress")).not.toThrow();
    expect(() => assertRepairOrderTransition("in_progress", "completed")).not.toThrow();
    expect(() => assertRepairOrderTransition("completed", "in_progress")).toThrow(InvalidAftersaleTransitionError);
  });

  it("keeps approved compensation as a non-executing terminal intent", () => {
    expect(() => assertCompensationIntentTransition("proposed", "approved")).not.toThrow();
    expect(() => assertCompensationIntentTransition("approved", "rejected")).toThrow(InvalidAftersaleTransitionError);
  });
});
