import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("Atmospheric River and River Pulse open distinct views from the catalogue and shared links", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/observations/river", (route) =>
    route.fulfill({ path: "src/sources/earth-atlas/river.nc", contentType: "application/x-netcdf" }),
  );
  await page.route("https://api.waterdata.usgs.gov/**", (route) => {
    const location = route.request().url().includes("monitoring-locations");
    return route.fulfill({
      json: location
        ? { geometry: { coordinates: [-73.58, 42.95] } }
        : {
            features: [0, 1].map((step) => ({
              properties: {
                time: `2026-11-09T12:${step ? "15" : "00"}:00Z`,
                value: "2340",
                unit_of_measure: "ft^3/s",
              },
            })),
          },
    });
  });
  await page.goto("/");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await openStories(page);
  const atmospheric = page.getByRole("button", { name: "Atmospheric River", exact: true });
  const pulse = page.getByRole("button", { name: "River Pulse", exact: true });
  await expect(atmospheric).toHaveCount(1);
  await expect(pulse).toHaveCount(1);
  await atmospheric.click();
  const forecast = page.getByRole("region", { name: "Atmospheric River", exact: true });
  await expect(forecast.getByRole("combobox", { name: "Forecast", exact: true })).toBeVisible();
  await expect(forecast.getByRole("slider", { name: "Forecast valid time", exact: true })).toBeVisible();
  await forecast.getByRole("button", { name: "Back to Observatory", exact: true }).click();
  await expect(atmospheric).toBeFocused();
  await pulse.click();
  const gauges = page.getByRole("region", { name: "River Pulse", exact: true });
  await expect(gauges.getByRole("combobox", { name: "River", exact: true })).toBeVisible();
  await expect(gauges.getByRole("slider")).toBeVisible();
  await expect(gauges.getByText("2,340 ft³/s", { exact: true })).toHaveCount(2);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  await page.goto("/#v=observe&story=river");
  await expect(gauges.getByRole("slider")).toBeVisible();
  await page.goto("/#v=observe&story=atmospheric-river");
  await expect(forecast.getByRole("slider")).toBeVisible();
});

