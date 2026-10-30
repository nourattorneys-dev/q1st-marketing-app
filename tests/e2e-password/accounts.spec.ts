import { expect, test } from "@playwright/test";
import { hashToken, newToken } from "../../src/lib/accounts/tokens";
import { newEmails, readOutbox } from "../e2e/helpers";
import { OWNER_EMAIL } from "./constants";
import { e2eClientId, linkIn, PASSWORD, resetAccounts, seedAccount, signInWithPassword, withAccounts } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("the first Admin: with no Admin, the sign-in page emails ADMIN_EMAIL an invitation, once; following it makes the Admin (spec M5c)", async ({ page }) => {
  const before = await readOutbox(page);
  await page.goto("/en/sign-in");
  await expect(page.getByTestId("first-admin")).toHaveAttribute("data-state", "invited");
  await expect(page.getByTestId("first-admin")).toContainText("o•••@example.com");
  await page.reload();
  const sent = newEmails(before, await readOutbox(page));
  expect(sent.map((email) => email.to)).toEqual([OWNER_EMAIL]);
  expect(sent[0].subject).toBe("You're invited to Q1st Marketing · دعوة إلى Q1st Marketing");

  await page.goto(linkIn(sent[0].text, "invitation"));
  await expect(page.getByTestId("invitation-email")).toHaveValue(OWNER_EMAIL);
  await expect(page.getByTestId("invitation-intro")).toContainText("as Admin");
  await page.getByTestId("invitation-name").fill("Nour Owner");
  await page.getByTestId("invitation-password").fill(PASSWORD);
  await page.getByTestId("invitation-confirm").fill(PASSWORD);
  await page.getByTestId("invitation-submit").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-role")).toHaveText("Admin");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByTestId("first-admin")).toHaveCount(0);
});

