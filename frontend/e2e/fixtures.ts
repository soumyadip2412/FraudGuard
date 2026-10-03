import { test as base, expect, type Page } from "@playwright/test";
import { SAMPLES } from "../src/samples";

/**
 * Every test fails if the page logs a JavaScript error. Failed HTTP responses are
 * excluded: some tests trigger 4xx/5xx on purpose to check the error messages.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) errors.push(message.text());
      });
      await use(errors);
      expect(errors, "JavaScript errors in the browser console").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export type SampleId = "caught" | "legit" | "missed";

export const sample = (id: SampleId) => SAMPLES.find((s) => s.id === id)!;

export async function openView(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  // Generous timeout: the dev server can reload once while it optimises dependencies.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
}

export async function pickSample(page: Page, id: SampleId) {
  await page.getByRole("button", { name: new RegExp(`^${sample(id).label}`) }).click();
}

export async function checkSample(page: Page, id: SampleId, action: "Check transaction" | "Check and record" = "Check transaction") {
  await pickSample(page, id);
  await page.getByRole("button", { name: action, exact: true }).click();
}

const FEATURE_ORDER = (features: Record<string, number>) => [
  ...Array.from({ length: 28 }, (_, i) => features[`V${i + 1}`]),
  features.Amount,
];

/** A creditcard.csv-style line: Time, V1..V28, Amount, Class. */
export const datasetLine = (id: SampleId, label: 0 | 1) => [0, ...FEATURE_ORDER(sample(id).features), label].join(",");

export const DATASET_HEADER = ["Time", ...Array.from({ length: 28 }, (_, i) => `V${i + 1}`), "Amount", "Class"].join(",");

export function csvFile(name: string, lines: string[]) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(lines.join("\n")) };
}
