import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const releaseSigning = fs.readFileSync(
  new URL("../android/release-signing.gradle", import.meta.url),
  "utf8",
);

test("release signing is complete, external, and mandatory for release tasks", () => {
  for (const suffix of [
    "_KEYSTORE_PATH",
    "_STORE_PASSWORD",
    "_KEY_ALIAS",
    "_KEY_PASSWORD",
  ]) {
    assert.match(releaseSigning, new RegExp(suffix, "u"));
  }
  assert.match(releaseSigning, /configuredCount > 0 && configuredCount < signingValues\.size\(\)/u);
  assert.match(releaseSigning, /gradle\.taskGraph\.whenReady/u);
  assert.match(releaseSigning, /\(\?:assemble\|bundle\|package\)\.\*release\//u);
  assert.doesNotMatch(releaseSigning, /\(\?:assemble\|bundle\|package\)\.\*release\.\*/u);
  assert.match(releaseSigning, /requireCompleteReleaseSigning\(\)/u);
  assert.match(releaseSigning, /Release keystores must remain outside the XLB workspace/u);
  assert.match(releaseSigning, /signingConfig signingConfigs\.xlbRelease/u);
});
