import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("Megaflash starts on the storm and keeps the full trace and keyboard scrub available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Watch Megaflash" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Megaflash" });
  await expect(dialog.getByText("GOES-16 infrared · 08:52 UTC · False color")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "The flash spreads" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Full extent" }).click();
  await expect(dialog.getByRole("heading", { name: "Across five states" })).toBeVisible();
  await expect(dialog.getByText("829 ± 8 km", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(dialog.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  const slider = dialog.getByRole("slider", { name: "Flash elapsed time" });
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "Before the flash");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "≈ 0.00 s");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "7.39 s");
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(dialog.getByRole("button", { name: "Full extent" })).toBeInViewport();
});
