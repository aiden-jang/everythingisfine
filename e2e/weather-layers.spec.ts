import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openLayer } from "./feeds";

// Small synthetic NetCDF/HDF5 fixtures exercise the real provider decoders without a live service.
const wind = readFileSync(new URL("./fixtures/weather-wind.nc", import.meta.url));
const lightning = readFileSync(new URL("./fixtures/weather-lightning.nc", import.meta.url));
const now = new Date("2026-11-12T16:00:00Z");
const camera = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe?: { state: () => { lon: number; lat: number; zoom: number }; morph: () => number };
      }
    ).__globe;
    return globe ? { ...globe.state(), morph: globe.morph() } : null;
  });

async function sources(page: Page) {
  let windFailed = true;
  const calls = { wind: 0, lightning: 0 };
  await page.clock.setFixedTime(now);
  await page.route("https://pae-paha.pacioos.hawaii.edu/**", (route) => {
    calls.wind++;
    return windFailed
      ? route.fulfill({ status: 503 })
      : route.fulfill({ body: wind, contentType: "application/x-netcdf" });
  });
  await page.route("https://noaa-goes19.s3.amazonaws.com/**", (route) => {
    calls.lightning++;
    if (route.request().url().endsWith(".nc"))
      return route.fulfill({ body: lightning, contentType: "application/x-netcdf" });
    const hour = new URL(route.request().url()).searchParams.get("prefix")?.split("/").filter(Boolean).at(-1);
    const stamps = hour === "15" ? ["155000", "155500"] : ["160000"];
    return route.fulfill({
      contentType: "application/xml",
      body: `<ListBucketResult>${stamps.map((stamp) => `<Contents><Key>GLM-L2-LCFA/2026/316/${hour}/OR_GLM-L2-LCFA_G19_s2026316${stamp}0_e20263161600300_c20263161600400.nc</Key></Contents>`).join("")}</ListBucketResult>`,
    });
  });
  return {
    calls,
    recover: () => {
      windFailed = false;
    },
  };
}

