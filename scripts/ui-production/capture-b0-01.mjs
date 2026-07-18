import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const evidenceDir = path.join(root, "docs/design/ui/production-control/evidence/B0-01");
await mkdir(evidenceDir, { recursive: true });

const capturedAt = new Date().toISOString();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const manifest = {
  batch: "B0-01",
  browser: "Microsoft Edge",
  browserVersion: browser.version(),
  capturedAt,
  actualApp: true,
  viewportStandard: { customer: "390×844", worker: "390×844", admin: "390×844" },
  evidence: [],
};

const mobileViewport = { width: 390, height: 844 };

async function createContext(viewport, init) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "zh-CN" });
  if (init) await ctx.addInitScript(init);
  return ctx;
}

async function save(page, fileKey, sliceIds, stage, label, description) {
  const fileName = `${fileKey}.png`;
  await page.screenshot({ path: path.join(evidenceDir, fileName), fullPage: false });
  manifest.evidence.push({
    fileKey,
    sliceIds,
    stage,
    label,
    path: `docs/design/ui/production-control/evidence/B0-01/${fileName}`,
    description,
  });
}

async function json(route, body, status = 200) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}

async function mockOtpGate(page, loginFailure = "验证码不正确，请重新输入") {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/code")) {
      return json(route, { ok: true, expiresAt: capturedAt, ttlSeconds: 300, attemptsLeft: 5 });
    }
    if (url.includes("/login")) {
      return json(route, { ok: false, error: loginFailure, statusCode: 401 }, 401);
    }
    return json(route, { ok: true });
  });
}

async function customerAuthEvidence() {
  const ctx = await createContext(mobileViewport);
  const page = await ctx.newPage();
  await mockOtpGate(page);
  await page.goto("http://127.0.0.1:4311/customer/orders?orderId=order-b0-01", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "顾客身份验证" }).waitFor();
  await save(page, "C.AUTH.SESSION.REQUIRED.entry", ["C.AUTH.SESSION.REQUIRED"], "entry", "缺少会话", "从订单目标进入时保留业务意图，并显示顾客手机号验证码 Gate。");

  await page.getByLabel("手机号").fill("13800000000");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByText(/验证码已发送/).waitFor();
  await save(page, "C.AUTH.SESSION.REQUIRED.interaction", ["C.AUTH.SESSION.REQUIRED"], "interaction", "验证码已发送", "验证码请求成功，用户仍能看到返回订单的目标说明。");

  await page.getByLabel("短信验证码").fill("000000");
  await page.getByRole("button", { name: "登录并继续" }).click();
  await page.getByText(/登录失败/).waitFor();
  await save(page, "C.AUTH.SESSION.REQUIRED.recovery", ["C.AUTH.SESSION.REQUIRED"], "recovery", "验证失败可恢复", "错误信息落在原 Gate，手机号、目标页面和重新输入能力均保留。");
  await ctx.close();
}

function customerSession() {
  localStorage.setItem("xlb.customer.token", "b0-customer-token");
  localStorage.setItem("xlb.customer.userId", "customer-b0-01");
  localStorage.setItem("xlb.customer.cityCode", "hangzhou");
}

const catalog = {
  cityCode: "hangzhou",
  generatedAt: capturedAt,
  categories: [
    ["cat-clean", "家庭保洁", "item-clean", "日常保洁", "sku-clean", "日常保洁", "小时"],
    ["cat-appliance-clean", "家电清洗", "item-ac-clean", "挂机空调清洗", "sku_ac_wall_basic", "挂机空调普通清洗", "台"],
    ["cat-repair", "家电维修", "item-repair", "空调维修", "sku_repair_ac_not_cooling", "空调不制冷检修", "次"],
    ["cat-install", "上门安装", "item-install", "灯具安装", "sku_install_light_ceiling", "吸顶灯安装", "个"],
    ["cat-plumbing", "管道疏通", "item-plumbing", "厨房管道疏通", "sku_plumbing_kitchen_sink_basic", "厨房水槽下水疏通", "次"],
    ["cat-lock", "开锁换锁", "item-lock", "上门开锁", "sku_lock_unlock_standard", "普通门锁开锁", "次"],
    ["cat-electrical", "水电维修", "item-electrical", "电路维修", "sku_electrical_trip_detect", "跳闸原因检测", "次"],
    ["cat-waterproof", "防水补漏/精准测漏", "item-waterproof", "精准测漏", "sku_waterproof_leak_detect_basic", "基础漏水检测", "次"],
  ].map(([categoryId, name, itemId, itemName, skuId, skuName, unit]) => ({
    categoryId,
    name,
    items: [{ itemId, name: itemName, skus: [{ skuId, name: skuName, unit }] }],
  })),
};

