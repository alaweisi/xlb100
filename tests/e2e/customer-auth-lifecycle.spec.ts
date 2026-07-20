import { expect, test, type Page } from "@playwright/test";

const backend = "http://127.0.0.1:3180";
const customerApp = "http://127.0.0.1:5383";

function uniquePhone(offset = 0): string {
  return `138${String(Date.now() + offset).slice(-8)}`;
}

async function loginThroughCustomerUi(page: Page, phone: string): Promise<void> {
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/Verification code sent/u)).toBeVisible();

  const debug = await page.request.get(
    `${backend}/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`,
  );
  expect(debug.ok(), await debug.text()).toBeTruthy();
  const { code } = await debug.json() as { code: string };
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
}

test("Customer uses manual OTP, can logout, and recovers from an authenticated 401", async ({ page }) => {
  await page.goto(`${customerApp}/customer/profile?cityCode=hangzhou`);
  await expect(page.getByRole("heading", { name: "Customer login" })).toBeVisible();
  await expect(page.getByRole("button", { name: /debug/iu })).toHaveCount(0);

  await loginThroughCustomerUi(page, uniquePhone());
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem("xlb.customer.token"),
    userId: localStorage.getItem("xlb.customer.userId"),
  }))).toMatchObject({ token: expect.any(String), userId: expect.any(String) });
  const firstSession = await page.evaluate(() => ({
    token: localStorage.getItem("xlb.customer.token")!,
    userId: localStorage.getItem("xlb.customer.userId")!,
  }));

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Customer login" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem("xlb.customer.token"),
    userId: localStorage.getItem("xlb.customer.userId"),
  }))).toEqual({ token: null, userId: null });
  await expect.poll(async () => (await page.request.get(`${backend}/api/catalog`, {
    headers: {
      Authorization: `Bearer ${firstSession.token}`,
      "x-xlb-city-code": "hangzhou",
    },
  })).status()).toBe(401);

  await loginThroughCustomerUi(page, uniquePhone(1));
  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "token expired" }),
    });
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Customer login" })).toBeVisible();
  await expect(page.getByText("Your session expired. Please sign in again.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("xlb.customer.token"))).toBeNull();
});
