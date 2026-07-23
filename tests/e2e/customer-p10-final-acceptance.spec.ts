import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type {
  CustomerSduiManifestEnvelope,
  CustomerSduiPageManifest,
} from "@xlb/types";
import { customerSduiManifestEnvelopeSchema } from "../../packages/validators/src/index.js";
import { resolve } from "node:path";
import { getBuiltinHomeManifest } from "../../apps/customer/src/platform/sdui/delivery/builtinHomeManifest.js";

const manifestRoute = "**/api/customer/sdui/pages/customer.home/manifest?*";
const backend = "http://127.0.0.1:3310";
const evidenceDirectory = resolve(
  process.cwd(),
  "docs/design/customer-v2/evidence",
);

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly badResponses: string[];
}

interface CustomerSession {
  readonly token: string;
  readonly userId: string;
}

async function loginCustomer(request: APIRequestContext): Promise<CustomerSession> {
  const phone = `137${String(Date.now() + Math.floor(Math.random() * 1_000)).slice(-8)}`;
  const codeRequest = await request.post(`${backend}/api/auth/customer/code`, {
    data: { phone },
  });
  expect(codeRequest.ok(), await codeRequest.text()).toBe(true);
  const debug = await request.get(
    `${backend}/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`,
  );
  expect(debug.ok(), await debug.text()).toBe(true);
  const { code } = await debug.json() as { code: string };
  const login = await request.post(`${backend}/api/auth/customer/login`, {
    data: { phone, code },
  });
  expect(login.ok(), await login.text()).toBe(true);
  return login.json() as Promise<CustomerSession>;
}

async function installCustomerSession(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  const session = await loginCustomer(request);
  await page.addInitScript((value: CustomerSession) => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  }, session);
}

function collectDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.badResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return diagnostics;
}

function expectClean(diagnostics: BrowserDiagnostics): void {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.requestFailures).toEqual([]);
  expect(diagnostics.badResponses).toEqual([]);
}

function publishedManifest(): CustomerSduiPageManifest {
  const manifest = structuredClone(getBuiltinHomeManifest());
  manifest.manifestId = "customer.home.p10";
  manifest.revision = "p10-remote-1";
  manifest.contentHashSha256 = "a".repeat(64);
  manifest.scope = {
    cityCodes: ["hangzhou"],
    locales: ["zh-CN"],
    minimumAppVersion: "1.0.0",
    maximumAppVersion: null,
    audienceTags: [],
  };
  manifest.effectiveAt = "2026-07-01T00:00:00.000Z";
  manifest.publishedAt = "2026-07-01T00:00:00.000Z";

  for (const component of manifest.components) {
    if (component.type === "recommend_list") {
      component.order = 0;
      component.props.title = "P10 推荐服务";
    } else if (component.type === "service_grid") {
      component.order = 10;
      component.props.title = "P10 全部服务";
    } else if (component.type === "worker_nearby") {
      component.enabled = false;
    }
  }
  return manifest;
}

function publishedEnvelope(manifest: CustomerSduiPageManifest): CustomerSduiManifestEnvelope {
  return {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000010",
    pageId: "customer.home",
    resolvedAt: "2026-07-23T00:00:00.000Z",
    scopeProof: "customer.home:hangzhou:zh-CN:2.0.0",
    resolutionReason: "published",
    killSwitchActive: false,
    cacheTtlSeconds: 1,
    manifest,
    fallbackPolicy: manifest.fallbackPolicy,
  };
}

function killSwitchEnvelope(): CustomerSduiManifestEnvelope {
  const builtin = getBuiltinHomeManifest();
  return {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000011",
    pageId: "customer.home",
    resolvedAt: "2026-07-23T00:00:00.000Z",
    scopeProof: "customer.home:hangzhou:zh-CN:2.0.0",
    resolutionReason: "kill_switch",
    killSwitchActive: true,
    cacheTtlSeconds: 0,
    manifest: null,
    fallbackPolicy: builtin.fallbackPolicy,
  };
}