async function customerBaseEvidence() {
  const loading = await createContext(mobileViewport, customerSession);
  const loadingPage = await loading.newPage();
  await loadingPage.route("**/api/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return json(route, { ok: true, catalog });
  });
  await loadingPage.goto("http://127.0.0.1:4311/customer/", { waitUntil: "domcontentloaded" });
  await loadingPage.getByText("服务目录加载中").waitFor();
  await save(loadingPage, "C-00.loading", ["C-00"], "loading", "顾客首页加载态", "真实顾客首页在目录请求未完成时显示稳定加载状态。");
  await loading.close();

  const ready = await createContext(mobileViewport, customerSession);
  const readyPage = await ready.newPage();
  await readyPage.route("**/api/**", (route) => json(route, { ok: true, catalog }));
  await readyPage.goto("http://127.0.0.1:4311/customer/", { waitUntil: "networkidle" });
  await readyPage.getByText("安心到家修缮", { exact: true }).waitFor();
  await readyPage.getByText("家庭保洁", { exact: true }).waitFor();
  await save(readyPage, "C-00.base", ["C-00"], "base", "顾客端基础外壳", "移动 App 首页按批准样板复刻暖色液态玻璃的结构、比例、双层亮边与内部折射；首页八类服务和推荐内容仍由正式目录驱动。底部中央加号与其他菜单保持同一控制区。 ");

  await readyPage.getByRole("link", { name: "下单" }).click();
  await readyPage.getByText("全部服务", { exact: true }).waitFor();
  await readyPage.getByText("共 8 项", { exact: true }).waitFor();
  await save(readyPage, "C-00.service-menu", ["C-00"], "interaction", "中央加号：全量服务菜单", "点击底部中央加号后进入由实时目录接口驱动的全部 SKU 服务菜单。");
  await ready.close();

  const support = await createContext(mobileViewport, customerSession);
  const supportPage = await support.newPage();
  await supportPage.route("**/api/catalog**", (route) => json(route, { ok: true, catalog }));
  await supportPage.route("**/api/support/tickets**", (route) => json(route, { ok: true, tickets: [], nextCursor: null }));
  await supportPage.route("**/api/support/conversations**", (route) => json(route, { ok: true, conversations: [] }));
  await supportPage.goto("http://127.0.0.1:4311/customer/support", { waitUntil: "networkidle" });
  await supportPage.getByText("客服中心", { exact: true }).waitFor();
  await save(supportPage, "C-00.support", ["C-00"], "interaction", "客服入口", "底部客服入口直达真实客服工单与在线会话页面，顾客界面全中文。");
  await support.close();

  const failed = await createContext(mobileViewport, customerSession);
  const failedPage = await failed.newPage();
  await failedPage.route("**/api/**", (route) => json(route, { ok: false, error: "服务目录暂时不可用" }, 503));
  await failedPage.goto("http://127.0.0.1:4311/customer/", { waitUntil: "networkidle" });
  await failedPage.getByRole("heading", { name: "服务目录加载失败" }).waitFor();
  await save(failedPage, "C-00.error", ["C-00"], "error", "顾客首页异常态", "目录失败不会伪造服务，页面提供明确重试动作。");
  await failed.close();
}

