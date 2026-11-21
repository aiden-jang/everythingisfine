import { expect, test, type Locator, type Page } from "@playwright/test";
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
  await forecast.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(atmospheric).toBeFocused();
  await pulse.evaluate((button) => button.scrollIntoView({ block: "center" }));
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

async function annotationLayouts(page: Page, annotation: Locator, name: string) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await annotation.scrollIntoViewIfNeeded();
    await expect(annotation).toBeInViewport({ ratio: 1 });
    const note = await annotation.boundingBox();
    expect(note).not.toBeNull();
    for (const control of [".story-dock", ".story-projection", ".stage-readout"]) {
      const box = await page.locator(control).boundingBox();
      expect(box).not.toBeNull();
      expect(
        Math.min(note!.x + note!.width, box!.x + box!.width) > Math.max(note!.x, box!.x) &&
          Math.min(note!.y + note!.height, box!.y + box!.height) > Math.max(note!.y, box!.y),
        "scientific annotations stay clear of playback, projection and stage captions",
      ).toBe(false);
    }
    await painted(page);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`${name}-${viewport.width}.png`) });
  }
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
    const slider = panel.getByRole("group", { name: "Story playback" }).getByRole("slider");
    await expect(slider).toBeVisible();
    await panel.getByRole("button", { name: chapter, exact: true }).click();
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^(Play|Replay)$/ })).toBeVisible();
    if (id === "nino") {
      const reveal = panel.getByRole("button", { name: "Show measured depths" });
      await reveal.focus();
      await reveal.press("Space");
      await expect(reveal).toHaveAttribute("aria-pressed", "true");
      await panel.getByText("Read monthly means", { exact: true }).click();
      await panel.getByLabel("Mooring longitude").selectOption("-110");
      await expect(panel.getByText("28.91 °C · 31 days", { exact: true })).toBeVisible();
      await panel.getByRole("button", { name: "Late 1998" }).click();
      await expect(panel.getByText("20.17 °C · 31 days", { exact: true })).toBeVisible();
    }
    const selected = await slider.inputValue();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await painted(page);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`${id}-globe.png`) });
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(slider).toHaveValue(selected);
    if (id === "nino") {
      await expect(panel.getByRole("button", { name: "Show measured depths" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(panel.getByText("20.17 °C · 31 days", { exact: true })).toBeVisible();
    }
    await painted(page);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`${id}-map.png`) });
    await panel.getByRole("button", { name: "Globe", exact: true }).click();
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(slider).toBeVisible();
    await panel.evaluate((node) => {
      const scroll = node.closest(".observatory-intro");
      if (scroll) scroll.scrollTop = 0;
    });
    await expect(panel.getByRole("button", { name: "Globe", exact: true })).toBeInViewport();
    await painted(page);
    if (process.env["EIF_CAPTURE_UI"])
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
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Object.assign(window, { copiedAtlas: value });
        },
      },
    });
  });
  await panel.getByRole("button", { name: "Share this moment" }).click();
  await expect(panel.getByRole("status", { name: "Sharing status" })).toContainText("Link copied");
  const url = await page.evaluate(() => Reflect.get(window, "copiedAtlas") as string);
  expect(decodeURIComponent(url)).toContain("section:142,11,143,12");
  await page.goto(url);
  await expect(page.getByRole("img", { name: /Depth section across/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await annotationLayouts(page, panel.locator(".terrain-section"), "seafloor-section");
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: test.info().outputPath("seafloor-phone.png"), fullPage: true });
});

test("the lidar slice keeps its scientific explanation clear of shared world controls", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=dust");
  const panel = page.getByRole("region", { name: "Dust Curtain", exact: true });
  await panel.getByRole("button", { name: "Open lidar slice", exact: true }).click();
  const caption = panel.locator(".story-section-caption");
  await expect(caption).toContainText("Clouds also scatter light.");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await annotationLayouts(page, caption, "lidar-caption");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(caption).toBeVisible();
  await panel.getByRole("button", { name: "Globe", exact: true }).click();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  await panel.getByRole("button", { name: "Close lidar slice", exact: true }).click();
  await expect(caption).toHaveCount(0);
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
    if (process.env["EIF_CAPTURE_UI"])
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
  await expect(panel.locator(".stage-readout")).toHaveText("Recent reef data unavailable");
  await expect(panel.getByRole("status").filter({ hasText: "Recent reef data unavailable." })).toBeVisible();
  await panel.getByRole("button", { name: "Open 2023 archive", exact: true }).click();
  await expect(panel.getByRole("slider")).toBeVisible();
  await panel.getByRole("button", { name: "August", exact: true }).click();
  const at = "2023-08-10T12:00:00.000Z";
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at);
  await panel.getByRole("combobox", { name: "Heat stress" }).selectOption("Recent observations");
  await expect(
    panel.getByText("Recent reef data unavailable. Showing the previous observations.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at);
  await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("slider")).toBeEnabled();
  await panel.getByRole("slider").press("Home");
  await expect(panel.locator(".story-time time")).not.toHaveAttribute("datetime", at);
});

