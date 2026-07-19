import { expect,test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { hashPhoneIdentity } from "../../backend/src/auth/phoneIdentity.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const workerPhone = "13800000001";
let workerPhoneBefore: { phone_hash: string | null; phone_masked: string | null; updated_at: Date } | null = null;

test.beforeAll(async()=>{
  const [rows]=await getMysqlPool().query<(RowDataPacket&{phone_hash:string|null;phone_masked:string|null;updated_at:Date})[]>(
    "SELECT phone_hash,phone_masked,updated_at FROM worker_profiles WHERE worker_id='worker-demo-hangzhou'",
  );
  workerPhoneBefore=rows[0]??null;
  if(!workerPhoneBefore)throw new Error("worker-demo-hangzhou fixture is missing");
  await getMysqlPool().query(
    "UPDATE worker_profiles SET phone_hash=?,phone_masked=? WHERE worker_id='worker-demo-hangzhou'",
    [hashPhoneIdentity(workerPhone),"138****0001"],
  );
});

test.afterAll(async()=>{
  if(workerPhoneBefore){
    await getMysqlPool().query(
      "UPDATE worker_profiles SET phone_hash=?,phone_masked=?,updated_at=? WHERE worker_id='worker-demo-hangzhou'",
      [workerPhoneBefore.phone_hash,workerPhoneBefore.phone_masked,workerPhoneBefore.updated_at],
    );
  }
});

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
  await expect(page.getByText("Code sent. It expires in 300s.")).toBeVisible();
  await page.getByRole("button",{name:"Fill debug code"}).click();
  await expect(page.getByLabel("code",{exact:true})).toHaveValue(/^\d{6}$/);
  const loginButton=page.getByRole("button",{name:"Login"});
  await expect(loginButton).toBeEnabled();
  await loginButton.click();
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
