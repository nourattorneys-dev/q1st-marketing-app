import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("approves a post with no critical findings", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
  await page.goto("/en/review");
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
});

test("overriding a critical finding needs a reason", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("approve-confirm")).toBeDisabled();
  await page.getByTestId("approve-note").fill("Length agreed with the client");
  await page.getByTestId("approve-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
});

test("an Arabic version whose structure doesn't match can't be approved (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("approve-blocked")).toBeVisible();
  await expect(page.getByTestId("approve-note")).toHaveCount(0);
});

test("fixing the finding lets you approve directly", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await page.getByTestId("field-meta-description").fill("Buy-outs, mediation and court exits for deadlocked UAE companies.");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.getByTestId("checks-critical")).toHaveCount(0);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("post-status")).toHaveText("Approved");
});

test("asking for changes redrafts the post and brings it back for review", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("changes").click();
  await page.getByTestId("changes-note").fill("Shorter introduction");
  await page.getByTestId("changes-confirm").click();
  await expect(page.getByTestId("job-progress")).toBeVisible();
  await expect(page.getByTestId("post-status")).toHaveText("Waiting for review", { timeout: 15_000 });
  await expect(page.getByText("Requested change: Shorter introduction")).toBeVisible();
  await expect(page.getByTestId("editor-body")).toContainText("Revised as requested: Shorter introduction");
});

test("rejects, then deletes, returning to the queue", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await page.getByTestId("reject").click();
  await page.getByTestId("reject-note").fill("Off-topic");
  await page.getByTestId("reject-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Rejected");
  await page.getByTestId("delete").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page).toHaveURL(/\/en\/review$/);
  await expect(page.getByTestId("card-p_206")).toHaveCount(0);
});

test("the dialog's Close button is labelled in Arabic (M2a follow-up; Review Focus 3)", async ({ page }) => {
  await page.goto("/ar/review/p_201");
  await page.getByTestId("reject").click();
  await expect(page.getByRole("button", { name: "إغلاق" })).toBeVisible();
});
