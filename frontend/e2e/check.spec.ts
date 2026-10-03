import { DATASET_HEADER, checkSample, datasetLine, expect, openView, pickSample, sample, test } from "./fixtures";

const amountInput = (page: import("@playwright/test").Page) => page.getByLabel("Transaction amount");
const openAdvanced = (page: import("@playwright/test").Page) => page.getByText("Advanced: enter anonymised model features").click();
const V_NAME = /\bV\d{1,2}\b/;

test.describe("Check a transaction", () => {
  test.beforeEach(async ({ page }) => openView(page, "check"));

  test("leads with choosing a transaction, with manual features collapsed", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "No transaction checked yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Caught fraud/ })).toBeVisible();
    await expect(page.getByText("Paste a dataset row")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload a CSV file" })).toHaveAttribute("href", "#batch");
    await expect(amountInput(page)).toBeVisible();
    await expect(page.getByLabel("V1", { exact: true })).toBeHidden();
  });

  test("each example gives the expected verdict with a grouped explanation", async ({ page }) => {
    const cases = [
      { id: "caught", headline: "Likely fraud", text: "98.8% chance of fraud, above the 62.8% threshold", pattern: "Very unusual" },
      { id: "legit", headline: "Looks legitimate", text: "well under the 62.8% threshold", pattern: null },
      { id: "missed", headline: "Borderline, not flagged", text: "60.6% chance of fraud, under the 62.8% threshold", pattern: "Highly unusual" },
    ] as const;
    for (const { id, headline, text, pattern } of cases) {
      await checkSample(page, id);
      const verdict = page.locator(".verdict");
      await expect(verdict.getByRole("heading", { level: 2 })).toHaveText(headline);
      await expect(verdict).toContainText(text);
      const drivers = verdict.locator(".drivers");
      await expect(drivers.getByRole("heading", { name: "What drove this score?" })).toBeVisible();
      for (const term of ["Transaction amount", "Anonymised characteristics", "Overall transaction pattern"]) {
        await expect(drivers.locator("dt", { hasText: term })).toBeVisible();
      }
      if (pattern) await expect(drivers).toContainText(`${pattern} compared with legitimate training transactions.`);
      await expect(drivers).toContainText("Unusual does not necessarily mean fraudulent.");
      // Typical transaction, amount, anonymised group, this transaction: nothing left over.
      const grouped = verdict.getByRole("list", { name: "How the amount and the anonymised characteristics moved the score" });
      await expect(grouped.getByRole("listitem")).toHaveCount(4);
      // No individual V-feature and no raw SHAP number in the default view.
      expect(await drivers.innerText()).not.toMatch(V_NAME);
      expect(await grouped.innerText()).not.toMatch(/[+−]\d+\.\d\d/);
    }
  });

  test("states the amount, its percentile and its effect in plain words", async ({ page }) => {
    await checkSample(page, "caught");
    const driver = (term: string) => page.locator(".driver").filter({ has: page.locator("dt", { hasText: new RegExp("^" + term + "$") }) });
    const amount = driver("Transaction amount");
    await expect(amount).toContainText("219.80, higher than about 91% of legitimate transactions in the training data.");
    await expect(amount).toContainText("The amount moderately increased the model's score.");
    const group = driver("Anonymised characteristics");
    await expect(group).toContainText("Together, the 28 anonymised characteristics strongly increased the model's score.");
    await expect(group).toContainText("17 of them increased the score and 11 decreased it.");
  });

  test("technical details stay collapsed until opened", async ({ page }) => {
    await checkSample(page, "caught");
    const technical = page.locator(".technical");
    const table = technical.getByRole("table", { name: "Largest individual contributions" });
    await expect(table).toBeHidden();
    await technical.getByText("Technical details").click();
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /V17/ })).toContainText("+4.512");
    await expect(technical.getByRole("list", { name: "How each feature moved the fraud score" })).toBeVisible();
    await expect(technical).toContainText("198,277 legitimate transactions from the training split");
    await technical.getByText("Percentile of every input").click();
    await expect(technical.locator(".percentile-grid li")).toHaveCount(29);
    await technical.getByText("Technical details").click();
    await expect(table).toBeHidden();
  });

  test("picking an example fills every field, including the advanced ones", async ({ page }) => {
    await pickSample(page, "caught");
    await expect(amountInput(page)).toHaveValue(String(sample("caught").features.Amount));
    await expect(page.getByText("From the selected record.")).toBeVisible();
    await openAdvanced(page);
    await expect(page.getByLabel("V17", { exact: true })).toHaveValue(String(sample("caught").features.V17));
  });

  test("an edited amount is a labelled what-if that can be reset", async ({ page }) => {
    await pickSample(page, "caught");
    await amountInput(page).fill("5");
    await expect(page.locator(".tag-whatif")).toHaveText("Amount what-if");
    await expect(page.getByText("the record's own amount is 219.80")).toBeVisible();
    await page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await expect(page.locator(".whatif-note")).toContainText("scored with 5.00 instead of the record's 219.80");
    await page.getByRole("button", { name: "Reset amount" }).click();
    await expect(amountInput(page)).toHaveValue("219.8");
    await expect(page.locator(".tag-whatif")).toHaveCount(0);
  });

  test("analysts can still enter all 29 inputs by hand", async ({ page }) => {
    await openAdvanced(page);
    const features = sample("legit").features;
    await amountInput(page).fill(String(features.Amount));
    for (let i = 1; i <= 28; i++) await page.getByLabel(`V${i}`, { exact: true }).fill(String(features[`V${i}`]));
    await page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await expect(page.locator(".verdict h2")).toHaveText("Looks legitimate");
    await expect(page.locator(".tag-whatif")).toHaveCount(0); // no record was loaded, so nothing to compare with
  });

  test("explains what's missing instead of sending an incomplete form", async ({ page }) => {
    const check = () => page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await check();
    await expect(page.getByRole("alert")).toHaveText("Pick an example, paste a dataset row, or fill in the advanced fields first.");
    await amountInput(page).fill("10");
    await check();
    await expect(page.getByRole("alert")).toHaveText(
      "Some anonymised model features are empty (V1, V2, V3, V4, V5 and 23 more). Pick an example, paste a row, or fill them in under Advanced.",
    );
  });

  test("turns server validation errors into plain language", async ({ page }) => {
    await pickSample(page, "legit");
    await amountInput(page).fill("-5");
    await page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("The amount must be 0 or more.");

    await page.route("**/api/predictions", (route) =>
      route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: [{ loc: ["body", "V3"], msg: "Field required" }] }) }),
    );
    await amountInput(page).fill("10");
    await page.getByRole("button", { name: "Check transaction", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("An anonymised model feature (V3) is required.");
  });

  test("still works with an older API response that has no explanation", async ({ page }) => {
    await page.route("**/api/predictions", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      delete body.explanation;
      await route.fulfill({ response, json: body });
    });
    await checkSample(page, "caught");
    const verdict = page.locator(".verdict");
    await expect(verdict.getByRole("heading", { level: 2 })).toHaveText("Likely fraud");
    await expect(verdict.getByRole("list", { name: "How each feature moved the fraud score" })).toBeVisible();
    await expect(verdict.getByRole("heading", { name: "What drove this score?" })).toHaveCount(0);
    await expect(verdict.locator(".technical")).toHaveCount(0);
  });

  test("disables the buttons while a check is in progress", async ({ page }) => {
    await page.route("**/api/predictions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await checkSample(page, "legit");
    await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Check and record" })).toBeDisabled();
    await expect(page.locator(".verdict h2")).toHaveText("Looks legitimate");
  });

  test("shows a clear message when the model isn't available", async ({ page }) => {
    await page.route("**/api/predictions", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Model not available; train it first" }) }),
    );
    await checkSample(page, "legit");
    await expect(page.getByRole("alert")).toHaveText("Model not available; train it first");
  });

  test("clear form empties every field", async ({ page }) => {
    await pickSample(page, "caught");
    await page.getByRole("button", { name: "Clear form" }).click();
    await expect(amountInput(page)).toHaveValue("");
    await openAdvanced(page);
    await expect(page.getByLabel("V28", { exact: true })).toHaveValue("");
  });

  test.describe("paste a dataset row", () => {
    test.beforeEach(async ({ page }) => page.getByText("Paste a dataset row").click());

    test("fills the form from a creditcard.csv line", async ({ page }) => {
      await page.getByLabel(/A line from creditcard.csv/).fill(datasetLine("caught", 1));
      await page.getByRole("button", { name: "Fill the form" }).click();
      await expect(amountInput(page)).toHaveValue(String(sample("caught").features.Amount));
    });

    test("accepts the header line as well", async ({ page }) => {
      await page.getByLabel(/A line from creditcard.csv/).fill(`${DATASET_HEADER}\n${datasetLine("legit", 0)}`);
      await page.getByRole("button", { name: "Fill the form" }).click();
      await expect(amountInput(page)).toHaveValue(String(sample("legit").features.Amount));
    });

    test("explains rows it can't use", async ({ page }) => {
      const box = page.getByLabel(/A line from creditcard.csv/);
      await box.fill("hello,world");
      await page.getByRole("button", { name: "Fill the form" }).click();
      await expect(page.locator(".field-error")).toHaveText("That row doesn't look like transaction data: it needs a header row with V1 to V28 and Amount.");

      await box.fill("1,2,3");
      await page.getByRole("button", { name: "Fill the form" }).click();
      await expect(page.locator(".field-error")).toHaveText("That row has empty or non-numeric values.");
    });
  });

  test("check and record saves the result and links to the log @writes", async ({ page }) => {
    await checkSample(page, "caught", "Check and record");
    const notice = page.getByRole("status");
    await expect(notice).toContainText(/Recorded as transaction \d+/);
    const id = (await notice.textContent())!.match(/transaction (\d+)/)![1];
    await notice.getByRole("link", { name: "Open the log" }).click();
    await expect(page).toHaveURL(/#log$/);
    await expect(page.getByRole("button", { name: id, exact: true })).toBeVisible();
  });
});
