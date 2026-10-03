import AxeBuilder from "@axe-core/playwright";
import { checkSample, expect, openView, test } from "./fixtures";

const VIEWS = ["check", "batch", "log", "model", "guide"];

test.describe("Layout and accessibility", () => {
  for (const view of VIEWS) {
    test(`${view}: no sideways scrolling and no serious accessibility problems`, async ({ page }) => {
      await openView(page, view);
      if (view === "check") {
        await checkSample(page, "caught"); // include the verdict and ladder
        await expect(page.locator(".verdict h2")).toBeVisible();
      }
      // Measure colours at rest, not mid-way through the ladder's fade-in.
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "page wider than the screen").toBeLessThanOrEqual(0);

      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}x)`)).toEqual([]);
    });
  }

  test("keyboard users can skip straight to the content", async ({ page }) => {
    await openView(page, "check");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
