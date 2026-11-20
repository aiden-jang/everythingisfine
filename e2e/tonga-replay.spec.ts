import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

for (const [width, height] of [
  [320, 568],
  [320, 640],
  [390, 844],
  [844, 390],
] as const) {
  test(`Tonga's camera and projection controls stay separate at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.goto("/#v=observe&story=tonga");
    const story = page.getByRole("region", { name: "Tonga’s shockwave", exact: true });
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const follow = story.getByRole("button", { name: "Follow the wave", exact: true });
    if (height === 568) await expect(follow).toBeInViewport({ ratio: 1 });
    await follow.click();
    await story.getByRole("button", { name: "Pause", exact: true }).click();
    await story.getByRole("button", { name: "Antipode", exact: true }).click();
    const control = page.getByRole("button", { name: "Take control", exact: true });
    await expect(control).toBeVisible();
    const camera = (await control.boundingBox())!;
    const projection = (await story.getByRole("group", { name: "Observation projection" }).boundingBox())!;
    expect(camera.y + camera.height + 8).toBeLessThanOrEqual(projection.y);
    const caption = (await story.locator(".stage-readout").boundingBox())!;
    expect(
      camera.x >= caption.x + caption.width + 8 ||
        camera.y + camera.height + 8 <= caption.y ||
        caption.y + caption.height + 8 <= camera.y,
    ).toBe(true);
    await story.getByRole("button", { name: "Map", exact: true }).click();
    await expect(story.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await control.click();
    await expect(page.getByRole("button", { name: "Recenter view", exact: true })).toBeVisible();
    await story.getByRole("button", { name: "Globe", exact: true }).click();
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Tonga transitions from satellite imagery to the atmospheric wave and can pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.addInitScript(() => {
    const times: number[] = [];
    window.addEventListener("eif:view-location-change", () => {
      const now = performance.now();
      while (times.length && now - times[0]! > 2000) times.shift();
      times.push(now);
      const root = document.documentElement;
      root.dataset["peakLinkWrites"] = String(
        Math.max(Number(root.dataset["peakLinkWrites"] ?? 0), times.length),
      );
    });
  });
  await page.goto("/");
  await openStories(page);
  const trigger = page.getByRole("button", { name: /^(Open story: )?Tonga’s shockwave$/ });
  await trigger.click();
  const replay = page.getByRole("region", { name: "Tonga’s shockwave" });
  await replay.getByRole("button", { name: "Follow the wave", exact: true }).click();
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
  await expect(page).toHaveURL((url) => {
    const params = new URLSearchParams(url.hash.slice(1));
    return params.get("story") === "tonga" && params.get("t") === String(Date.parse("2022-01-15T22:34:00Z"));
  });
  expect(Number(await page.locator("html").getAttribute("data-peak-link-writes"))).toBeLessThanOrEqual(8);
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
  await page.getByRole("button", { name: /^(Open story: )?Tonga’s shockwave$/ }).click();
  const replay = page.getByRole("region", { name: "Tonga’s shockwave" });
  await replay.getByRole("button", { name: "Follow the wave", exact: true }).click();
  const slider = replay.getByRole("slider", { name: "Replay time" });
  const chapters = replay.getByRole("group", { name: "Tonga chapters", exact: true });
  for (const button of await chapters.getByRole("button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(
    page
      .getByRole("group", { name: "Tonga’s shockwave on the globe" })
      .getByText("Scan 04:20 UTC", { exact: true }),
  ).toBeVisible();
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const image = (await replay.locator(".replay-inset").boundingBox())!;
  const camera = (await page.getByRole("button", { name: "Take control", exact: true }).boundingBox())!;
  const projection = (await replay.getByRole("group", { name: "Observation projection" }).boundingBox())!;
  expect(image.y + image.height + 4).toBeLessThanOrEqual(Math.min(camera.y, projection.y));
  const stationPicker = replay.getByRole("combobox", { name: "Ground station" });
  await stationPicker.scrollIntoViewIfNeeded();
  const hit = await stationPicker.evaluate((control) => {
    const { x, y, width, height } = control.getBoundingClientRect();
    return document.elementFromPoint(x + width / 2, y + height / 2) === control;
  });
  expect(hit, "the station selector clears the fixed playback dock").toBe(true);
  await stationPicker.selectOption("SFO");
  await expect(slider).toHaveAttribute("aria-valuetext", "12:03 UTC");
  await expect(replay.getByText("1022.76 hPa", { exact: true })).toBeVisible();
  const signal = replay.getByRole("group", { name: "San Francisco recorded pressure pulse" });
  await expect(signal.locator("time")).toHaveAttribute("datetime", "2022-01-15T12:03:00Z");
  await expect(signal.getByRole("img")).toHaveAccessibleName(/1022\.76 hPa/);
  await replay.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Tonga’s shockwave on the map" })).toContainText(
    "Estimated atmospheric wave",
  );
  await expect(slider).toHaveAttribute("aria-valuetext", "12:03 UTC");
  await expect(replay.getByRole("combobox", { name: "Ground station" })).toHaveValue("SFO");
  expect(await canvas.evaluate((el, prior) => el === prior, original)).toBe(true);
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "04:00 UTC");
  await expect(signal).toHaveCount(0);
  await expect(replay.getByText("This station’s readings cover")).toBeVisible();
  const firstReading = replay.getByRole("button", { name: "San Francisco first reading · 11:10 UTC" });
  await firstReading.click();
  await expect(slider).toHaveAttribute("aria-valuetext", "11:10 UTC");
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
