import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("phone navigation follows the visible layers and the guide explains empty coverage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/#v=explore&layers=fires,floods");
  await expect(page.getByRole("button", { name: "Recent earthquakes", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Layers & activity", exact: true }).click();
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toBeInViewport();
  await layers.getByText("Layer guide", { exact: true }).click();
  await expect(layers.getByText(/Reported flood events, not a map/)).toBeVisible();
  await layers.getByRole("button", { name: "Wildfires", exact: true }).click();
  await layers.getByRole("button", { name: "Floods", exact: true }).click();
  await expect(layers.getByText(/All layers are off/)).toBeVisible();
  await layers.getByRole("button", { name: "Earthquakes", exact: true }).click();
  await page.getByRole("button", { name: "Recent earthquakes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Recent earthquakes" })).toBeInViewport();
  const status = page.getByRole("button", { name: /^Feed status,/ });
  await status.click();
  await page.setViewportSize({ width: 844, height: 390 });
  const popup = page.getByRole("region", { name: "Background feed status", exact: true });
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(844);
});

test("hidden base layers stay hidden through landing, scene categories and both projections @dev", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/");
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  const counts = () =>
    page.evaluate(() => {
      const world = window as unknown as {
        __events?: { object: { geometry: { drawRange: { count: number } } } };
        __marks?: () => { id: string }[];
        __rings?: { object: { geometry: { drawRange: { count: number } } } };
      };
      if (!world.__events || !world.__marks || !world.__rings) return null;
      return {
        quakes: world.__events.object.geometry.drawRange.count,
        rings: world.__rings.object.geometry.drawRange.count,
        hazards: world.__marks().filter(({ id }) => /^(cyclone|fire|flood|volcano):/.test(id)).length,
      };
    });
  await expect.poll(async () => (await counts())?.quakes ?? 0).toBeGreaterThan(0);
  await expect.poll(async () => (await counts())?.hazards ?? 0).toBeGreaterThan(0);
  await page.evaluate(() => {
    const world = window as unknown as {
      __feed: {
        store: {
          forEach: (
            fn: (q: { key: string; primary: { lon: number; lat: number; magnitude: number } }) => void,
          ) => void;
        };
      };
      __rings: {
        spawn: (lon: number, lat: number, mag: number, key: string) => void;
        step: (dt: number) => void;
      };
      __drawOnce: () => void;
    };
    world.__feed.store.forEach((q) =>
      world.__rings.spawn(q.primary.lon, q.primary.lat, q.primary.magnitude, q.key),
    );
    world.__rings.step(0.1);
    world.__drawOnce();
  });
  expect((await counts())?.rings).toBeGreaterThan(0);
  await layers.getByRole("button", { name: "Earthquakes", exact: true }).click();
  expect((await counts())?.rings, "turning earthquakes off removes their existing wavefronts").toBe(0);
  for (const name of ["Tropical cyclones", "Wildfires", "Floods", "Volcanoes", "Aurora forecast"]) {
    await layers.getByRole("button", { name, exact: true }).click();
  }
  await expect.poll(counts).toEqual({ quakes: 0, rings: 0, hazards: 0 });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(counts).toEqual({ quakes: 0, rings: 0, hazards: 0 });
  await page
    .getByRole("button", { name: "Everything Is Fine, back to the Observatory", exact: true })
    .click();
  for (const name of ["Live Earth", "Below the Surface", "After Dark"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(counts).toEqual({ quakes: 0, rings: 0, hazards: 0 });
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(counts).toEqual({ quakes: 0, rings: 0, hazards: 0 });
  }
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __globe: { morph: () => number } }).__globe.morph()),
    )
    .toBe(1);
  await expect(page.getByRole("button", { name: "Globe", exact: true })).toBeVisible();
});

test("a fresh overview exposes every scene and selecting one opens its content @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  const scenes = page.getByRole("group", { name: "Earth scenes", exact: true });
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Stories and layers", exact: true })).toHaveCount(0);
  const explore = await page.getByRole("button", { name: "Explore the globe", exact: true }).boundingBox();
  const picker = await scenes.boundingBox();
  expect(explore!.y + explore!.height).toBeLessThan(picker!.y);
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "Live Earth", exact: true }).click();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(1);
  await page.goBack();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Live Earth", exact: true }).click();
  await page.getByRole("button", { name: "Storm Radar", exact: true }).click();
  await page.getByRole("button", { name: "Back to Live Earth", exact: true }).click();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator("#open-storm-radar")).toBeFocused();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sun Watch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Below the Surface", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rupture Reveal", exact: true })).toBeVisible();
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
});

test("Explore switches independent layers without rebuilding the globe @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/");
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  const earthquakes = layers.getByRole("button", { name: "Earthquakes", exact: true });
  await expect(earthquakes).toHaveAttribute("aria-pressed", "true");
  const canvas = await page.locator("canvas").elementHandle();
  const drawnEarthquakes = () =>
    page.evaluate(
      () =>
        (window as unknown as { __events: { object: { geometry: { drawRange: { count: number } } } } })
          .__events.object.geometry.drawRange.count,
    );
  await expect.poll(drawnEarthquakes).toBeGreaterThan(0);
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  const selection = page.locator(".zone-panel");
  await expect(selection).toBeVisible();
  const selectedPlace = await selection.getByRole("heading").innerText();
  const selectedTime = await selection.locator("time").first().getAttribute("datetime");
  await layers.getByRole("button", { name: "Wildfires", exact: true }).click();
  await expect(selection).toBeVisible();
  await expect(selection.getByRole("heading")).toHaveText(selectedPlace);
  await expect(selection.locator("time").first()).toHaveAttribute("datetime", selectedTime!);
  await earthquakes.click();
  await expect(selection).toBeHidden();
  await expect.poll(drawnEarthquakes).toBe(0);
  await expect(page.locator("#mag")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Layer time window", exact: true })).toBeVisible();
  await expect(layers.getByRole("button", { name: "Tropical cyclones", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await earthquakes.click();
  await expect(page.locator("#mag")).toBeVisible();
  await expect.poll(drawnEarthquakes).toBeGreaterThan(0);
  const storms = layers.getByRole("button", { name: "Tropical cyclones", exact: true });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __marks: () => { id: string }[] })
            .__marks()
            .filter(({ id }) => id.startsWith("cyclone:")).length,
      ),
    )
    .toBeGreaterThan(0);
  await storms.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __marks: () => { id: string }[] })
            .__marks()
            .filter(({ id }) => id.startsWith("cyclone:")).length,
      ),
    )
    .toBe(0);
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
  await page.reload();
  await expect(storms).toHaveAttribute("aria-pressed", "false");
  await layers.getByRole("button", { name: /All stories & data/ }).click();
  await expect(page.getByRole("region", { name: "Stories and layers", exact: true })).toBeVisible();
});

test("the full catalogue returns to its original entry after a story @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/");
  await page.getByRole("button", { name: /All stories & data/ }).click();
  const scenes = page.getByRole("group", { name: "Earth scenes", exact: true });
  const radar = page.locator("#overview-story-radar");
  await radar.click();
  await page.getByRole("button", { name: "Back to Live Earth", exact: true }).click();
  await expect(radar).toBeFocused();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
});