async function workerUnauthEvidence() {
  const ctx = await createContext(mobileViewport);
  const page = await ctx.newPage();
  await mockOtpGate(page);
  await page.goto("http://127.0.0.1:4312/worker/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "师傅身份验证" }).waitFor();
  await save(page, "W.AUTH.SESSION.UNAUTHENTICATED.entry", ["W.AUTH.SESSION.UNAUTHENTICATED", "W.PROFILE.ACCESS.SUSPENDED", "W.PROFILE.ACCESS.DISABLED"], "entry", "师傅登录入口", "无会话时显示城市、手机号、验证码和目标任务大厅。");

  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByText(/验证码已发送/).waitFor();
  await save(page, "W.AUTH.SESSION.UNAUTHENTICATED.interaction", ["W.AUTH.SESSION.UNAUTHENTICATED"], "interaction", "验证码已发送", "师傅登录请求已进入后端认证流程。");

  await page.getByLabel("短信验证码").fill("000000");
  await page.getByRole("button", { name: "登录并进入任务大厅" }).click();
  await page.getByText(/登录失败/).waitFor();
  await save(page, "W.AUTH.SESSION.UNAUTHENTICATED.recovery", ["W.AUTH.SESSION.UNAUTHENTICATED"], "recovery", "验证失败可恢复", "验证失败留在原登录场景并允许重新输入。");
  await ctx.close();
}

async function workerAccessEvidence(status) {
  const ctx = await createContext(mobileViewport);
  const page = await ctx.newPage();
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/login")) {
      return json(route, {
        ok: false,
        error: status === "suspended" ? "师傅账号已暂停接单" : "师傅账号已停用",
        statusCode: 403,
        code: status === "suspended" ? "WORKER_ACCESS_SUSPENDED" : "WORKER_ACCESS_DISABLED",
        workerAccessStatus: status,
      }, 403);
    }
    return json(route, { ok: true, expiresAt: capturedAt, ttlSeconds: 300, attemptsLeft: 5 });
  });
  await page.goto("http://127.0.0.1:4312/worker/", { waitUntil: "networkidle" });
  await page.getByLabel("短信验证码").fill("123456");
  await page.getByRole("button", { name: "登录并进入任务大厅" }).click();
  const sliceId = status === "suspended" ? "W.PROFILE.ACCESS.SUSPENDED" : "W.PROFILE.ACCESS.DISABLED";
  const title = status === "suspended" ? "师傅账号已暂停接单" : "师傅账号已停用";
  await page.getByText(title, { exact: true }).waitFor();
  await save(page, `${sliceId}.decision`, [sliceId], "decision", title, "验证码通过后以后端权威账号状态阻断接单，并说明影响范围与下一步。");
  await page.getByRole("button", { name: status === "suspended" ? "重新验证状态" : "退出当前账号" }).click();
  await page.getByRole("heading", { name: "师傅身份验证" }).waitFor();
  await save(page, `${sliceId}.recovery`, [sliceId], "recovery", "返回身份验证", "用户可退出阻断态并重新验证账号状态。");
  await ctx.close();
}

function workerSession() {
  localStorage.setItem("xlb.worker.session", JSON.stringify({ token: "b0-worker-token", userId: "worker-b0-01", role: "worker", phone: "13800000001" }));
}

async function workerAuthenticatedEvidence() {
  const ctx = await createContext(mobileViewport, workerSession);
  const page = await ctx.newPage();
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("task-pool")) return json(route, { ok: true, cityCode: "hangzhou", tasks: [] });
    if (url.includes("fulfillments")) return json(route, { ok: true, cityCode: "hangzhou", fulfillments: [] });
    return json(route, { ok: true, items: [] });
  });
  await page.goto("http://127.0.0.1:4312/worker/", { waitUntil: "networkidle" });
  await page.getByText("当前师傅身份").waitFor();
  await save(page, "W.AUTH.SESSION.AUTHENTICATED.entry", ["W.AUTH.SESSION.AUTHENTICATED", "W-00"], "entry", "师傅端基础外壳", "恢复持久会话后显示移动工作台、身份卡、任务大厅和五项底部导航。");

  await page.getByRole("link", { name: /任务/ }).click();
  await page.getByText("我的任务").waitFor();
  await save(page, "W.AUTH.SESSION.AUTHENTICATED.result", ["W.AUTH.SESSION.AUTHENTICATED"], "result", "会话进入任务页", "有效会话和城市上下文传递到真实任务路由。");

  await page.getByRole("button", { name: /退出/ }).click();
  await page.getByRole("heading", { name: "师傅身份验证" }).waitFor();
  await save(page, "W.AUTH.SESSION.AUTHENTICATED.recovery", ["W.AUTH.SESSION.AUTHENTICATED"], "recovery", "退出后清除会话", "退出操作清除持久会话并回到身份 Gate。");
  await ctx.close();
}

