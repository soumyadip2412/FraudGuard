import { readFileSync } from "node:fs";
import { DATASET_HEADER, csvFile, datasetLine, expect, openView, test } from "./fixtures";

const LABELLED = [DATASET_HEADER, datasetLine("caught", 1), datasetLine("legit", 0), datasetLine("missed", 1)];
const fileInput = (page: import("@playwright/test").Page) => page.locator("input[type=file]");

test.describe("Check a file", () => {
  test.beforeEach(async ({ page }) => openView(page, "batch"));

  test("scores a labelled file and compares with the real labels", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("labelled.csv", LABELLED));
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Flagged 1 of 3 transactions (33.3%)");
    const matrix = page.getByRole("table", { name: "Decisions compared with the file's Class labels" });
    await expect(matrix).toContainText("1 caught");
    await expect(matrix).toContainText("1 missed");
    await expect(matrix).toContainText("0 false alarms");
    await expect(matrix).toContainText("1 cleared");
    const risks = page.getByRole("table", { name: /Highest-risk/ });
    await expect(risks.getByRole("row")).toHaveCount(4); // header + 3
    await expect(risks.getByRole("row").nth(1)).toContainText("98.8%");
    // Each row carries a short grouped reason, never individual V-features.
    await expect(risks.getByRole("columnheader", { name: "Reason" })).toBeVisible();
    await expect(risks.getByRole("row").nth(1)).toContainText("Anonymised characteristics: strong increase · Amount: moderate increase");
    expect(await risks.innerText()).not.toMatch(/Vd{1,2}/);
  });

  test("downloads the results as CSV", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("labelled.csv", LABELLED));
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download results" }).click()]);
    expect(download.suggestedFilename()).toBe("scored-labelled.csv");
    const lines = readFileSync(await download.path(), "utf8").trim().split("\n");
    expect(lines[0]).toBe("row,amount,fraud_probability,flagged,class");
    expect(lines).toHaveLength(4);
  });

  test("works without a Class column", async ({ page }) => {
    const unlabelled = LABELLED.map((line) => line.split(",").slice(0, -1).join(","));
    await fileInput(page).setInputFiles(csvFile("unlabelled.csv", unlabelled));
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Flagged 1 of 3 transactions (33.3%)");
    await expect(page.getByRole("table", { name: /Decisions compared/ })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Actual" })).toHaveCount(0);
  });

  test("names the missing column", async ({ page }) => {
    const withoutV5 = LABELLED.map((line) => line.split(",").filter((_, i) => i !== 5).join(","));
    await fileInput(page).setInputFiles(csvFile("no-v5.csv", withoutV5));
    await expect(page.getByRole("alert")).toHaveText("no-v5.csv is missing these columns: V5.");
    await expect(page.getByText("Choose a CSV file")).toBeVisible();
  });

  test("explains a file that isn't transaction data", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("notes.csv", ["name,email", "Ada,ada@example.com"]));
    await expect(page.getByRole("alert")).toContainText("doesn't look like transaction data");
  });

  test("reports skipped rows with correct grammar", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("one-bad.csv", [...LABELLED, datasetLine("legit", 0).replace(/^0,[^,]+/, "0,abc")]));
    await expect(page.getByText("1 row was skipped because it had empty or non-numeric values.")).toBeVisible();
  });

  test("handles a file with only a header", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("empty.csv", [DATASET_HEADER]));
    await expect(page.getByRole("alert")).toHaveText("empty.csv has no rows with valid numbers.");
  });

  test("can be cancelled part-way through", async ({ page }) => {
    const big = [DATASET_HEADER, ...Array.from({ length: 30_000 }, () => datasetLine("legit", 0))];
    await fileInput(page).setInputFiles(csvFile("big.csv", big));
    await expect(page.getByText(/Scored [\d,]+ of 30,000 transactions/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Choose a CSV file")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Flagged/ })).toHaveCount(0);
  });

  test("check another file goes back to the picker", async ({ page }) => {
    await fileInput(page).setInputFiles(csvFile("labelled.csv", LABELLED));
    await page.getByRole("button", { name: "Check another file" }).click();
    await expect(page.getByText("Choose a CSV file")).toBeVisible();
  });
});
