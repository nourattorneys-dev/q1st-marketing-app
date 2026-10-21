import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, pageInSharedStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin sees everyone who can sign in, with role, two-factor status and last sign-in", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("nav-users")).toBeVisible();
  await expect(page.getByTestId("user-dev_reviewer")).toContainText("reviewer@example.com");
  await expect(page.getByTestId("user-role-dev_reviewer")).toHaveValue("reviewer");
  await expect(page.getByTestId("user-role-dev_norole")).toHaveValue("none");
  await expect(page.getByTestId("user-twofactor-dev_admin")).toHaveText("On");
  await expect(page.getByTestId("user-twofactor-dev_reviewer")).toHaveText("Off");
  expect(normalizeSpaces(await page.getByTestId("user-last-dev_reviewer").innerText())).toBe("Wed, Oct 21, 9:00 AM");
  await expect(page.getByTestId("user-last-dev_norole")).toHaveText("Never");
  await expect(page.getByTestId("users-test-notice")).toBeVisible();
});

test("an admin can't change their own access (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("user-you-dev_admin")).toBeVisible();
  await expect(page.getByTestId("user-role-dev_admin")).toBeDisabled();
  await expect(page.getByTestId("user-apply-dev_admin")).toBeDisabled();
  await expect(page.getByTestId("user-role-dev_reviewer")).toBeEnabled();
});

test("removing a reviewer's access takes effect on their next page; giving it back lets them in (Review Focus 1)", async ({ browser }) => {
  const store = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const admin = await pageInSharedStore(browser, store, "dev_admin");
  const reviewer = await pageInSharedStore(browser, store, "dev_reviewer");
  await reviewer.goto("/en");
  await expect(reviewer.getByTestId("user-role")).toHaveText("Reviewer");

  await admin.goto("/en/users");
  await admin.getByTestId("user-role-dev_reviewer").selectOption("none");
  await admin.getByTestId("user-apply-dev_reviewer").click();
  await expect(admin.getByTestId("user-changed-dev_reviewer")).toBeVisible();
  await reviewer.goto("/en/keywords");
  await expect(reviewer).toHaveURL(/\/en\/no-access$/);

  await admin.getByTestId("user-role-dev_reviewer").selectOption("reviewer");
  await admin.getByTestId("user-apply-dev_reviewer").click();
  await expect(admin.getByTestId("user-changed-dev_reviewer")).toBeVisible();
  await reviewer.goto("/en");
  await expect(reviewer).toHaveURL(/\/en$/);
  await expect(reviewer.getByTestId("user-role")).toHaveText("Reviewer");
});

test("an admin invites by email with a role, can't invite the same person twice in any capitalisation, and revokes (Review Focus 3)", async ({
  page,
  context,
}) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByTestId("invites-empty")).toBeVisible();

  await page.getByTestId("invite-email").fill("  New.Person@Example.com ");
  await page.getByTestId("invite-role").selectOption("admin");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-sent")).toHaveText("Invitation sent to new.person@example.com.");
  await expect(page.getByTestId("pending-invite-inv_1")).toContainText("new.person@example.com");
  await expect(page.getByTestId("pending-invite-inv_1")).toContainText("Admin");

  await page.getByTestId("invite-email").fill("NEW.PERSON@example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-error")).toHaveText("This person already has an account or an invitation.");
  await page.getByTestId("invite-email").fill("Reviewer@Example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-error")).toHaveText("This person already has an account or an invitation.");
  await expect(page.locator('[data-testid^="pending-invite-"]')).toHaveCount(1);

  await page.getByTestId("pending-revoke-inv_1").click();
  await expect(page.getByTestId("pending-invite-inv_1")).toHaveCount(0);
  await expect(page.getByTestId("invites-empty")).toBeVisible();
});

test("an address that isn't an email gets a message next to the field (Review Focus 3)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("not-an-email");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-email-error")).toHaveText("Enter an email address.");
  await expect(page.getByTestId("invite-email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("invites-empty")).toBeVisible();
});

test("a reviewer has no Users item and is sent back from /users", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/users");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-users")).toHaveCount(0);
});

test("when the sign-in service can't be reached, the page says so instead of crashing (Review Focus 4)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setMockScenario(context, "signin_down");
  await page.goto("/en/users");
  await expect(page.getByTestId("users-unavailable")).toHaveText("The sign-in service can't be reached right now. Try again shortly.");
  await expect(page.getByTestId("nav-users")).toBeVisible();
});

test("the Users page in Arabic: right to left, Arabic labels, Latin digits", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/users");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "المستخدمون" })).toBeVisible();
  await expect(page.getByTestId("user-twofactor-dev_admin")).toHaveText("مفعّل");
  await expect(page.getByTestId("user-role-dev_norole").locator("option:checked")).toHaveText("بلا صلاحية");
  const last = normalizeSpaces(await page.getByTestId("user-last-dev_reviewer").innerText());
  expect(last).toContain("9:00");
  expect(last).not.toMatch(/[٠-٩]/);
});

test("the dashboard's own refusal is in Arabic, not \"Invalid request.\" (M4b follow-up; Review Focus 3)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/users");
  await page.getByTestId("invite-email").fill(`${"a".repeat(310)}@example.com`);
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-error")).toHaveText("لم يُقبل هذا الطلب. تحقّق منه وحاول مرة أخرى.");
});

test("each person's controls are labelled with their name, so a screen reader can tell the rows apart (M4b follow-up)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/users");
  await expect(page.getByRole("combobox", { name: "Access for Reviewer (test)" })).toHaveValue("reviewer");
  await expect(page.getByRole("button", { name: "Apply for Reviewer (test)" })).toHaveCount(1);
});
