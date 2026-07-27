import assert from "node:assert/strict";
import test from "node:test";
import {
  scanGitPatchText,
  scanTrackedEntries,
} from "./check-repository-secrets.mjs";

test("repository secret scan accepts committed example configuration", () => {
  assert.deepEqual(
    scanTrackedEntries([
      { path: ".env.example", content: "JWT_SECRET=\n", binary: false },
      { path: "docs/example.md", content: "AKID_example_placeholder\n", binary: false },
      {
        path: "tests/fixture.json",
        content: '{"apiKey":"xlb_biz_luban_hz_20260709"}\n',
        binary: false,
      },
    ]),
    [],
  );
});

test("repository secret scan reports secret material without echoing its value", () => {
  const privateKeyHeader = [
    "-----BEGIN ",
    "PRIVATE KEY-----",
  ].join("");
  const tencentSecretId = ["AKID", "1".repeat(30)].join("");
  const findings = scanTrackedEntries([
    {
      path: "config/runtime.txt",
      content: [
        "safe=true",
        privateKeyHeader,
        tencentSecretId,
      ].join("\n"),
      binary: false,
    },
  ]);
  assert.deepEqual(findings, [
    { path: "config/runtime.txt", line: 2, rule: "private-key" },
    { path: "config/runtime.txt", line: 3, rule: "tencent-secret-id" },
  ]);
  assert.equal(JSON.stringify(findings).includes("1234567890"), false);
});

test("repository secret scan rejects tracked signing and non-example env files", () => {
  assert.deepEqual(
    scanTrackedEntries([
      { path: "mobile/release.jks", binary: true },
      { path: ".env.production", content: "SAFE=false\n", binary: false },
    ]),
    [
      { path: "mobile/release.jks", line: 1, rule: "tracked-sensitive-file" },
      { path: ".env.production", line: 1, rule: "tracked-environment-file" },
    ],
  );
});

test("repository secret scan detects a high-entropy secret in JSON", () => {
  const genericSecret = "Ab3_Cd4-Ef5+Gh6=".repeat(2);
  assert.deepEqual(
    scanTrackedEntries([{
      path: "config/provider.json",
      content: `{"apiKey":"${genericSecret}"}`,
      binary: false,
    }]),
    [{
      path: "config/provider.json",
      line: 1,
      rule: "generic-high-entropy-secret",
    }],
  );
});

test("repository secret scan detects secrets in deleted Git history without echoing values", () => {
  const liveSecret = ["sk", "_live_", "A".repeat(28)].join("");
  const genericSecret = "Ab3_Cd4-Ef5+Gh6=".repeat(2);
  const patch = [
    `commit ${"a".repeat(40)}`,
    "+++ b/removed/provider.env",
    "@@ -0,0 +1,2 @@",
    `+PAYMENT_TOKEN=${liveSecret}`,
    `+api_key=${genericSecret}`,
  ].join("\n");
  const findings = scanGitPatchText(patch);
  assert.deepEqual(findings, [{
    path: "removed/provider.env",
    line: 1,
    rule: "stripe-live-secret",
    commit: "a".repeat(40),
  }, {
    path: "removed/provider.env",
    line: 2,
    rule: "generic-high-entropy-secret",
    commit: "a".repeat(40),
  }]);
  assert.equal(JSON.stringify(findings).includes(liveSecret), false);
});