test("an Admin invites a Reviewer, who sets a password and signs in; the link works once (Review Focus 3)", async ({ page, browser }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com");
  await expect(page).toHaveURL(/\/en$/);
  const before = await readOutbox(page);
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("New.Reviewer@Example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.locator('[data-testid^="pending-invite-"]')).toContainText("new.reviewer@example.com");
  const [invitation] = newEmails(before, await readOutbox(page));
  expect(invitation.to).toBe("new.reviewer@example.com");
  const link = linkIn(invitation.text, "invitation");

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(link);
  await invitee.getByTestId("invitation-name").fill("Omar");
  await invitee.getByTestId("invitation-password").fill(PASSWORD);
  await invitee.getByTestId("invitation-confirm").fill(PASSWORD);
  await invitee.getByTestId("invitation-submit").click();
  await expect(invitee).toHaveURL(/\/en$/);
  await expect(invitee.getByTestId("user-role")).toHaveText("Reviewer");

  const again = await (await browser.newContext()).newPage();
  await again.goto(link);
  await expect(again.getByTestId("invitation-problem")).toHaveText("This invitation link isn't valid.");
});

test("an expired invitation says so; the form checks the two passwords match; Arabic", async ({ page }) => {
  const expiredToken = newToken();
  const liveToken = newToken();
  const past = new Date(Date.now() - 60_000);
  const clientId = await e2eClientId();
  await withAccounts(async (store) => {
    await store.addInvitation({ id: "inv_e2e_expired", email: "late@example.com", role: "reviewer", clientId, siteIds: null, tokenHash: hashToken(expiredToken), invitedBy: null, createdAt: past, expiresAt: past });
    await store.addInvitation({ id: "inv_e2e_live", email: "live@example.com", role: "reviewer", clientId, siteIds: null, tokenHash: hashToken(liveToken), invitedBy: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
  });
  await page.goto(`/en/invitation?token=${expiredToken}`);
  await expect(page.getByTestId("invitation-problem")).toHaveText("This invitation has expired. Ask your Admin for a new one.");

  await page.goto(`/en/invitation?token=${liveToken}`);
  await page.getByTestId("invitation-name").fill("Live");
  await page.getByTestId("invitation-password").fill(PASSWORD);
  await page.getByTestId("invitation-confirm").fill("something else entirely");
  await page.getByTestId("invitation-submit").click();
  await expect(page.getByTestId("invitation-error")).toHaveText("The two passwords don't match.");
  await expect(page.getByTestId("invitation-name")).toHaveValue("Live");

  await page.goto("/ar/invitation?token=nonsense");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("invitation-problem")).toHaveText("رابط الدعوة هذا غير صالح.");
});

test("forgot password: the same answer for any email; the link sets a new password, signs out everywhere else, and works once (Review Focus 2)", async ({ page, browser }) => {
  await seedAccount({ email: "reviewer@example.com", role: "reviewer" });
  const elsewhere = await (await browser.newContext()).newPage();
  await signInWithPassword(elsewhere, "reviewer@example.com");
  await expect(elsewhere).toHaveURL(/\/en$/);

  const before = await readOutbox(page);
  await page.goto("/en/sign-in");
  await page.getByTestId("sign-in-forgot").click();
  await expect(page).toHaveURL(/\/en\/forgot-password$/);
  await page.getByTestId("forgot-email").fill("nobody@example.com");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toHaveText("If this email has an account, we've sent a link to reset its password.");
  await page.getByTestId("forgot-email").fill("Reviewer@Example.com");
  await page.getByTestId("forgot-submit").click();
  await expect(page.getByTestId("forgot-sent")).toBeVisible();
  await expect.poll(async () => newEmails(before, await readOutbox(page)).length).toBe(1);
  const [reset] = newEmails(before, await readOutbox(page));
  expect(reset.to).toBe("reviewer@example.com");
  const link = linkIn(reset.text, "reset-password");

  await page.goto(link);
  await page.getByTestId("reset-password").fill("a brand new password");
  await page.getByTestId("reset-confirm").fill("a brand new password");
  await page.getByTestId("reset-submit").click();
  await expect(page).toHaveURL(/\/en$/);
  await elsewhere.reload();
  await expect(elsewhere).toHaveURL(/\/en\/sign-in$/);
  await page.goto(link);
  await expect(page.getByTestId("reset-invalid")).toHaveText("This link isn't valid any more. Ask for a new one.");
  await signInWithPassword(elsewhere, "reviewer@example.com", PASSWORD);
  await expect(elsewhere.getByTestId("sign-in-error")).toHaveAttribute("data-reason", "wrong");
  await signInWithPassword(elsewhere, "reviewer@example.com", "a brand new password");
  await expect(elsewhere).toHaveURL(/\/en$/);
});

test("changing the password on the Account page keeps this session and ends the others", async ({ page, browser }) => {
  await seedAccount({ email: "reviewer@example.com", role: "reviewer", name: "Omar" });
  const elsewhere = await (await browser.newContext()).newPage();
  await signInWithPassword(elsewhere, "reviewer@example.com");
  await expect(elsewhere).toHaveURL(/\/en$/);
  await signInWithPassword(page, "reviewer@example.com");
  await expect(page.getByTestId("user-security")).toHaveText("Account");
  await page.getByTestId("user-security").click();
  await expect(page).toHaveURL(/\/en\/security$/);
  await expect(page.getByTestId("account-details")).toContainText("reviewer@example.com");

  await page.getByTestId("account-current").fill("not the password");
  await page.getByTestId("account-password").fill("a brand new password");
  await page.getByTestId("account-confirm").fill("a brand new password");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-error")).toHaveText("Your current password is incorrect.");

  await page.getByTestId("account-current").fill(PASSWORD);
  await page.getByTestId("account-password").fill("a brand new password");
  await page.getByTestId("account-confirm").fill("a brand new password");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-changed")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/en\/security$/);
  await elsewhere.reload();
  await expect(elsewhere).toHaveURL(/\/en\/sign-in$/);
});

test("the forgot-password page in Arabic", async ({ page }) => {
  await page.goto("/ar/forgot-password");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("نسيت كلمة المرور؟", { exact: true })).toBeVisible();
});
