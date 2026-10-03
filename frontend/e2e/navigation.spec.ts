import { checkSample, expect, openView, test } from "./fixtures";

const SECTIONS = [
  { tab: "Check", hash: "check", title: "Check a transaction" },
  { tab: "Batch", hash: "batch", title: "Check a file of transactions" },
  { tab: "Log", hash: "log", title: "Transaction log" },
  { tab: "Model", hash: "model", title: "XGBoost" },
  { tab: "Guide", hash: "guide", title: "How to use FraudGuard" },
];

test.describe("Navigation", () => {
  test("every tab opens its section and marks itself current", async ({ page }) => {
    await openView(page, "check");
    for (const { tab, hash, title } of SECTIONS) {
      await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("the browser back button returns to the previous section", async ({ page }) => {
    await openView(page, "check");
    await page.getByRole("link", { name: "Model", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("XGBoost");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check a transaction");
  });

  test("an unknown address falls back to Check", async ({ page }) => {
    await page.goto("/#does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check a transaction");
  });

  test("the model page reports the held-out test results", async ({ page }) => {
    await openView(page, "model");
    await expect(page.getByText("52 of 71")).toBeVisible();
    await expect(page.getByText("0.829")).toBeVisible();
    await expect(page.getByText(/flagged when its fraud chance is 62.8% or higher/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "About the data" })).toBeVisible();
    await expect(page.getByText("can't be assigned real-world meanings")).toBeVisible();
    const technical = page.locator(".technical");
    await expect(technical.locator(".feature-list")).toBeHidden();
    await technical.getByText("Technical details").click();
    await expect(technical.locator(".feature-list")).toContainText("V1, V2, V3");
  });
});

test.describe("When the API is down", () => {
  test("says so, and recovers with Try again", async ({ page }) => {
    await page.route("**/api/model", (route) => route.abort());
    await page.goto("/#check");
    await expect(page.getByRole("heading", { name: "The API isn't answering" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Can't reach the FraudGuard API");
    await page.unroute("**/api/model");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check a transaction");
  });
});

const keyButton = (page: import("@playwright/test").Page) => page.locator(".key-control summary");

test.describe("API key", () => {
  // Simulates a server with API_KEY=e2e-key; the real check is covered by the API tests.
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/predictions", (route) =>
      route.request().headers()["x-api-key"] === "e2e-key"
        ? route.continue()
        : route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Invalid or missing API key" }) }),
    );
    await openView(page, "check");
  });

  test("explains a missing key, then works once it is saved and remembered", async ({ page }) => {
    await checkSample(page, "legit");
    await expect(page.getByRole("alert")).toHaveText("This server requires an API key. Add it under API key in the top bar.");

    await keyButton(page).click();
    await page.getByLabel("API key").fill("e2e-key");
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(keyButton(page)).toHaveText("API key saved");

    await page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await expect(page.locator(".verdict h2")).toHaveText("Looks legitimate");

    await page.reload();
    await expect(keyButton(page)).toHaveText("API key saved");
  });

  test("a cleared key is forgotten", async ({ page }) => {
    await keyButton(page).click();
    await page.getByLabel("API key").fill("e2e-key");
    await page.getByRole("button", { name: "Save key" }).click();
    await keyButton(page).click();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "Save key" }).click();
    await expect(keyButton(page)).toHaveText("API key");
  });
});
