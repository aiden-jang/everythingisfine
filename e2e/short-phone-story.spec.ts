import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("a short phone shows the full featured-story action on arrival", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse stories", exact: true }).click();
  const action = page.locator("#explorer-stories .featured-story-link");
  await expect(action).toBeInViewport({ ratio: 1 });
  const button = (await action.boundingBox())!;
  const rail = (await page.locator("#chrome-rail").boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(rail.y + rail.height - 4);
});

test("Iceberg Drift clears the landscape globe until playback begins", async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=iceberg");
  const panel = page.getByRole("region", { name: "Iceberg Drift", exact: true });
  const playback = panel.getByRole("group", { name: "Story playback" });
  const start = playback.getByRole("button", { name: "Follow the drift" });
  await expect(start).toBeInViewport({ ratio: 1 });
  const timeline = playback.getByRole("slider", { includeHidden: true });
  await expect(timeline).toBeHidden();
  const compact = (await playback.boundingBox())!;
  await start.click();
  await expect(timeline).toBeInViewport({ ratio: 1 });
  expect((await playback.boundingBox())!.height).toBeGreaterThan(compact.height);
  await expect(
    panel.getByRole("complementary", { name: "About this shared view" }).locator("details"),
  ).toBeVisible();
});
