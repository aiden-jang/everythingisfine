import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories, waitForData } from "./feeds";

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
    await layers.getByRole("combobox", { name: "Focus on one layer" }).selectOption("fires");
    await expect(layers.getByRole("status")).toContainText("Only wildfires");
    await expect(layers.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await layers.getByRole("button", { name: "Restore layers" }).click();
    expect(
      await layers
        .locator('button[aria-pressed="true"]')
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label"))),
    ).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem("eif.mapLayers"))).toBe(saved);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await layers.getByText("Around a place", { exact: true }).click();
  await layers.getByRole("combobox", { name: "Place", exact: true }).selectOption("Tokyo");
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
  await page.getByRole("searchbox", { name: "Find a story or layer" }).fill("Aral");
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
  await panel.getByRole("button", { name: "Compare with first observation", exact: true }).click();
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
    await openStories(page);
    await page.getByRole("searchbox", { name: "Find a story or layer" }).fill("Tonga");
    const story = page.locator("#search-story-tonga");
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
