import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("feed status names unavailable sources without increasing the background count", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route(/gdacs.*eventlist=WF/i, (route) => route.abort());
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Feed status, 6/7 available" });
  await expect(toggle.getByText("6/7", { exact: true })).toBeVisible();
  await toggle.press("Enter");
  const panel = page.getByRole("region", { name: "Background feed status", exact: true });
  await expect(panel).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole("listitem")).toHaveCount(10);
  await expect(panel.getByRole("listitem").filter({ hasText: "RainViewer storm radar" })).toContainText(
    "Off",
  );
  await expect(panel).toContainText("7 background feeds checked. 1 unavailable.");
  await expect(panel.getByText("Last successful check", { exact: false }).first()).toBeVisible();
  await expect(panel.getByRole("listitem").filter({ hasText: "USGS earthquakes" })).toContainText(
    "Available",
  );
  await expect(panel.getByRole("listitem").filter({ hasText: "GDACS wildfires" })).toContainText(
    "Couldn’t reach feed",
  );
  await expect(panel.getByText("Loads when opened")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("Tide Watch preserves its measured sample across projections and recovers without replacing the canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  let attempts = 0;
  await page.route("https://api.tidesandcurrents.noaa.gov/**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const predictions = params.get("product") === "predictions";
    if (!predictions) attempts++;
    if (attempts === 1 && !predictions) return route.fulfill({ status: 503 });
    const rows = Array.from({ length: 7 }, (_, index) => ({
      t: `2026-11-06 12:${String(index * 6).padStart(2, "0")}`,
      v: (index / 10 + (predictions ? 0.1 : 0.3)).toFixed(1),
    }));
    return route.fulfill({ json: { [predictions ? "predictions" : "data"]: rows } });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  const more = await openStories(page);
  expect(attempts).toBe(0);
  const catalogue = page.getByRole("region", { name: "Stories and layers" });
  const tideRow = catalogue.getByRole("button", { name: "Tide Watch", exact: true });
  await expect(tideRow).toHaveAccessibleDescription(
    "Recent observations Compare measured and predicted tides.",
  );
  await expect(tideRow.locator("..").getByText("Compare measured and predicted tides.")).toBeVisible();
  await tideRow.evaluate((row) => row.scrollIntoView({ block: "center" }));
  const sidebar = page.locator(".observatory-intro").filter({ has: catalogue });
  const scroll = await sidebar.evaluate((panel) => panel.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await tideRow.click();
  const tide = page.getByRole("region", { name: "Tide Watch", exact: true });
  await expect(tide.getByText(/Couldn’t load Tide Watch data from NOAA/)).toBeVisible();
  await tide.getByRole("button", { name: "Retry source" }).click();
  const slider = tide.getByRole("slider", { name: "Observation time" });
  await slider.press("Home");
  await expect(tide.getByText("0.30 m", { exact: true })).toBeVisible();
  const time = await slider.getAttribute("aria-valuetext");
  await tide.getByRole("button", { name: "Map", exact: true }).click();
  await expect(tide.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(slider).toHaveAttribute("aria-valuetext", time!);
  await tide.getByRole("button", { name: "Globe", exact: true }).click();
  await slider.press("End");
  await expect(tide.getByText("0.90 m", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(slider).toBeInViewport({ ratio: 1 });
  expect(await canvas.evaluate((element, before) => element === before, original)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await tide.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(tideRow).toBeFocused();
  expect(await sidebar.evaluate((panel) => panel.scrollTop)).toBe(scroll);
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  expect(errors).toEqual([]);
});

test("Orbital Pass shares the city and time between the horizon, globe and map", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-06T16:00:00Z"));
  await installFeeds(page, { presentation: "fresh" });
  await page.route("https://celestrak.org/NORAD/elements/gp.php?**", (route) =>
    route.fulfill({
      body: [
        "ISS (ZARYA)",
        "1 25544U 98067A   26309.85320381  .00006629  00000+0  12749-3 0  9998",
        "2 25544  51.6327 319.0560 0007195 352.5747   7.5134 15.49194530593711",
      ].join("\n"),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await openStories(page);
  const open = page.getByRole("button", { name: "Orbital Pass", exact: true });
  await open.click();
  const pass = page.getByRole("region", { name: "Orbital Pass", exact: true });
  const city = pass.getByRole("combobox", { name: "City" });
  await city.selectOption("Tokyo");
  const slider = pass.getByRole("slider", { name: "Predicted pass time" });
  await slider.press("End");
  const time = await slider.getAttribute("aria-valuetext");
  await pass.getByRole("button", { name: "Local sky" }).click();
  await expect(page.getByRole("group", { name: "Orbital Pass on the horizon" })).toBeVisible();
  await pass.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Orbital Pass on the map" })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", time!);
  await expect(city).toHaveValue("Tokyo");
  await pass.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(open).toBeFocused();
});

test("the Moon crossing, reconstructed plates, and wave forecasts reuse the Observatory globe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const now = Date.parse("2026-11-06T18:00:00Z");
  await page.clock.setFixedTime(new Date(now));
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route("https://marine-api.open-meteo.com/v1/marine?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const lats = params.get("latitude")!.split(",").map(Number);
    const lons = params.get("longitude")!.split(",").map(Number);
    return route.fulfill({
      json: lats.map((latitude, i) => ({
        latitude,
        longitude: lons[i],
        hourly: {
          time: [now / 1000, now / 1000 + 10_800],
          swell_wave_height: [2.1, 3.3],
          swell_wave_direction: [306, 307],
          wave_height: [2.7, 3.9],
          wave_period: [14.8, 16.6],
        },
      })),
    });
  });
  await page.route("https://erddap.cdip.ucsd.edu/erddap/tabledap/wave_agg.json?**", (route) =>
    route.fulfill({ json: { table: { rows: [["2026-11-06T18:00:00Z", 37.9415, -123.4645, 4.28, 16.7]] } } }),
  );
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await openStories(page);
  const epic = page.getByRole("button", { name: "Million-Mile View", exact: true });
  await epic.click();
  const shot = page.getByRole("img", { name: /NASA EPIC photograph/ });
  await expect(shot).toBeVisible();
  const first = await shot.getAttribute("src");
  await page.getByRole("slider", { name: "Photograph time" }).press("End");
  await expect(shot).not.toHaveAttribute("src", first!);
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(epic).toBeFocused();

  await page.getByRole("button", { name: "Below the Surface", exact: true }).click();
  await openStories(page);
  await page.getByRole("button", { name: "Deep Time", exact: true }).click();
  await page.getByRole("button", { name: /Pangaea/ }).click();
  const age = page.getByRole("slider", { name: "Reconstruction age" });
  await expect(age).toHaveAttribute("aria-valuetext", "230 million years ago");
  await page.getByRole("combobox", { name: "Follow a place" }).selectOption("Rio de Janeiro");
  await expect(page.getByText("Rio de Janeiro’s plate position")).toBeVisible();
  await expect(age).toHaveAttribute("aria-valuetext", "230 million years ago");
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(page.getByRole("button", { name: "Deep Time", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Live Earth", exact: true }).click();
  await openStories(page);
  await page.getByRole("button", { name: "Swell Lines", exact: true }).click();
  const swell = page.getByRole("region", { name: "Swell Lines", exact: true });
  await expect(swell.getByText("4.3 m", { exact: true })).toBeVisible();
  await swell.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Swell Lines on the map" })).toBeVisible();
  await page.getByRole("button", { name: /Show Mokapu Point/ }).click();
  await expect(swell.getByRole("combobox", { name: "Reference buoy" })).toHaveValue("098");
  const forecast = swell.getByRole("slider", { name: "Forecast valid time" });
  await forecast.press("End");
  await expect(swell.getByText("3.9 m", { exact: true })).toBeVisible();
  expect(await canvas.evaluate((element, before) => element === before, original)).toBe(true);
});
