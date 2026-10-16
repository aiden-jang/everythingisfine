import { test, expect } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

test.use({ timezoneId: "America/New_York" });
test("pinned event timestamps name the local date and offset", async ({ page }) => {
  const now = Date.parse("2026-10-16T00:30:00Z");
  await page.clock.setFixedTime(new Date(now));
  await installFeeds(page, { now });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForData(page);
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  const panel = page.locator('.zone-panel[data-open="true"]');
  const time = panel.locator("time").first();
  await expect(time).toContainText("15 Oct 2026");
  await expect(time).toContainText("GMT-4");
  const iso = await time.getAttribute("datetime");
  expect(new Date(iso!).toISOString()).toBe(iso);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await time.scrollIntoViewIfNeeded();
    await expect(time).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`event-time-${width}.png`),
      animations: "disabled",
    });
  }
});
