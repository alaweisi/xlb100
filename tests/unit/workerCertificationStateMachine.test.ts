import { describe, it, expect } from "vitest";
import {
  assertCertificationTransition,
  canTransitionCertification,
  InvalidCertificationTransitionError,
} from "../../backend/src/compliance/workerCertification/workerCertificationStateMachine.js";

describe("workerCertificationStateMachine", () => {
  it("allows pending -> approved", () => {
    expect(canTransitionCertification("pending", "approved")).toBe(true);
    expect(() => assertCertificationTransition("pending", "approved")).not.toThrow();
  });

  it("allows pending -> rejected", () => {
    expect(canTransitionCertification("pending", "rejected")).toBe(true);
  });

  it("rejects approved -> pending", () => {
    expect(canTransitionCertification("approved", "pending")).toBe(false);
    expect(() => assertCertificationTransition("approved", "pending")).toThrow(
      InvalidCertificationTransitionError,
    );
  });

  it("rejects rejected -> approved", () => {
    expect(canTransitionCertification("rejected", "approved")).toBe(false);
  });
});
