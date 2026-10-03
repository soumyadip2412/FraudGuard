import { expect, openView, test } from "./fixtures";

test.describe("Guide", () => {
  test("is linked from the empty Check page", async ({ page }) => {
    await openView(page, "check");
    await page.getByRole("link", { name: "Read the guide" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How to use FraudGuard");
  });

  test("covers every part of the app", async ({ page }) => {
    await openView(page, "guide");
    const sections = [
      "What FraudGuard can tell you", "What FraudGuard cannot tell you", "Check one transaction", "Reading the verdict",
      "What drove this score", "Technical details", "Check a file", "The log", "The model page", "API key",
      "Words used here", "If something goes wrong",
    ];
    for (const section of sections) {
      await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("list", { name: "How the amount and the anonymised characteristics moved the score" })).toBeVisible();
  });

  test("is honest about what the anonymised features can't say", async ({ page }) => {
    await openView(page, "guide");
    await expect(page.getByText("Their original real-world meanings are not available")).toBeVisible();
    await expect(page.getByText("An unusual transaction is not automatically fraudulent.")).toBeVisible();
  });

  test("quotes the live model's threshold", async ({ page }) => {
    await openView(page, "guide");
    await expect(page.locator(".terms").first()).toContainText("62.8% or higher");
    await expect(page.getByText("Between 31.4% and 62.8%")).toBeVisible();
  });

  test("every link inside it leads to the right section", async ({ page }) => {
    const targets = [
      { name: "Check", title: "Check a transaction" },
      { name: "Batch", title: "Check a file of transactions" },
      { name: "Log", title: "Transaction log" },
      { name: "Model", title: "XGBoost" },
    ];
    for (const { name, title } of targets) {
      await openView(page, "guide");
      await page.locator(".guide").getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });
});
