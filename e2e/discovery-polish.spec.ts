import { expect, test, type Page } from "@playwright/test";
import { openLayer, installFeeds, openStories, waitForData } from "./feeds";

const camera = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as { __globe: { state: () => { lon: number; lat: number; zoom: number } } }
    ).__globe;
    return globe?.state();
  });

test("isolating a layer restores choices without changing saved preferences", async ({ page }) => {
  await installFeeds(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForData(page);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  const saved = await page.evaluate(() => localStorage.getItem("eif.mapLayers"));
  const before = await layers
    .locator('button[aria-pressed="true"]')
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await openLayer(page, "Wildfires");
    await layers.getByRole("button", { name: "Show only this layer", exact: true }).click();
    await expect(layers.getByRole("status")).toContainText("Only wildfires");
    await expect(layers.locator('.layer-list button[aria-pressed="true"]')).toHaveCount(1);
    await layers.getByRole("button", { name: "Restore layers" }).click();
    await layers.getByRole("button", { name: "Back to layers", exact: true }).click();
    expect(
      await layers
        .locator('button[aria-pressed="true"]')
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label"))),
    ).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem("eif.mapLayers"))).toBe(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await layers.getByRole("combobox", { name: "Find a place", exact: true }).fill("Tokyo");
  await layers.getByRole("button", { name: "Locate Tokyo", exact: true }).click();
  await expect(layers.getByRole("region", { name: "Observations around Tokyo" })).toContainText(
    "Available reports only",
  );
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

test("keyboard previews do not move the camera, and date comparisons preserve framing @dev", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await openStories(page);
  await page.getByRole("searchbox", { name: "Find a story" }).fill("Aral");
  const story = page.locator("#search-story-aral");
  const before = await camera(page);
  await story.focus();
  await expect(page.getByText("Story region · preview")).toBeVisible();
  expect(await camera(page)).toEqual(before);
  await page.getByRole("button", { name: "Locate", exact: true }).click();
  await expect.poll(async () => (await camera(page))?.lon).toBeCloseTo(59.5, 1);
  await story.click();
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  const time = panel.getByRole("slider");
  await time.press("End");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await panel.getByText("Compare dates", { exact: true }).click();
  await panel.getByRole("button", { name: "Compare with first moment", exact: true }).click();
  const held = await camera(page);
  await panel.getByRole("button", { name: /^Earlier/ }).click();
  await expect(time).toHaveValue("0");
  expect(await camera(page)).toEqual(held);
  await panel.getByRole("button", { name: /^Selected/ }).click();
  await expect(time).toHaveValue("20");
  expect(await camera(page)).toEqual(held);
  await expect(panel.getByText("Last available moment", { exact: true })).toBeVisible();
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await panel.getByRole("button", { name: "Back to Observatory", exact: true }).click();
  await story.click();
  await expect(time).toHaveValue("20");
  await expect(panel.getByText(/Opened at a saved moment/)).toBeVisible();
  await panel.getByRole("button", { name: "Replay entrance", exact: true }).click();
  await expect(time).toHaveValue("0");
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

test.describe("touch discovery", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("holding previews a region without opening it or blocking the next tap", async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await openStories(page, "search");
    await page.getByRole("searchbox", { name: "Find a story" }).fill("Tonga");
    const story = page.locator("#search-story-tonga");
    await expect(page.getByText("Story region · preview")).toBeHidden();
    await story.dispatchEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 500,
    });
    await expect(page.getByText("Story region · preview")).toBeVisible();
    await story.dispatchEvent("pointerup", {
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 500,
    });
    await story.dispatchEvent("click");
    await expect(story).toBeVisible();
    await expect(page.getByText("Story region · preview")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss location preview" }).click();
    await story.tap();
    await expect(page.getByRole("region", { name: "Tonga’s shockwave", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("monitor inspection and place comparisons retain their source, time and shared canvas", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://files.airnowtech.org/airnow/**", (route) =>
    route.fulfill({
      body: "11/12/26|12:00|360610115|Manhattan|US|PM2.5|UG/M3|12.5\n11/12/26|12:00|250250042|Boston|US|PM2.5|UG/M3|7.0",
    }),
  );
  await page.goto("/#v=observe&story=air");
  const panel = page.getByRole("region", { name: "Air Watch", exact: true });
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const inspect = panel.getByRole("region", { name: "Inspect observations" });
  await inspect.getByRole("combobox", { name: "Inspect a monitor" }).selectOption("Manhattan/IS143");
  await expect(inspect.getByRole("status")).toContainText("12.5 µg/m³ PM₂.₅");
  await expect(inspect.getByRole("status")).toContainText("AirNow");
  await panel.getByText("Compare another place", { exact: true }).click();
  await panel.getByRole("combobox", { name: "Second place", exact: true }).selectOption("Boston");
  const table = panel.getByRole("table");
  await expect(table).toContainText("12.5 µg/m³");
  await expect(table).toContainText("7.0 µg/m³");
  await expect(table).toContainText("Same source and measurement definitions");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(inspect.getByRole("status")).toContainText("12.5 µg/m³ PM₂.₅");
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("phone-place-comparison.png") });
});

test("close city labels stay anchored on the globe and map without crowding the view @dev", async ({
  page,
}) => {
  await installFeeds(page, { empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#v=explore&at=139.7,35.7,3&layers=");
  const labels = page.locator(".place-labels span:visible");
  await expect(labels.filter({ hasText: "Tokyo" })).toBeVisible();
  for (const projection of ["globe", "map"]) {
    if (projection === "map") await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect.poll(async () => labels.count()).toBeGreaterThan(0);
    expect(await labels.count()).toBeLessThanOrEqual(5);
    const offsets = await labels.evaluateAll((nodes) => {
      const globe = (
        window as unknown as {
          __globe: { project: (lon: number, lat: number, radius: number) => { x: number; y: number } | null };
        }
      ).__globe;
      return nodes.map((node) => {
        const el = node as HTMLElement,
          b = el.getBoundingClientRect();
        const projected = globe.project(Number(el.dataset.lon), Number(el.dataset.lat), 1.01);
        return projected ? Math.hypot(b.x + b.width / 2 - projected.x, b.bottom - projected.y) : Infinity;
      });
    });
    expect(Math.max(...offsets)).toBeLessThan(1);
  }
});

test("a delayed final image keeps its prior timestamp and cannot announce an unseen ending", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/aral-2021[^/]*\.webp/, async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto("/#v=observe&story=aral");
    const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
    const shown = panel.locator(".story-time time");
    await expect(shown).toHaveAttribute("datetime", "1984-06-01T12:00:00.000Z");
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toHaveCount(0);
    await panel.getByRole("slider").press("End");
    await expect(panel.getByText("Loading the selected observations…", { exact: true })).toBeVisible();
    await expect(shown).toHaveAttribute("datetime", "1984-06-01T12:00:00.000Z");
    await expect(panel.getByText("Last available moment", { exact: true })).toHaveCount(0);
    release();
    await expect(shown).toHaveAttribute("datetime", "2021-06-01T12:00:00.000Z");
    await expect(panel.getByText("Last available moment", { exact: true })).toBeVisible();
  } finally {
    release();
  }
});
