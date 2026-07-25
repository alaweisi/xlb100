import { describe, expect, it } from "vitest";
import { normalizeCustomerApiBase } from "../../apps/customer/src/apiBase";

describe("customer mobile API origin", () => {
  it("normalizes an injected origin without changing its HTTPS port", () => {
    expect(
      normalizeCustomerApiBase(" https://123.207.198.136:80/ "),
    ).toBe("https://123.207.198.136:80");
  });

  it("accepts the legacy API-suffixed configuration contract", () => {
    expect(
      normalizeCustomerApiBase("https://api.example.test/api"),
    ).toBe("https://api.example.test");
  });

  it("keeps browser-relative behavior when no origin is injected", () => {
    expect(normalizeCustomerApiBase(undefined)).toBe("");
  });
});
