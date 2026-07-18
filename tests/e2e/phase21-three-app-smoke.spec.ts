import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const backendUrl = "http://localhost:3100";

function assertNoPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    const isExpectedRoleBoundary = text.includes("status of 403 (Forbidden)");
    if (message.type() === "error" && !isExpectedRoleBoundary) errors.push(text);
  });
  return () => expect(errors, "浏览器控制台或页面不应出现错误").toEqual([]);
}

test("顾客端：新手机号完成中文资料与常用地址闭环", async ({ page }) => {
  const assertClean = assertNoPageErrors(page);
  const suffix = String(Date.now()).slice(-8);
  const phone = `139${suffix}`;
  const displayName = `测试顾客${suffix.slice(-4)}`;
  const contactName = `李女士${suffix.slice(-2)}`;
  const detailAddress = `文三路${suffix.slice(-4)}号喜乐帮验收室`;

  const codeRequest = await page.request.post(`${backendUrl}/api/auth/customer/code`, { data: { phone } });
  expect(codeRequest.ok()).toBeTruthy();
  const debug = await page.request.get(`${backendUrl}/api/auth/customer/debug-code?phone=${phone}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post(`${backendUrl}/api/auth/customer/login`, { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();

  await page.addInitScript((value) => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
  }, session);
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");

  await expect(page.getByRole("heading", { name: "账号资料" })).toBeVisible();
  await page.getByLabel("显示名称").fill(displayName);
  await page.getByRole("button", { name: "保存个人资料" }).click();
  await expect(page.getByRole("status")).toContainText("个人资料已保存");

  await expect(page.getByRole("heading", { name: "常用服务地址" })).toBeVisible();
  await page.getByLabel("联系人").fill(contactName);
  await page.getByLabel("手机号").fill(phone);
  await page.getByLabel("区县").fill("西湖区");
  await page.getByLabel("详细地址").fill(detailAddress);
  await page.getByLabel("设为默认地址").check();
  await page.getByRole("button", { name: "添加地址" }).click();
  const addressCard = page.locator(".customer-order-section", { hasText: detailAddress });
  await expect(addressCard).toBeVisible();

  await addressCard.getByRole("button", { name: "删除" }).click();
  const confirmDelete = addressCard.getByRole("button", { name: "确认删除" });
  if (await confirmDelete.isVisible().catch(() => false)) await confirmDelete.click();
  await expect(addressCard).toHaveCount(0);
  assertClean();
});

test("师傅端：通过真实验证码界面登录并同步接单位置", async ({ page }) => {
  const assertClean = assertNoPageErrors(page);
  const phone = "13800000001";

  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "师傅身份验证" })).toBeVisible();
  await page.getByRole("button", { name: "获取验证码" }).click();
  const debug = await page.request.get(`${backendUrl}/api/auth/worker/debug-code?phone=${phone}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  await page.getByLabel("短信验证码").fill(code);
  await page.getByRole("button", { name: "登录并进入任务大厅" }).click();

  await expect(page.getByRole("heading", { name: "位置共享与接单半径" })).toBeVisible();
  await page.getByRole("button", { name: "更新当前位置" }).click();
  await expect(page.getByRole("heading", { name: "位置设置已同步" })).toBeVisible();
  await expect(page.getByText("位置共享已开启")).toBeVisible();
  assertClean();
});

test("后台端：390×844 移动外壳、五项导航、完整工具箱与平台运营联动", async ({ page }) => {
  const assertClean = assertNoPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const username = "admin_global";
  const codeRequest = await page.request.post(`${backendUrl}/api/auth/admin/code`, { data: { username } });
  expect(codeRequest.ok()).toBeTruthy();
  const debug = await page.request.get(`${backendUrl}/api/auth/admin/debug-code?username=${username}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post(`${backendUrl}/api/auth/admin/login`, { data: { username, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();

  await page.addInitScript((value) => {
    localStorage.setItem("xlb.admin.token", value.token);
    localStorage.setItem("xlb.admin.userId", value.userId);
    localStorage.setItem("xlb.admin.role", value.role);
    localStorage.setItem("xlb.admin.username", value.username);
    localStorage.setItem("xlb.admin.cityCode", "hangzhou");
  }, { ...session, username });
  await page.goto("http://localhost:5275/#/?cityCode=hangzhou");

  const shell = page.locator(".admin-mobile-shell");
  await expect(shell).toBeVisible();
  await expect(page.getByRole("button", { name: "当前城市：杭州，点击切换" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "运营应用主导航" });
  const navButtons = nav.getByRole("button");
  await expect(navButtons).toHaveCount(5);
  for (const label of ["总览", "订单派单", "客服", "审批", "我的/更多"]) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await nav.getByRole("button", { name: "我的/更多", exact: true }).click();
  const toolsDialog = page.getByRole("dialog", { name: "全部工作台" });
  await expect(toolsDialog).toBeVisible();
  const tools = toolsDialog.locator(".admin-mobile-tools-grid > button");
  await expect(tools).toHaveCount(14);
  for (const label of [
    "结算运营", "结算单详情", "导出复核", "结算治理", "订单追踪", "师傅提现", "售后运营",
    "企业客户", "城市派单", "平台运营", "客服工作台", "客服质量", "评价与口碑", "营销优惠券",
  ]) {
    await expect(toolsDialog.getByText(label, { exact: true })).toBeVisible();
  }

  await toolsDialog.getByRole("button", { name: /平台运营/ }).click();
  await expect(page).toHaveURL(/#\/platform-operations\?cityCode=hangzhou/);
  await expect(page.getByRole("heading", { name: "今日处理队列" })).toBeVisible();
  for (const heading of ["平台运营联动工作台", "城市订单池", "正式服务目录", "师傅认证审核"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    shell: document.querySelector<HTMLElement>(".admin-mobile-shell")?.scrollWidth,
  }));
  expect(dimensions).toEqual({ viewport: 390, document: 390, body: 390, shell: 390 });
  assertClean();
});
