import { expect,test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function assertNoPageErrors(page: Page) {
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  return ()=>expect(errors,"browser console/page errors").toEqual([]);
}

test("customer profile and address book use persisted APIs",async({page})=>{
  const assertClean=await assertNoPageErrors(page);
  const detail=`阶段二十一验证地址 ${Date.now()}`;
  const codeRequest=await page.request.post("http://localhost:3100/api/auth/customer/code",{data:{phone:"13800000001"}});expect(codeRequest.ok()).toBeTruthy();
  const debug=await page.request.get("http://localhost:3100/api/auth/customer/debug-code?phone=13800000001");expect(debug.ok()).toBeTruthy();
  const {code}=await debug.json();
  const login=await page.request.post("http://localhost:3100/api/auth/customer/login",{data:{phone:"13800000001",code}});expect(login.ok()).toBeTruthy();
  const session={...(await login.json()),phone:"13800000001"};
  await page.addInitScript(value=>{localStorage.setItem("xlb.customer.token",value.token);localStorage.setItem("xlb.customer.userId",value.userId);},session);
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading",{name:"账号资料"})).toBeVisible();
  await expect(page.getByText("服务端数据")).toBeVisible();
  await page.getByLabel("联系人").fill("阶段二十一顾客");
  await page.getByLabel("手机号").fill("13800000001");
  await page.getByLabel("区县").fill("西湖区");
  await page.getByLabel("详细地址").fill(detail);
  await page.getByRole("button",{name:"添加地址"}).click();
  await expect(page.getByRole("status")).toContainText("地址已添加");
  const addressCard=page.getByText(detail).locator("..");
  await addressCard.getByRole("button",{name:"删除"}).click();
  await addressCard.getByRole("button",{name:"确认删除"}).click();
  await expect(page.getByRole("status")).toContainText("地址已删除");
  assertClean();
});

test("worker location page reports private location through the Phase 20 API",async({page})=>{
  const assertClean=await assertNoPageErrors(page);
  const codeRequest=await page.request.post("http://localhost:3100/api/auth/worker/code",{data:{phone:"13800000001"}});expect(codeRequest.ok()).toBeTruthy();
  const debug=await page.request.get("http://localhost:3100/api/auth/worker/debug-code?phone=13800000001");expect(debug.ok()).toBeTruthy();
  const {code}=await debug.json();
  const login=await page.request.post("http://localhost:3100/api/auth/worker/login",{data:{phone:"13800000001",code}});expect(login.ok()).toBeTruthy();
  const session={...(await login.json()),phone:"13800000001"};
  await page.addInitScript(value=>localStorage.setItem("xlb.worker.session",JSON.stringify(value)),session);
  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading",{name:"个人资料"})).toBeVisible();
  await expect(page.getByText("位置共享与接单半径")).toBeVisible();
  await page.getByRole("button",{name:"更新当前位置"}).click();
  await expect(page.getByText("位置有效")).toBeVisible();
  await expect(page.getByText("位置共享已开启")).toBeVisible();
  assertClean();
});

test("admin operations renders real city-scoped orders, SKUs and certification queue",async({page})=>{
  const assertClean=await assertNoPageErrors(page);
  const codeRequest=await page.request.post("http://localhost:3100/api/auth/admin/code",{data:{username:"admin_hz"}});expect(codeRequest.ok()).toBeTruthy();
  const debug=await page.request.get("http://localhost:3100/api/auth/admin/debug-code?username=admin_hz");expect(debug.ok()).toBeTruthy();
  const {code}=await debug.json();
  const login=await page.request.post("http://localhost:3100/api/auth/admin/login",{data:{username:"admin_hz",code}});expect(login.ok()).toBeTruthy();
  const session=await login.json();
  await page.addInitScript(value=>{localStorage.setItem("xlb.admin.token",value.token);localStorage.setItem("xlb.admin.userId",value.userId);localStorage.setItem("xlb.admin.role",value.role);localStorage.setItem("xlb.admin.username","admin_hz");},session);
  await page.goto("http://localhost:5275/#/platform-operations?cityCode=hangzhou");
  await expect(page.getByRole("heading",{name:"平台运营联动工作台"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"城市订单池"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"正式服务目录"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"师傅认证审核"})).toBeVisible();
  await expect(page.getByText("城市级受控写入")).toBeVisible();
  assertClean();
});