test("renders the real Customer home and preserves primary actions at 390x844", async ({
  page,
  request,
}) => {
  const diagnostics = collectDiagnostics(page);
  await installCustomerSession(page, request);

  await page.goto("/customer/");
  const shell = page.locator("main.xlb-home-shell");
  await expect(shell).toHaveAttribute("data-home-delivery-source", /builtin|remote|fresh-cache/);
  await expect(page.getByRole("img", { name: "xlb100" })).toBeVisible();
  await expect(page.locator(".xlb-home-service-card")).toHaveCount(16);
  await expect(page.getByRole("navigation", { name: "主要导航" })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDirectory, "p10-home-390x844.png"),
  });

  await page.getByRole("search").getByRole("textbox").fill("保洁");
  await page.getByRole("search").getByRole("textbox").press("Enter");
  await expect(page).toHaveURL(/\/service\?q=%E4%BF%9D%E6%B4%81$/);

  await page.goto("/customer/");
  await expect(shell).toHaveAttribute("data-home-delivery-source", /builtin|remote|fresh-cache/);
  await page.locator(".xlb-home-service-card").first().click();
  await expect(page).toHaveURL(/\/service$/);

  await page.goto("/customer/");
  await expect(shell).toHaveAttribute("data-home-delivery-source", /builtin|remote|fresh-cache/);
  await page.getByRole("navigation", { name: "主要导航" })
    .getByRole("button", { name: "订单" })
    .click();
  await expect(page).toHaveURL(/\/orders$/);

  expectClean(diagnostics);
});

test("applies remote order and downlisting, then sends conditional ETag revalidation", async ({
  page,
  request,
}) => {
  const diagnostics = collectDiagnostics(page);
  const envelope = publishedEnvelope(publishedManifest());
  expect(customerSduiManifestEnvelopeSchema.safeParse(envelope).success).toBe(true);
  await installCustomerSession(page, request);
  let conditionalRequestObserved = false;

  await page.route(manifestRoute, async (route) => {
    if (route.request().headers()["if-none-match"] === '"p10-remote-1"') {
      conditionalRequestObserved = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { etag: '"p10-remote-1"' },
        body: JSON.stringify(envelope),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, max-age=0, must-revalidate",
        etag: '"p10-remote-1"',
      },
      body: JSON.stringify(envelope),
    });
  });

  await page.goto("/customer/");
  const shell = page.locator("main.xlb-home-shell");
  await expect(shell).toHaveAttribute("data-home-delivery-source", "remote");
  const sectionTitles = await page.locator(".xlb-home-section h2").allTextContents();
  expect(sectionTitles.indexOf("P10 推荐服务")).toBeLessThan(
    sectionTitles.indexOf("P10 全部服务"),
  );
  await expect(page.getByRole("heading", { name: "附近师傅" })).toHaveCount(0);
  await page.screenshot({
    path: resolve(evidenceDirectory, "p10-home-remote-reordered-390x844.png"),
  });

  await page.waitForTimeout(1_100);
  await page.reload();
  await expect(shell).toHaveAttribute("data-home-delivery-source", "remote");
  expect(conditionalRequestObserved).toBe(true);

  expectClean(diagnostics);
});

test("gives Kill Switch priority over cached remote UI", async ({ page, request }) => {
  const diagnostics = collectDiagnostics(page);
  const envelope = publishedEnvelope(publishedManifest());
  expect(customerSduiManifestEnvelopeSchema.safeParse(envelope).success).toBe(true);
  expect(customerSduiManifestEnvelopeSchema.safeParse(killSwitchEnvelope()).success).toBe(true);
  await installCustomerSession(page, request);
  let killed = false;

  await page.route(manifestRoute, async (route) => {
    const response = killed ? killSwitchEnvelope() : envelope;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: killed ? {} : { etag: '"p10-remote-1"' },
      body: JSON.stringify(response),
    });
  });

  await page.goto("/customer/");
  const shell = page.locator("main.xlb-home-shell");
  await expect(shell).toHaveAttribute("data-home-delivery-source", "remote");

  killed = true;
  await page.waitForTimeout(1_100);
  await page.reload();
  await expect(shell).toHaveAttribute("data-home-delivery-reason", "kill-switch");
  await expect(shell).toHaveAttribute("data-home-delivery-source", "builtin");
  await expect(page.getByText("主页动态配置已安全关闭")).toBeVisible();
  await expect(page.getByRole("heading", { name: "P10 推荐服务" })).toHaveCount(0);

  expectClean(diagnostics);
});

test("shows the builtin offline fallback without calling manifest transport", async ({
  page,
  request,
}) => {
  const diagnostics = collectDiagnostics(page);
  await installCustomerSession(page, request);
  let manifestRequests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => false,
    });
  });
  await page.route(manifestRoute, async (route) => {
    manifestRequests += 1;
    await route.abort();
  });

  await page.goto("/customer/");
  const shell = page.locator("main.xlb-home-shell");
  await expect(shell).toHaveAttribute("data-home-delivery-reason", "offline-builtin");
  await expect(page.getByText("当前网络不可用")).toBeVisible();
  expect(manifestRequests).toBe(0);

  expectClean(diagnostics);
});
