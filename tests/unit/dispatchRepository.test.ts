import { describe, it, expect } from "vitest";
import { DispatchRepository } from "../../backend/src/dispatch/dispatchRepository.js";

describe("dispatchRepository", () => {
  it("can be instantiated", () => {
    const repo = new DispatchRepository();
    expect(repo).toBeDefined();
  });
});
