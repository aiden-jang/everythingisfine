import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("Megaflash starts on the storm and keeps the full trace and keyboard scrub available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page);
  const trigger = page.getByRole("button", { name: "Watch Megaflash" });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  const panel = page.getByRole("region", { name: "Megaflash" });
  await expect(
    page
      .getByRole("group", { name: "Megaflash on the globe" })
      .getByText("GOES-16 infrared · 08:52 UTC · False color"),
  ).toBeVisible();
  await expect(panel.getByRole("heading", { name: "The flash spreads" })).toBeVisible();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Full extent" }).click();
  await expect(panel.getByRole("heading", { name: "Across five states" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Megaflash on the globe" }).getByText("829 ± 8 km", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(panel.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  const slider = panel.getByRole("slider", { name: "Flash elapsed time" });
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "Before the flash");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "≈ 0.00 s");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", "≈ 0.00 s");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "7.39 s");
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  const extent = panel.getByRole("button", { name: "Full extent" });
  await extent.focus();
  await expect(extent).toBeInViewport();
  await expect(page.getByRole("group", { name: "Megaflash on the map" })).toContainText("829 ± 8 km");
  expect(await canvas.evaluate((el, prior) => el === prior, original)).toBe(true);
});
