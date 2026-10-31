import { expect, test } from "@playwright/test";
import { PASSWORD, resetAccounts, seedAccount, signInWithPassword, withAccounts } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("signs in with email and password, stays signed in, and signs out (spec M5c; Review Focus 2)", async ({ page, context }) => {
  await seedAccount({ email: "admin@example.com", role: "admin", name: "Sara Admin" });
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await signInWithPassword(page, "Admin@Example.com");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name")).toHaveText("Sara Admin");
  expect((await context.cookies()).find((cookie) => cookie.name === "session")).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  await page.reload();
  await expect(page.getByTestId("user-name")).toHaveText("Sara Admin");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a wrong password and an unknown email get the same answer, and the email stays in the form", async ({ page }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com", "not the password");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Email or password is incorrect.");
  await expect(page.getByTestId("sign-in-email")).toHaveValue("admin@example.com");
  await signInWithPassword(page, "nobody@example.com");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Email or password is incorrect.");
});

test("five wrong passwords lock the email for 15 minutes, even for the right one", async ({ page }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  for (let i = 0; i < 5; i += 1) {
    await signInWithPassword(page, "admin@example.com", "not the password");
    await expect(page.getByTestId("sign-in-error")).toHaveAttribute("data-reason", "wrong");
  }
  await signInWithPassword(page, "admin@example.com");
  await expect(page.getByTestId("sign-in-error")).toHaveText("Too many attempts. Try again in 15 minutes.");
});

test("someone without a role signs in to the No access page", async ({ page }) => {
  await seedAccount({ email: "pending@example.com", role: null });
  await signInWithPassword(page, "pending@example.com");
  await expect(page).toHaveURL(/\/en\/no-access\?why=role$/);
  await expect(page.getByText("No access yet")).toBeVisible();
});

test("removing someone's role takes effect on their next page (Review Focus 1)", async ({ page }) => {
  const reviewer = await seedAccount({ email: "reviewer@example.com", role: "reviewer" });
  await signInWithPassword(page, "reviewer@example.com");
  await expect(page).toHaveURL(/\/en$/);
  await withAccounts((store) => store.setRole(reviewer.id, reviewer.clientId!, null));
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/no-access\?why=role$/);
});

test("a paused client's people see why, and get back in with nothing lost when it is active again (P1c)", async ({ page }) => {
  const admin = await seedAccount({ email: "paused@example.com", role: "admin" });
  await signInWithPassword(page, "paused@example.com");
  await expect(page).toHaveURL(/\/en$/);
  await withAccounts((store) => store.updateClient(admin.clientId!, { status: "suspended" }));
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/no-access\?why=suspended$/);
  await expect(page.getByText("Account paused")).toBeVisible();
  await withAccounts((store) => store.updateClient(admin.clientId!, { status: "active" }));
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/keywords$/);
});

test("the sign-in page in Arabic", async ({ page }) => {
  await signInWithPassword(page, "nobody@example.com", PASSWORD, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("كلمة المرور", { exact: true })).toBeVisible();
  await expect(page.getByTestId("sign-in-error")).toHaveText("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
});