test("changing an archive season preserves keyboard focus and the shared world", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=observe&story=ozone");
  const panel = page.getByRole("region", { name: "Ozone Season", exact: true });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const season = panel.getByRole("combobox", { name: "Compare season", exact: true });
  await season.focus();
  await season.selectOption("2019");
  await expect(season).toHaveValue("2019");
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", /^2019-/);
  await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
  await expect(season).toBeFocused();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

test("Pacific radar opens from the forecast and returns to the retained forecast moment", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://nowcoast.noaa.gov/**", (route) => route.abort());
  await page.goto("/#v=observe&story=atmospheric-river&choice=9+November+2026+archive");
  const panel = page.getByRole("region", { name: "Atmospheric River", exact: true });
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await panel.getByRole("button", { name: "Forecast end" }).click();
  const at = await panel.locator(".story-time time").getAttribute("datetime");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await panel.getByRole("button", { name: "View current Pacific radar" }).click();
  await expect(page.getByRole("combobox", { name: "Radar region" })).toHaveValue("pacific");
  await page
    .getByRole("group", { name: "Radar projection" })
    .getByRole("button", { name: "Globe", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to Atmospheric River" }).click();
  await expect(panel.locator(".story-time time")).toHaveAttribute("datetime", at!);
  await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

test("an early final-year jump compares the shorelines in a steady frame on globe and map", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/#v=observe&story=aral");
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  const shorelineDrift = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let origin: { x: number; y: number } | undefined;
          let drift = 0;
          function measure() {
            const anchor = document.querySelector<HTMLElement>(".shoreline-labels span");
            if (anchor?.style.visibility === "visible") {
              const point = anchor.getBoundingClientRect();
              if (!anchor.nextElementSibling) origin ??= { x: point.x, y: point.y };
              if (origin) {
                drift = Math.max(drift, Math.hypot(point.x - origin.x, point.y - origin.y));
                if (anchor.nextElementSibling) {
                  resolve(drift);
                  return;
                }
              }
            }
            requestAnimationFrame(measure);
          }
          measure();
        }),
    );
  const globe = shorelineDrift();
  await panel.getByRole("button", { name: "Recent archive", exact: true }).press("Enter");
  expect(await globe).toBeLessThan(2);
  const comparison = panel.getByRole("button", { name: "Compare shorelines", exact: true });
  await panel.getByRole("button", { name: "Map", exact: true }).press("Enter");
  const map = shorelineDrift();
  await comparison.click();
  expect(await map).toBeLessThan(2);
});

test("a basin selection keeps its recorded year and explains missing observations", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/#v=observe&story=aral&p=map");
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const reading = panel.getByRole("region", { name: "Basin reading" });
  const year = panel.getByRole("slider", { name: "Archive year", exact: true });
  await panel.getByRole("button", { name: "Separating basins", exact: true }).click();
  await panel.getByRole("button", { name: "Inspect East basin", exact: true }).click();
  await expect(reading).toContainText("East basin · 1989");
  await expect(reading).toContainText("86.6%");
  await year.press("ArrowRight");
  await year.press("ArrowRight");
  await year.press("ArrowRight");
  await year.press("ArrowRight");
  await expect(reading).toContainText("East basin · 1997");
  await expect(reading).toContainText("70.5%");
  await expect(reading).toContainText("Sparse coverage");
  await panel.getByRole("button", { name: "Globe", exact: true }).click();
  await expect(reading.getByRole("combobox", { name: "Inspect a basin" })).toHaveValue("east");
  await expect(reading).toContainText("1997");
  await page.setViewportSize({ width: 812, height: 375 });
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await panel.getByRole("button", { name: "Inspect West basin", exact: true }).click();
  await expect(reading).toContainText("West basin · 1997");
  await page.setViewportSize({ width: 320, height: 568 });
  await reading.getByRole("combobox", { name: "Inspect a basin" }).selectOption("east");
  await expect(reading).toContainText("East basin · 1997");
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
