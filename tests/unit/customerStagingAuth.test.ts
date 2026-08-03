import { describe, expect, it } from "vitest";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import { stagingDemoCodeFor } from "../../backend/src/auth/authService.js";

describe("customer staging authentication boundary", () => {
  const code = "384921";
  const demoPhone = INVESTOR_DEMO_IDENTITIES.customer.phone;

  it("returns an OTP only for the configured staging demo identity", () => {
    expect(stagingDemoCodeFor({
      nodeEnv: "staging",
      stagingDemoCustomerAuthEnabled: true,
      stagingDemoCustomerPhone: demoPhone,
    }, demoPhone, code)).toBe(code);
  });

  it.each([
    { label: "production", nodeEnv: "production", enabled: true, phone: demoPhone },
    { label: "development", nodeEnv: "development", enabled: true, phone: demoPhone },
    { label: "disabled", nodeEnv: "staging", enabled: false, phone: demoPhone },
    { label: "different identity", nodeEnv: "staging", enabled: true, phone: "13800000012" },
  ])("keeps the OTP private for $label", ({ nodeEnv, enabled, phone }) => {
    expect(stagingDemoCodeFor({
      nodeEnv,
      stagingDemoCustomerAuthEnabled: enabled,
      stagingDemoCustomerPhone: demoPhone,
    }, phone, code)).toBeUndefined();
  });
});
