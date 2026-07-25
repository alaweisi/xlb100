import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(
  new URL("../../worker/src/app/App.tsx", import.meta.url),
  "utf8",
);
const responsiveCss = fs.readFileSync(
  new URL("../../worker/src/app/worker-responsive.css", import.meta.url),
  "utf8",
);
const indexHtml = fs.readFileSync(
  new URL("../../worker/index.html", import.meta.url),
  "utf8",
);

test("Worker native-width layout removes the desktop phone preview frame", () => {
  assert.match(appSource, /xlb-worker-device-stage/u);
  assert.match(appSource, /xlb-worker-device-frame/u);
  assert.match(appSource, /data-native-mobile/u);
  assert.match(responsiveCss, /\[data-native-mobile="true"\]/u);
  assert.match(responsiveCss, /\.xlb-worker-device-frame[\s\S]*border: 0 !important/u);
  assert.match(responsiveCss, /\.xlb-worker-preview-status[\s\S]*display: none !important/u);
  assert.match(responsiveCss, /padding-left: var\(--xlb-spacing-md\) !important/u);
  assert.match(responsiveCss, /env\(safe-area-inset-top\)/u);
  assert.match(indexHtml, /viewport-fit=cover/u);
});
