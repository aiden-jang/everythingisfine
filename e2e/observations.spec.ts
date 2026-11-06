import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("feed status names unavailable sources without increasing the background count", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.route(/gdacs.*eventlist=WF/i, (route) => route.abort());
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Feed status, 6/7 available" });
  await expect(toggle.getByText("6/7", { exact: true })).toBeVisible();
  await toggle.press("Enter");
  const panel = page.getByRole("region", { name: "Feed status", exact: true });
  await expect(panel).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole("listitem")).toHaveCount(7);
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
  const more = page.getByRole("button", { name: "More views", exact: true });
  await more.click();
  expect(attempts).toBe(0);
  const catalogue = page.getByRole("region", { name: "Observatory views" });
  const tideRow = catalogue.getByRole("button", { name: "Tide Watch", exact: true });
  await expect(tideRow).toHaveAccessibleDescription("Compare measured and predicted tides.");
  await expect(tideRow.getByText("Compare measured and predicted tides.")).toBeVisible();
  await catalogue.evaluate((panel) => (panel.scrollTop = 90));
  const scroll = await catalogue.evaluate((panel) => panel.scrollTop);
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
  await tide.getByRole("button", { name: "Back to views", exact: true }).click();
  await expect(tideRow).toBeFocused();
  expect(await catalogue.evaluate((panel) => panel.scrollTop)).toBe(scroll);
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
  await pass.getByRole("button", { name: "Back to After Dark", exact: true }).click();
  await expect(open).toBeFocused();
});
