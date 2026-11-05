import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function openStorm(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Revisit a day", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Follow Hurricane Katrina" });
  await trigger.click();
  return { trigger, dialog: page.getByRole("dialog", { name: "Eye of the Storm" }) };
}

test("Katrina’s camera flight reaches the recorded Buras landfall and can replay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { trigger, dialog } = await openStorm(page);
  const slider = dialog.getByRole("slider", { name: "Track time" });
  await expect(slider).toBeVisible();
  await dialog.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Play", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Landfall near Buras, Louisiana" })).toBeVisible();
  await expect(dialog.getByText("110 kt max wind")).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "29 Aug · 11:10 UTC");
  await dialog.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Across the Gulf" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Katrina’s reduced-motion map supports the NOAA fixes and keyboard scrubbing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog } = await openStorm(page);
  const slider = dialog.getByRole("slider", { name: "Track time" });
  await expect(dialog.getByText("Track overview")).toBeVisible();
  await expect(dialog.getByText("Wind radii are unavailable at the landfall fix.")).toBeVisible();
  await dialog.getByRole("button", { name: "Offshore peak" }).click();
  await expect(dialog.getByText("150 kt max wind")).toBeVisible();
  await expect(dialog.getByText("64 kt radius")).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "28 Aug · 18:00 UTC");
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "28 Aug · 00:00 UTC");
  await expect(dialog.getByText("100 kt max wind")).toBeVisible();
  await slider.press("End");
  await expect(dialog.getByText("920 mb")).toBeVisible();
  const overflow = await dialog.evaluate((element) => [
    element.scrollWidth - element.clientWidth,
    element.scrollHeight - element.clientHeight,
  ]);
  expect(overflow).toEqual([0, 0]);
});
