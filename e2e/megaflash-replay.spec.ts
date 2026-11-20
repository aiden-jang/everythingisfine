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
  const trigger = page.getByRole("button", { name: "Megaflash", exact: true });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  const panel = page.getByRole("region", { name: "Megaflash" });
  await expect(
    page
      .getByRole("group", { name: "Megaflash on the globe" })
      .getByText("GOES-16 infrared · 08:52 UTC · False color"),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  const follow = panel.getByRole("button", { name: "Follow the flash", exact: true });
  await expect(follow).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole("slider", { name: "Flash elapsed time" })).toBeHidden();
  await follow.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel.getByRole("heading", { name: "A flash takes shape." })).toBeVisible();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Full extent" }).click();
  await expect(panel.getByRole("heading", { name: "Seven seconds. Five states." })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Megaflash on the globe" }).getByText("829 ± 8 km", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(panel.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Inspect pulses", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Read the flash." })).toBeVisible();
  const slider = panel.getByRole("slider", { name: "Flash elapsed time" });
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "Before the flash");
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "≈ 0.00 s");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", "≈ 0.00 s");
  await panel.getByRole("button", { name: "Keep this reading", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Reading kept", exact: true })).toBeDisabled();
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "7.39 s");
  await expect.poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  const extent = panel.getByRole("button", { name: "Full extent", exact: true });
  await extent.focus();
  await expect(extent).toBeInViewport();
  await expect(page.getByRole("group", { name: "Megaflash on the map" })).toContainText("829 ± 8 km");
  expect(await canvas.evaluate((el, prior) => el === prior, original)).toBe(true);
});

test("Megaflash compares the opening detections with the full flash in both projections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/#v=observe&story=megaflash&chapter=extent");
  const panel = page.getByRole("region", { name: "Megaflash", exact: true });
  const comparison = panel.getByRole("group", { name: "Compare optical detections" });
  const first = comparison.getByRole("button", { name: "First detections" });
  const full = comparison.getByRole("button", { name: "Full flash" });
  const time = panel.getByRole("slider", { name: "Flash elapsed time" });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await expect(full).toHaveAttribute("aria-pressed", "true");
  await first.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(time).toHaveAttribute("aria-valuetext", "First 0.25 s");
  await expect(page).toHaveURL(/chapter=first/);
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Megaflash on the map" })).toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await full.click();
  await expect(full).toHaveAttribute("aria-pressed", "true");
  await expect(time).toHaveAttribute("aria-valuetext", "7.39 s");
  await expect(page).toHaveURL(/chapter=extent/);
  expect(await canvas?.evaluate((el) => el === document.querySelector("#globe-view canvas"))).toBe(true);
});