async function painted(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

const stories = [
  ["seafloor", "Seafloor Flight", "Challenger Deep", ""],
  ["apophis", "Close Encounter", "Closest approach", ""],
  ["glacier", "Glacier Flow", "Full trace", "2024"],
  ["atmospheric-river", "Atmospheric River", "Forecast end", "9 November 2026 archive"],
  ["eclipse", "Earth’s Shadow", "Greatest eclipse", ""],
  ["nino", "El Niño Pulse", "Warm layer shifts", ""],
  ["bloom", "Ocean Bloom", "May", "Chlorophyll"],
  ["reef", "Reef Heat", "August", "2023 archive"],
  ["aral", "Vanishing Sea", "Separating basins", ""],
  ["spring", "Spring Wave", "April", "2024"],
] as const;

for (const [id, title, chapter, choice] of stories) {
  test(`${title} keeps its observations and canvas through map and globe`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 950 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /shader|WebGLProgram/.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(`/#v=observe&story=${id}&choice=${encodeURIComponent(choice)}`);
    const panel = page.getByRole("region", { name: title, exact: true });
    const slider = panel.getByRole("slider");
    await expect(slider).toBeVisible();
    await panel.getByRole("button", { name: chapter, exact: true }).click();
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^(Play|Replay)$/ })).toBeVisible();
    const selected = await slider.inputValue();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await painted(page);
    await page.screenshot({ path: test.info().outputPath(`${id}-globe.png`) });
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(slider).toHaveValue(selected);
    await painted(page);
    await page.screenshot({ path: test.info().outputPath(`${id}-map.png`) });
    await panel.getByRole("button", { name: "Globe", exact: true }).click();
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(panel.getByRole("slider")).toBeVisible();
    await panel.evaluate((node) => {
      const scroll = node.closest(".observatory-intro");
      if (scroll) scroll.scrollTop = 0;
    });
    await expect(panel.getByRole("button", { name: "Globe", exact: true })).toBeInViewport();
    await painted(page);
    await page.screenshot({ path: test.info().outputPath(`${id}-phone.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("seafloor sections accept coordinates and reopen at the shared measured line on a phone", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#v=observe&story=seafloor");
  const panel = page.getByRole("region", { name: "Seafloor Flight", exact: true });
  await panel.getByText("Enter section coordinates", { exact: true }).click();
  await panel.getByRole("spinbutton", { name: "Start longitude", exact: true }).fill("142");
  await panel.getByRole("spinbutton", { name: "Start latitude", exact: true }).fill("11");
  await panel.getByRole("spinbutton", { name: "End longitude", exact: true }).fill("143");
  await panel.getByRole("spinbutton", { name: "End latitude", exact: true }).fill("12");
  await panel.getByRole("button", { name: "Show section" }).click();
  await expect(page.getByRole("img", { name: /Depth section across/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Object.assign(window, { copiedAtlas: value });
        },
      },
    }),
  );
  await panel.getByRole("button", { name: "Share this moment" }).click();
  const url = await page.evaluate(() => Reflect.get(window, "copiedAtlas") as string);
  expect(decodeURIComponent(url)).toContain("section:142,11,143,12");
  await page.goto(url);
  await expect(page.getByRole("img", { name: /Depth section across/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: test.info().outputPath("seafloor-phone.png"), fullPage: true });
});

for (const [id, title] of [
  ["apophis", "Close Encounter"],
  ["eclipse", "Earth’s Shadow"],
]) {
  test(`${title} keeps its exact time through the normal-motion city transition`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto(`/#v=observe&story=${id}`);
    const panel = page.getByRole("region", { name: title, exact: true });
    await expect(panel.getByRole("slider", { name: /Predicted flyby|Eclipse time/ })).toBeVisible();
    const time = panel.locator(".story-time time");
    await panel
      .getByRole("button", { name: id === "eclipse" ? "Greatest eclipse" : "Closest approach" })
      .click();
    const at = await time.getAttribute("datetime");
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await panel.getByRole("button", { name: "See from my city" }).click();
    const targetLabel = page.locator(
      `[data-sky-labels] [data-body="${id === "eclipse" ? "Moon" : "Apophis"}"]`,
    );
    await expect(targetLabel).toHaveCSS("visibility", "visible");
    await expect
      .poll(async () =>
        Math.abs(parseFloat(await targetLabel.evaluate((node) => (node as HTMLElement).style.left)) - 50),
      )
      .toBeLessThan(5);
    await expect(time).toHaveAttribute("datetime", at!);
    await page.screenshot({ path: test.info().outputPath(`${id}-city.png`) });
    await panel.getByRole("button", { name: "Back to Earth" }).click();
    await expect(page.locator("[data-sky-labels]")).toHaveCount(0);
    await expect(time).toHaveAttribute("datetime", at!);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    await panel.getByRole("button", { name: "Play", exact: true }).click();
    await expect(time).not.toHaveAttribute("datetime", at!);
    await page.locator("#globe-view canvas").click({ position: { x: 60, y: 100 } });
    await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  });
}

test("the current-feed error gives an explicit archive recovery without silently replacing observations", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/observations/**", (route) => route.abort());
  await page.goto("/#v=observe&story=reef");
  const panel = page.getByRole("region", { name: "Reef Heat", exact: true });
  await expect(panel.getByText("The selected data could not load.", { exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "Heat stress" }).selectOption("2023 archive");
  await expect(panel.getByRole("slider")).toBeVisible();
  await panel.getByRole("button", { name: "August", exact: true }).click();
  const at = "2023-08-10T12:00:00.000Z";
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at);
  await panel.getByRole("combobox", { name: "Heat stress" }).selectOption("Recent observations");
  await expect(
    panel.getByText("The selected data could not load. Previous observations stay visible.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at);
});

test("Pacific radar opens from the forecast and returns to the retained forecast moment", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://nowcoast.noaa.gov/**", (route) => route.abort());
  await page.goto("/#v=observe&story=atmospheric-river&choice=9+November+2026+archive");
  const panel = page.getByRole("region", { name: "Atmospheric River", exact: true });
  await panel.getByRole("button", { name: "Forecast end" }).click();
  const at = await panel.locator(".story-time time").getAttribute("datetime");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await panel.getByRole("button", { name: "View current Pacific radar" }).click();
  await expect(page.getByRole("combobox", { name: "Radar region" })).toHaveValue("pacific");
  await page.getByRole("button", { name: "Back to Atmospheric River" }).click();
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at!);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
