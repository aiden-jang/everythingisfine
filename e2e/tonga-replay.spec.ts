import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("Tonga transitions from satellite imagery to the atmospheric wave and can pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page);
  const trigger = page.getByRole("button", { name: "Tonga’s shockwave" });
  await trigger.click();
  const replay = page.getByRole("region", { name: "Tonga’s shockwave" });
  await expect(
    page
      .getByRole("group", { name: "Tonga’s shockwave on the globe" })
      .getByText("GOES-17 · Infrared", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Tonga’s shockwave on the globe" })
      .getByText("GOES-17 · Water-vapor change", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Tonga’s shockwave on the globe" })
      .getByText("Estimated atmospheric wave", { exact: true }),
  ).toBeVisible();
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
  await openStories(page);
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await page.getByRole("button", { name: "Tonga’s shockwave" }).click();
  const replay = page.getByRole("region", { name: "Tonga’s shockwave" });
  const slider = replay.getByRole("slider", { name: "Replay time" });
  await expect(
    page
      .getByRole("group", { name: "Tonga’s shockwave on the globe" })
      .getByText("Scan 04:20 UTC", { exact: true }),
  ).toBeVisible();
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await replay.getByRole("combobox", { name: "Ground station" }).selectOption("SFO");
  await expect(slider).toHaveAttribute("aria-valuetext", "12:03 UTC");
  await expect(replay.getByText("1022.76 hPa", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Tonga’s shockwave on the map" })).toContainText(
    "Estimated atmospheric wave",
  );
  await expect(slider).toHaveAttribute("aria-valuetext", "12:03 UTC");
  await expect(replay.getByRole("combobox", { name: "Ground station" })).toHaveValue("SFO");
  expect(await canvas.evaluate((el, prior) => el === prior, original)).toBe(true);
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "04:00 UTC");
  await expect(replay.getByText("This station’s readings cover")).toBeVisible();
  await expect.poll(() => replay.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  const station = replay.getByRole("combobox", { name: "Ground station" });
  const antipode = replay.getByRole("button", { name: "Antipode" });
  await antipode.focus();
  await expect(antipode).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(station).toBeFocused();
  await expect(station).toBeInViewport();
});
