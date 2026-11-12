import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("a fresh overview exposes every scene and selecting one opens its content @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  const scenes = page.getByRole("group", { name: "Earth scenes", exact: true });
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Stories and layers", exact: true })).toBeVisible();
  const explore = await page.getByRole("button", { name: "Explore the globe", exact: true }).boundingBox();
  const picker = await scenes.boundingBox();
  expect(explore!.y + explore!.height).toBeLessThan(picker!.y);
  const canvas = await page.locator("canvas").elementHandle();
  await page.getByRole("button", { name: "Live Earth", exact: true }).click();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(1);
  await page.goBack();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Storm Radar", exact: true }).click();
  await page.getByRole("button", { name: "Back to Live Earth", exact: true }).click();
  await expect(scenes.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#overview-story-radar")).toBeFocused();
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