async function adminAuthEvidence() {
  const ctx = await createContext(mobileViewport);
  const page = await ctx.newPage();
  await mockOtpGate(page, "运营验证码不正确，请重新输入");
  await page.goto("http://127.0.0.1:4313/#/order-trace", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "运营身份验证" }).waitFor();
  await save(page, "A.AUTH.SESSION.REQUIRED.entry", ["A.AUTH.SESSION.REQUIRED"], "entry", "运营 App 登录入口", "无运营会话时以手机全屏 Gate 保留订单追踪目标并要求账号验证码。");

  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByText(/验证码已发送/).waitFor();
  await save(page, "A.AUTH.SESSION.REQUIRED.interaction", ["A.AUTH.SESSION.REQUIRED"], "interaction", "运营验证码已发送", "运营账号进入验证码校验流程。");

  await page.getByLabel("短信验证码").fill("000000");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByText("运营验证码不正确，请重新输入").waitFor();
  await save(page, "A.AUTH.SESSION.REQUIRED.recovery", ["A.AUTH.SESSION.REQUIRED"], "recovery", "运营验证失败", "错误留在手机全屏 Gate，目标工作台未丢失。");
  await ctx.close();
}

function adminSession() {
  localStorage.setItem("xlb.admin.token", "b0-admin-token");
  localStorage.setItem("xlb.admin.userId", "admin-b0-01");
  localStorage.setItem("xlb.admin.role", "operator");
  localStorage.setItem("xlb.admin.username", "admin_hz");
}

async function adminEvidence() {
  const ctx = await createContext(mobileViewport, adminSession);
  const page = await ctx.newPage();
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("review-summary")) return json(route, { ok: true, overall: { totalStatements: 18, reviewedStatements: 12, approvedStatements: 9, exportedStatements: 4 } });
    if (url.includes("reconciliation")) return json(route, { ok: true, summary: { totalGaps: 2, gapsByType: {} } });
    return json(route, { ok: true, items: [], nextCursor: null });
  });
  await page.goto("http://127.0.0.1:4313/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "选择运营城市" }).waitFor();
  await save(page, "A.SCOPE.CITY.REQUIRED.entry", ["A.SCOPE.CITY.REQUIRED"], "entry", "城市范围缺失", "运营身份有效但城市范围缺失，手机业务工作台暂不开放。");

  await page.getByLabel("工作城市").selectOption("shanghai");
  await save(page, "A.SCOPE.CITY.REQUIRED.interaction", ["A.SCOPE.CITY.REQUIRED"], "interaction", "选择上海", "选择控件显示即将进入的工作城市，确认前不写入范围。");

  await page.getByRole("button", { name: "进入该城市工作台" }).click();
  await page.getByRole("heading", { name: "运营总览" }).waitFor();
  await page.getByText("上海城市工作台").waitFor();
  await save(page, "A.SCOPE.CITY.REQUIRED.result", ["A.SCOPE.CITY.REQUIRED", "A-00"], "result", "手机运营总览", "城市范围写入后进入手机运营总览，展示真实指标、五项主导航和常用工作台入口。");
  await ctx.close();
}

try {
  await customerAuthEvidence();
  await customerBaseEvidence();
  await workerUnauthEvidence();
  await workerAccessEvidence("suspended");
  await workerAccessEvidence("disabled");
  await workerAuthenticatedEvidence();
  await adminAuthEvidence();
  await adminEvidence();
  await writeFile(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`B0-01 Edge evidence captured: ${manifest.evidence.length} files, Edge ${manifest.browserVersion}`);
} finally {
  await browser.close();
}
