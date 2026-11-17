import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

async function openStorm(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page, "search");
  const trigger = page.getByRole("button", { name: "Eye of the Storm", exact: true });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  return { trigger, canvas, original, panel: page.getByRole("region", { name: "Eye of the Storm" }) };
}

test("Katrina’s camera flight reaches the recorded Buras landfall and can replay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { trigger, panel } = await openStorm(page);
  await expect(panel.getByRole("heading", { name: "Across the Gulf.", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("slider", { name: "Track time" })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await panel.getByRole("button", { name: "Follow the storm", exact: true }).click();
  const slider = panel.getByRole("slider", { name: "Track time" });
  await expect(slider).toBeVisible();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const pausedAt = await slider.getAttribute("aria-valuetext");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", pausedAt!);
  await panel.getByRole("button", { name: "Play", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "The peak came offshore.", exact: true })).toBeVisible();
  await expect(
    panel.getByRole("img", { name: "Katrina’s seven recorded wind readings" }).locator("circle"),
  ).toHaveCount(7);
  await expect(
    panel.getByText("NOAA recorded 150 kt offshore, then 110 kt at landfall near Buras, Louisiana.", {
      exact: false,
    }),
  ).toBeVisible();
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
  await expect(panel.getByRole("heading", { name: "Across the Gulf.", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Follow the storm", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "The peak came offshore.", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  const slider = panel.getByRole("slider", { name: "Track time" });
  const stage = page.getByRole("group", { name: "Eye of the Storm on the map" });
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(stage.getByText("Track overview")).toBeVisible();
  await expect(panel.getByText("Wind extent unavailable for this position.")).toBeVisible();
  await panel.getByRole("button", { name: "Inspect offshore peak", exact: true }).click();
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
  expect(await panel.locator("#observatory-intro").evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
});

for (const width of [320, 390]) {
  test(`Katrina’s ${width}px phone keeps Pause outside the scrolling reading`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { panel } = await openStorm(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await panel.getByRole("button", { name: "Follow the storm", exact: true }).click();
    const playback = panel.getByRole("group", { name: "Eye of the Storm playback", exact: true });
    const pause = playback.getByRole("button", { name: "Pause", exact: true });
    await expect(pause).toBeInViewport({ ratio: 1 });
    await panel.locator("#observatory-intro").evaluate((reading) => {
      reading.scrollTop = reading.scrollHeight;
    });
    await expect(pause).toBeInViewport({ ratio: 1 });
    const bounds = await pause.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await pause.click();
    const slider = playback.getByRole("slider", { name: "Track time" });
    const held = await slider.inputValue();
    await expect(playback.getByRole("button", { name: "Play", exact: true })).toBeInViewport({ ratio: 1 });
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect(slider).toHaveValue(held);
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", "29 Aug · 11:10 UTC");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("a kept Katrina peak reopens exactly paused without the invitation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { panel, trigger } = await openStorm(page);
  await panel.getByRole("button", { name: "Follow the storm", exact: true }).click();
  await panel.getByRole("button", { name: "Inspect offshore peak", exact: true }).click();
  await panel.getByRole("button", { name: "Save view", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("eif.visits")!).saved[0]);
  expect(saved.position.moment.at).toBe(Date.parse("2005-08-28T18:00:00Z"));
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(panel.getByRole("slider", { name: "Track time" })).toHaveValue("1080");
  await expect(panel.getByText("150 kt max wind", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Follow the storm", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
});
