import { expect, test, type Locator, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function reopen(page: Page, story: Locator) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    });
  });
  await story.getByRole("button", { name: "Share this moment", exact: true }).click();
  await page.goto(await story.getByRole("textbox", { name: "Story link" }).inputValue());
}

test("the seafloor flight folds into a shareable reading along the flown route", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#v=observe&story=seafloor");
  const story = page.getByRole("region", { name: "Seafloor Flight" });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const profile = story.getByRole("slider", { name: "Distance along section" });
  await expect(profile).toHaveCount(0);
  await story.getByRole("button", { name: "Begin the descent" }).click();
  await expect(profile).toHaveAttribute("aria-valuetext", /10,923 m deep/);
  await profile.press("Home");
  await profile.press("ArrowRight");
  const reading = await profile.getAttribute("aria-valuetext");
  await expect(profile).toHaveValue("1");
  await story.getByRole("button", { name: "Map", exact: true }).click();
  await page.setViewportSize({ width: 812, height: 375 });
  const playback = await story.getByRole("group", { name: "Story playback" }).boundingBox();
  const projection = await story.getByRole("group", { name: "Observation projection" }).boundingBox();
  expect(playback!.x + playback!.width).toBeLessThan(projection!.x);
  expect(Math.abs(playback!.y + playback!.height - projection!.y - projection!.height)).toBeLessThan(12);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(profile).toHaveAttribute("aria-valuetext", reading!);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  await reopen(page, story);
  await expect(profile).toHaveValue("1");
  await expect(story.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(profile).toHaveAttribute("aria-valuetext", reading!);
});

test("El Niño keeps a selected buoy through an observation gap and a shared link", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#v=observe&story=nino&p=map&t=${Date.parse("1998-04-15T12:00:00Z")}`);
  const story = page.getByRole("region", { name: "El Niño Pulse" });
  const pin = story.getByRole("button", { name: "Inspect buoy 110° W" });
  const month = story.getByRole("slider", { name: "Observation time" });
  const picker = story.getByRole("combobox", { name: "Mooring longitude" });
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(picker).toHaveValue("-110");
  await expect(story.getByText("No usable readings at this buoy this month.")).toHaveCount(0);
  await month.press("ArrowRight");
  await expect(story.getByText("No usable readings at this buoy this month.")).toBeVisible();
  await expect(picker).toHaveValue("-110");
  await expect(pin).toHaveAttribute("data-mooring-gap", "true");
  await story.getByRole("button", { name: "Globe", exact: true }).click();
  await reopen(page, story);
  await expect(picker).toHaveValue("-110");
  await expect(month).toHaveAttribute("aria-valuetext", "1998-05 · monthly mean");
  await expect(story.getByRole("button", { name: "Globe", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Ocean Bloom retries the matching image and shares a fixed divider on the selected date", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(/\/a\/bloom-natural-2024-05-06-[^/]+\.webp$/, (route) => route.abort(), { times: 1 });
  await page.goto("/#v=observe&story=bloom");
  const story = page.getByRole("region", { name: "Ocean Bloom" });
  const date = story.getByRole("slider", { name: "Satellite date" });
  const divider = story.getByRole("slider", { name: "Satellite imagery divider" });
  await expect(date).toHaveAttribute("aria-valuetext", "6 May 2024");
  await story.getByRole("button", { name: "Compare satellite views" }).click();
  const retry = story.getByRole("button", { name: "Retry matching image" });
  await retry.click();
  await expect(retry).toHaveCount(0);
  await divider.press("ArrowRight");
  await date.press("ArrowRight");
  await expect(story.locator(".stage-readout time")).toHaveText("9 May 2024");
  await expect(divider).toHaveValue("51");
  await story.getByRole("button", { name: "Map", exact: true }).click();
  await expect(divider).toBeInViewport();
  await reopen(page, story);
  await expect(divider).toHaveValue("51");
  await expect(date).toHaveAttribute("aria-valuetext", "9 May 2024");
  await expect(story.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
