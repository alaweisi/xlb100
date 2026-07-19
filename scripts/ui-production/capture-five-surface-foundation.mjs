import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const output = path.join(root, ".artifacts", "ui-five-surfaces");
mkdirSync(output, { recursive: true });
const portOffset = Number(process.env.XLB_CAPTURE_PORT_OFFSET ?? 0);

const surfaces = [
  { name: "customer", port: 5173, viewport: { width: 390, height: 844 } },
  { name: "worker", port: 5174, viewport: { width: 390, height: 844 } },
  { name: "admin", port: 5175, viewport: { width: 390, height: 844 } },
  { name: "oa", port: 5176, viewport: { width: 1440, height: 900 } },
  { name: "dashboard", port: 5177, viewport: { width: 1920, height: 1080 } },
].map((surface) => ({ ...surface, url: `http://127.0.0.1:${surface.port + portOffset}/` }));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const evidence = [];
try {
  for (const surface of surfaces) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: surface.viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/Failed to load resource/i.test(message.text())) errors.push(message.text());
    });
    const response = await page.goto(surface.url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.screenshot({ path: path.join(output, `${surface.name}.png`), fullPage: true });
    evidence.push({
      surface: surface.name,
      url: surface.url,
      viewport: `${surface.viewport.width}x${surface.viewport.height}`,
      httpStatus: response?.status() ?? null,
      title: await page.title(),
      bodyTextSample: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 240),
      errors: [...new Set(errors)].filter((message) => !/favicon\.ico/i.test(message)),
      screenshot: `.artifacts/ui-five-surfaces/${surface.name}.png`,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify({ capturedAt: new Date().toISOString(), browser: "Microsoft Edge", evidence }, null, 2)}\n`);
const failures = evidence.filter((item) => item.httpStatus !== 200 || item.errors.length > 0);
if (failures.length) {
  process.stderr.write(`${JSON.stringify(failures, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`五端 Edge 证据已生成：${output}\n`);
}
