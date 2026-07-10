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
  const detail=`Phase21 smoke ${Date.now()}`;
  const codeRequest=await page.request.post("http://localhost:3100/api/auth/customer/code",{data:{phone:"13800000001"}});expect(codeRequest.ok()).toBeTruthy();
  const debug=await page.request.get("http://localhost:3100/api/auth/customer/debug-code?phone=13800000001");expect(debug.ok()).toBeTruthy();
  const {code}=await debug.json();
  const login=await page.request.post("http://localhost:3100/api/auth/customer/login",{data:{phone:"13800000001",code}});expect(login.ok()).toBeTruthy();
  const session=await login.json();
  await page.addInitScript(value=>{localStorage.setItem("xlb.customer.token",value.token);localStorage.setItem("xlb.customer.userId",value.userId);},session);
  await page.goto("http://localhost:5273/customer/profile?cityCode=hangzhou");
  await expect(page.getByRole("heading",{name:"Account"})).toBeVisible();
  await expect(page.getByText("Real API")).toBeVisible();
  await page.getByLabel("Contact").fill("Phase21 Customer");
  await page.getByLabel("Mobile").fill("13800000001");
  await page.getByLabel("District").fill("西湖区");
  await page.getByLabel("Detail address").fill(detail);
  await page.getByRole("button",{name:"Add address"}).click();
  await expect(page.getByRole("status")).toContainText("Address added");
  await page.getByText(detail).locator("..").getByRole("button",{name:"Delete"}).click();
  await expect(page.getByRole("status")).toContainText("Address deleted");
  assertClean();
});

test("worker location page reports private location through the Phase 20 API",async({page})=>{
  const assertClean=await assertNoPageErrors(page);
  await page.goto("http://localhost:5274/worker/profile?cityCode=hangzhou");
  await page.getByRole("button",{name:"Send code"}).click();
  await page.getByRole("button",{name:"Fill debug code"}).click();
  await page.getByRole("button",{name:"Login"}).click();
  await expect(page.getByRole("heading",{name:"Location & Availability"})).toBeVisible();
  await page.getByRole("button",{name:"Report current location"}).click();
  await expect(page.locator("strong",{hasText:"fresh"})).toBeVisible();
  await expect(page.getByText("Private exact")).toBeVisible();
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
  await expect(page.getByRole("heading",{name:"Platform Operations"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Order Pool"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"SKU Availability"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Worker Certification Review"})).toBeVisible();
  await expect(page.getByText("admin-only API")).toBeVisible();
  assertClean();
});
