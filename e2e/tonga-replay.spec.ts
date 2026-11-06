import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("Tonga transitions from satellite imagery to the atmospheric wave and can pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Watch Tonga’s shockwave" });
  await trigger.click();
  const replay = page.getByRole("dialog", { name: "Tonga’s shockwave" });
  await expect(replay.getByText("GOES-17 · Infrared", { exact: true })).toBeVisible();
  await expect(replay.getByText("GOES-17 · Water-vapor change", { exact: true })).toBeVisible();
  await expect(replay.getByText("Estimated atmospheric wave", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Antipode", exact: true }).click();
  await expect(replay.getByRole("heading", { name: "The far side of Earth" })).toBeVisible();
  await expect(replay.getByRole("slider", { name: "Replay time" })).toHaveAttribute(
    "aria-valuetext",
    "22:34 UTC",
  );
  await page.keyboard.press("Escape");
  await expect(replay).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Tonga’s reduced-motion archive can jump to measured station pulses on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  await page.getByRole("button", { name: "Watch Tonga’s shockwave" }).click();
  const replay = page.getByRole("dialog", { name: "Tonga’s shockwave" });
  const slider = replay.getByRole("slider", { name: "Replay time" });
  await expect(replay.getByText("Scan 04:20 UTC", { exact: true })).toBeVisible();
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await replay.getByRole("combobox", { name: "Ground station" }).selectOption("SFO");
  await expect(slider).toHaveAttribute("aria-valuetext", "12:03 UTC");
  await expect(replay.getByText("1022.76 hPa", { exact: true })).toBeVisible();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "04:00 UTC");
  await expect(replay.getByText("This station’s readings cover")).toBeVisible();
  await expect.poll(() => replay.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(replay.getByRole("combobox", { name: "Ground station" })).toBeInViewport();
  await expect(replay.getByRole("button", { name: "Antipode" })).toBeInViewport();
});
