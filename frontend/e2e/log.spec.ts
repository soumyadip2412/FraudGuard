import { expect, openView, sample, test } from "./fixtures";

test.describe("Transaction log", () => {
  test("shows an empty state that leads to the Check page", async ({ page }) => {
    await page.route("**/api/transactions?*", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) }),
    );
    await openView(page, "log");
    await expect(page.getByText("No transactions recorded yet.")).toBeVisible();
    await page.getByRole("link", { name: "Check a transaction" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check a transaction");
  });

  test.describe("with recorded transactions @writes", () => {
    test.beforeAll(async ({ request }) => {
      // Enough rows for two pages, with both decisions present.
      for (let i = 0; i < 26; i++) await request.post("/api/transactions", { data: sample("legit").features });
      for (let i = 0; i < 2; i++) await request.post("/api/transactions", { data: sample("caught").features });
    });

    test.beforeEach(async ({ page }) => openView(page, "log"));

    test("pages through the log 25 at a time", async ({ page }) => {
      const pager = page.locator(".pager");
      await expect(pager).toContainText(/^1 to 25 of [\d,]+/);
      await expect(page.locator("tbody tr")).toHaveCount(25);
      await expect(pager.getByRole("button", { name: "Newer" })).toBeDisabled();
      await pager.getByRole("button", { name: "Older" }).click();
      await expect(pager).toContainText(/^26 to/);
      await pager.getByRole("button", { name: "Newer" }).click();
      await expect(pager).toContainText(/^1 to 25/);
    });

    test("filters by decision", async ({ page }) => {
      await page.getByRole("radio", { name: "Flagged" }).click();
      await expect(page.getByRole("radio", { name: "Flagged" })).toBeChecked();
      await expect(page.locator("tbody .tag").first()).toHaveText("Flagged");
      await expect(page.locator("tbody .tag", { hasText: "Cleared" })).toHaveCount(0);

      await page.getByRole("radio", { name: "Cleared" }).click();
      await expect(page.locator("tbody .tag").first()).toHaveText("Cleared");
      await expect(page.locator("tbody .tag", { hasText: "Flagged" })).toHaveCount(0);
    });

    test("expands a row to show why, and collapses it again", async ({ page }) => {
      const toggle = page.locator(".row-toggle").first();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const detail = page.locator(".row-detail");
      await expect(detail.getByRole("heading", { level: 3 })).toBeVisible();
      await expect(detail).toContainText(/Recorded .* Scored by XGBoost with a flagging threshold of 62.8%/);
      await expect(detail.getByRole("heading", { name: "What drove this score?" })).toBeVisible();
      await toggle.click();
      await expect(detail).toHaveCount(0);
    });

    test("refresh picks up new transactions", async ({ page, request }) => {
      const pager = page.locator(".pager");
      const before = Number((await pager.textContent())!.match(/of ([\d,]+)/)![1].replace(/,/g, ""));
      await request.post("/api/transactions", { data: sample("legit").features });
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(pager).toContainText(`of ${(before + 1).toLocaleString()}`);
    });
  });
});
