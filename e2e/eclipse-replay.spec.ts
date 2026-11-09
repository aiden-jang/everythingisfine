import { expect, test, type Page } from "@playwright/test";
import { installFeeds, waitForData, openStories } from "./feeds";

async function watchEclipse(page: Page) {
  const watch = page.getByRole("button", { name: "Watch eclipse" });
  await expect(watch).toBeEnabled();
  await watch.click();
  return page.getByRole("region", { name: "Eclipse replay" });
}

test("the archived eclipse can be paused, scrubbed, and replayed", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await page.getByText("Eclipses", { exact: true }).click();
  await page.getByRole("button", { name: /solar eclipse, 2024-04-08/ }).click();
  const replay = await watchEclipse(page);
  const slider = replay.getByRole("slider", { name: "Eclipse time" });
  await expect(slider).not.toHaveValue("0");
  await slider.press("Home");
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "16:40 UTC");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "16:41 UTC");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "19:54 UTC");
  await replay.getByRole("button", { name: "Play", exact: true }).click();
  await expect(replay.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(replay.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(replay).toBeHidden();
  await expect(page.getByRole("button", { name: "Watch eclipse" })).toBeFocused();
});

test("reduced motion opens a held eclipse on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await openStories(page);
  await page.getByRole("button", { name: /Total eclipse, 2024/ }).click();
  const replay = await watchEclipse(page);
  const slider = replay.getByRole("slider", { name: "Eclipse time" });
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "18:17 UTC");
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "16:40 UTC");
  await page.getByRole("button", { name: "back to live" }).click();
  await expect(replay).toBeHidden();
});
