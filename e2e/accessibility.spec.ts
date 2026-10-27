import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installFeeds, waitForData } from "./feeds";

for (const width of [390, 1440]) {
  for (const state of ["live", "pinned"] as const) {
    test(`${state} landmarks and labels at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installFeeds(page);
      await page.goto("/");
      await waitForData(page);
      if (state === "pinned") {
        if (width < 768) await page.getByRole("button", { name: "Recent earthquakes", exact: true }).click();
        await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
        await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everything Is Fine");
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();
      if (scan.violations.length > 0) {
        await test.info().attach("accessibility", {
          body: JSON.stringify(scan.violations, null, 2),
          contentType: "application/json",
        });
      }
      expect(
        scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
      ).toEqual([]);
      if (process.env["EIF_CAPTURE_UI"]) {
        await page.screenshot({
          path: `${process.env["EIF_CAPTURE_UI"]}/accessibility-${width}-${state}.png`,
        });
      }
    });
  }
}
