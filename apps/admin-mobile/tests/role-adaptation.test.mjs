import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layoutSource = fs.readFileSync(
  new URL("../../../packages/ui/src/layouts/index.tsx", import.meta.url),
  "utf8",
);
const responsiveCss = fs.readFileSync(
  new URL("../../admin/src/admin-responsive.css", import.meta.url),
  "utf8",
);

test("Admin narrow layout exposes a touch-sized horizontally scrollable role nav", () => {
  assert.match(layoutSource, /data-admin-shell/u);
  assert.match(layoutSource, /data-side-nav-items/u);
  assert.match(responsiveCss, /@media \(max-width: 720px\)/u);
  assert.match(responsiveCss, /grid-template-columns: minmax\(0, 1fr\) !important/u);
  assert.match(responsiveCss, /\[data-side-nav-items\][\s\S]*overflow-x: auto/u);
  assert.match(responsiveCss, /min-height: 44px/u);
  assert.match(responsiveCss, /env\(safe-area-inset-top\)/u);
});
