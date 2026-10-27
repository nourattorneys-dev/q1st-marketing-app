import { expect, test } from "@playwright/test";
import { newEmails, readOutbox } from "../e2e/helpers";
import { linkIn, resetAccounts, seedAccount, signInWithPassword } from "./helpers";

test.beforeEach(async () => {
  await resetAccounts();
});

test("with EMAIL_MODE=log an invitation is kept and marked not sent; Resend makes a new link and the old one stops working (spec M5c)", async ({ page, browser }) => {
  await seedAccount({ email: "admin@example.com", role: "admin" });
  await signInWithPassword(page, "admin@example.com");
  await expect(page).toHaveURL(/\/en$/);
  const before = await readOutbox(page);
  await page.goto("/en/users");
  await page.getByTestId("invite-email").fill("resend.me@example.com");
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-not-sent")).toHaveText("Invitation saved, but not sent: this server doesn't send emails yet.");
  const first = linkIn(newEmails(before, await readOutbox(page))[0].text, "invitation");

  const row = page.locator('[data-testid^="pending-invite-"]', { hasText: "resend.me@example.com" });
  await row.locator('[data-testid^="pending-resend-"]').click();
  await expect(page.getByTestId("invites-resent")).toHaveAttribute("data-not-sent", "true");
  const sent = newEmails(before, await readOutbox(page));
  expect(sent).toHaveLength(2);
  const second = linkIn(sent[1].text, "invitation");
  expect(second).not.toBe(first);

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(first);
  await expect(invitee.getByTestId("invitation-problem")).toHaveText("This invitation link isn't valid.");
  await invitee.goto(second);
  await expect(invitee.getByTestId("invitation-name")).toBeVisible();
});
