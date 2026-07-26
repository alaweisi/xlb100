import { describe, expect, it } from "vitest";
import { stagingDemoCodeFor } from "../../backend/src/auth/authService.js";

describe("customer staging authentication boundary", () => {
  const code = "384921";
  const demoPhone = "13800000001";

  it("returns an OTP only for the configured staging demo identity", () => {
    expect(stagingDemoCodeFor({
      nodeEnv: "staging",
      stagingDemoCustomerAuthEnabled: true,
      stagingDemoCustomerPhone: demoPhone,
    }, demoPhone, code)).toBe(code);
  });

  it.each([
    ["production", true, demoPhone],
    ["development", true, demoPhone],
    ["staging", false, demoPhone],
    ["staging", true, "13800000002"],
  ])("keeps the OTP private for %s enabled=%s phone=%s", (
    nodeEnv,
    enabled,
    phone,
  ) => {
    expect(stagingDemoCodeFor({
      nodeEnv,
      stagingDemoCustomerAuthEnabled: enabled,
      stagingDemoCustomerPhone: demoPhone,
    }, phone, code)).toBeUndefined();
  });
});