test("a shared weather view overrides recipient preferences without saving them @dev", async ({
  page,
  browser,
}) => {
  await installFeeds(page);
  (await sources(page)).recover();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=explore&p=map&layers=wind,lightning&windAt=1794502800&lightningAt=1794498600");
  const windPanel = page.getByRole("region", { name: "Surface wind playback" });
  await openLayer(page, "Surface wind");
  await expect(windPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /17:00/);
  await windPanel.getByRole("slider").press("Home");
  const expected = await windPanel.locator("time").getAttribute("datetime");
  await expect
    .poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("windAt"))
    .toBe(String(Date.parse(expected!) / 1000));
  const link = page.url();
  const recipient = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const other = await recipient.newPage();
    await installFeeds(other);
    (await sources(other)).recover();
    await other.addInitScript(() =>
      localStorage.setItem(
        "eif.mapLayers",
        JSON.stringify({ wind: false, lightning: false, earthquakes: true }),
      ),
    );
    await other.goto(link);
    const layers = other.getByRole("region", { name: "Map layers", exact: true });
    await expect(layers.getByRole("button", { name: "Earthquakes", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(layers.getByRole("button", { name: "Surface wind", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(async () => (await camera(other))?.morph).toBe(1);
    await openLayer(other, "Surface wind");
    const restored = other.getByRole("region", { name: "Surface wind playback" });
    await expect(restored.locator("time")).toHaveAttribute("datetime", expected!);
    await expect(restored.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem("eif.mapLayers")!))).toEqual({
      wind: false,
      lightning: false,
      earthquakes: true,
    });
    await other.reload();
    await openLayer(other, "Surface wind");
    await expect(restored.locator("time")).toHaveAttribute("datetime", expected!);
    await other.getByRole("button", { name: "Globe", exact: true }).click();
    await expect.poll(async () => (await camera(other))?.morph).toBe(0);
    await expect(restored.locator("time")).toHaveAttribute("datetime", expected!);
  } finally {
    await recipient.close();
  }
});

test("an expired shared weather moment explains its fallback and remains paused", async ({ page }) => {
  await installFeeds(page);
  (await sources(page)).recover();
  await page.goto("/#v=explore&layers=wind&windAt=1700000000");
  await openLayer(page, "Surface wind");
  const panel = page.getByRole("region", { name: "Surface wind playback" });
  await expect(
    panel.getByText("The selected time is no longer available. Showing the nearest available step.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(panel.locator("time")).toHaveAttribute("datetime", "2026-11-12T15:00:00.000Z");
});

for (const width of [1440, 390]) {
  test(`wind and lightning layer playback preserves the shared scene at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: width === 390 ? "reduce" : "no-preference" });
    await installFeeds(page);
    const source = await sources(page);
    source.recover();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/#v=explore&at=-80,25,1.4");
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1.4);
    const pose = await camera(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const layers = page.getByRole("region", { name: "Map layers", exact: true });
    expect(source.calls).toEqual({ wind: 0, lightning: 0 });
    await layers.getByRole("button", { name: "Surface wind", exact: true }).click();
    await openLayer(page, "Surface wind");
    const windPanel = layers.getByRole("region", { name: "Surface wind playback" });
    await expect(windPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /16:00/);
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await layers.getByRole("button", { name: "Lightning", exact: true }).click();
    await openLayer(page, "Lightning");
    const lightningPanel = layers.getByRole("region", { name: "Lightning playback" });
    await expect(lightningPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /16:00/);
    await expect(lightningPanel).toContainText("Satellite detections: 3");
    await expect(windPanel).toBeHidden();
    await expect(layers.locator("#layer-inspector-title")).toHaveText("Lightning");
    await lightningPanel.getByRole("slider").press("Home");
    await expect(lightningPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /15:50/);
    await lightningPanel.getByRole("button", { name: "Play", exact: true }).click();
    await expect(lightningPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /16:00/);
    await expect(lightningPanel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    expect(await camera(page)).toEqual(pose);
    await openLayer(page, "Surface wind");
    await windPanel.getByRole("slider").press("End");
    await expect(windPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /17:00/);
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect.poll(async () => (await camera(page))?.morph).toBe(1);
    const mapPose = await camera(page);
    await windPanel.getByRole("slider").press("Home");
    expect(await camera(page)).toEqual(mapPose);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/weather-layers-${width}.png` });
    await page.locator("#chrome-rail").evaluate((rail) => {
      rail.scrollTop = 0;
    });
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/weather-overview-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await layers.getByRole("button", { name: "Surface wind", exact: true }).click();
    await layers.getByRole("button", { name: "Lightning", exact: true }).click();
    await expect(layers.getByRole("button", { name: "Lightning", exact: true })).toBeFocused();
    await expect(layers.getByRole("button", { name: "Surface wind", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await camera(page)).toEqual(mapPose);
    expect(errors).toEqual([]);
  });

  test(`weather layers report recovery and remember disabled sources at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    const source = await sources(page);
    await page.goto("/#v=explore&at=-80,25,1.4");
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1.4);
    const pose = await camera(page);
    const layers = page.getByRole("region", { name: "Map layers", exact: true });
    await layers.getByRole("button", { name: "Surface wind", exact: true }).click();
    await openLayer(page, "Surface wind");
    const windPanel = layers.getByRole("region", { name: "Surface wind playback" });
    await expect(windPanel.getByRole("status")).toContainText("Couldn’t reach NOAA GFS surface wind.");
    expect(await camera(page)).toEqual(pose);
    source.recover();
    if (width === 390) await page.evaluate(() => window.dispatchEvent(new Event("online")));
    else await windPanel.getByRole("button", { name: "Retry surface wind" }).click();
    await expect(windPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /16:00/);
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await layers.getByRole("button", { name: "Lightning", exact: true }).click();
    await openLayer(page, "Lightning");
    await expect(layers.getByRole("region", { name: "Lightning playback" })).toContainText(
      "Satellite detections: 3",
    );
    await page.getByRole("button", { name: /^Feed status,/ }).click();
    const feedPanel = page.getByRole("region", { name: "Background feed status" });
    await expect(feedPanel).toContainText("9 background feeds checked.");
    for (const label of ["NOAA GFS surface wind", "NOAA GOES-East lightning"])
      await expect(feedPanel.getByRole("listitem").filter({ hasText: label })).toContainText("Available");
    await page.keyboard.press("Escape");
    expect((await new AxeBuilder({ page }).include(".map-layers").analyze()).violations).toEqual([]);
    const requests = { ...source.calls };
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await layers.getByRole("button", { name: "Surface wind", exact: true }).click();
    await layers.getByRole("button", { name: "Lightning", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeVisible();
    await expect(layers.getByRole("button", { name: "Surface wind", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(layers.getByRole("button", { name: "Lightning", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(source.calls).toEqual(requests);
  });
}

test("saved weather layers load on the landing globe and stay out of earthquake archives @dev", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() =>
    localStorage.setItem("eif.mapLayers", JSON.stringify({ wind: true, lightning: true, radar: false })),
  );
  const source = await sources(page);
  source.recover();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Explore the globe", exact: true })).toBeVisible();
  await expect.poll(() => source.calls.wind).toBeGreaterThan(0);
  await expect.poll(() => source.calls.lightning).toBeGreaterThan(0);
  await expect(page.getByRole("region", { name: "Lightning playback", includeHidden: true })).toContainText(
    "Satellite detections: 3",
  );
  const readout = page.getByLabel("Weather layer times", { exact: true });
  await expect(readout).toBeVisible();
  await expect(readout).toContainText("GFS wind forecast");
  await expect(readout).toContainText("GOES-East lightning");
  await expect(readout.locator("time")).toHaveCount(2);
  const beforeArchive = { ...source.calls };
  await page.goto("/#d=2011-03-11");
  await page.getByRole("button", { name: "Back to layers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Surface wind", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lightning", exact: true })).toBeDisabled();
  expect(source.calls).toEqual(beforeArchive);
  await page.getByRole("button", { name: "back to live", exact: true }).click();
  await expect.poll(() => source.calls.wind).toBeGreaterThan(beforeArchive.wind);
  await expect.poll(() => source.calls.lightning).toBeGreaterThan(beforeArchive.lightning);
});

test("weather selections survive a cinematic detour without resuming playback @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  const source = await sources(page);
  source.recover();
  await page.goto("/");
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  for (const name of ["Surface wind", "Lightning"]) {
    await layers.getByRole("button", { name, exact: true }).click();
  }
  await openLayer(page, "Lightning");
  const windPanel = page.getByRole("region", { name: "Surface wind playback" });
  const lightningPanel = page.getByRole("region", { name: "Lightning playback" });
  await lightningPanel.getByRole("slider").press("Home");
  await openLayer(page, "Surface wind");
  await windPanel.getByRole("slider").press("End");
  await page
    .getByRole("button", { name: "Everything Is Fine, back to the Observatory", exact: true })
    .click();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect(windPanel).toHaveCount(0);
  await expect(lightningPanel).toHaveCount(0);
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await expect(windPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /17:00/);
  await expect(windPanel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await openLayer(page, "Lightning");
  await expect(lightningPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /15:50/);
  await expect(lightningPanel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(async () => (await camera(page))?.morph).toBe(1);
  await expect(lightningPanel.getByRole("slider")).toHaveAttribute("aria-valuetext", /15:50/);
});
