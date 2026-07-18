import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const consoleFile = path.join(rootDir, "docs/design/ui/production-control/SLICE_ACCEPTANCE_CONSOLE.html");
const screenshotFile = path.join(rootDir, "docs/design/ui/production-control/SLICE_ACCEPTANCE_CONSOLE.png");
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(consoleFile).href, { waitUntil: "load" });
  await page.screenshot({ path: screenshotFile, fullPage: true });
  console.log(`UI_PRODUCTION_CONSOLE_CAPTURED ${path.relative(rootDir, screenshotFile)}`);
} finally {
  await browser.close();
}
