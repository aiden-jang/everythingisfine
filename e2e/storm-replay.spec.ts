import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

async function openStorm(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page);
  const trigger = page.getByRole("button", { name: "Eye of the Storm" });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  return { trigger, canvas, original, panel: page.getByRole("region", { name: "Eye of the Storm" }) };
}

test("Katrina’s camera flight reaches the recorded Buras landfall and can replay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { trigger, panel } = await openStorm(page);
  const slider = panel.getByRole("slider", { name: "Track time" });
  await expect(slider).toBeVisible();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const pausedAt = await slider.getAttribute("aria-valuetext");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", pausedAt!);
  await panel.getByRole("button", { name: "Play", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Landfall near Buras, Louisiana" })).toBeVisible();
  await expect(panel.getByText("110 kt max wind")).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "29 Aug · 11:10 UTC");
  await panel.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Across the Gulf" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Katrina’s reduced-motion map supports the NOAA fixes and keyboard scrubbing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { panel, canvas, original } = await openStorm(page);
  const slider = panel.getByRole("slider", { name: "Track time" });
  const stage = page.getByRole("group", { name: "Eye of the Storm on the map" });
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(stage.getByText("Track overview")).toBeVisible();
  await expect(panel.getByText("Wind extent unavailable for this position.")).toBeVisible();
  await panel.getByRole("button", { name: "Offshore peak" }).click();
  await expect(panel.getByText("150 kt max wind")).toBeVisible();
  await expect(panel.getByText("64 kt radius")).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "28 Aug · 18:00 UTC");
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "28 Aug · 00:00 UTC");
  await expect(panel.getByText("100 kt max wind")).toBeVisible();
  await slider.press("End");
  await expect(panel.getByText("920 mb")).toBeVisible();
  await panel.getByRole("button", { name: "Globe", exact: true }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", "29 Aug · 11:10 UTC");
  expect(await canvas.evaluate((el, prior) => el === prior, original)).toBe(true);
  expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
});
