import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("phone sheet offers three sizes without losing the globe or covering its controls @dev", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/#v=explore&at=15,25,1.5");
  const sheet = page.getByRole("separator", { name: "Sheet height", exact: true });
  const navigation = page.getByRole("navigation", { name: "Explore", exact: true });
  await expect(navigation.getByRole("button")).toHaveCount(1);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const header = (await page.locator("#chrome-head").boundingBox())!;
  expect((await canvas!.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
  const size = () => sheet.getAttribute("aria-valuenow");
  await expect(sheet).toHaveAttribute("aria-valuenow", String(Math.round(844 * 0.43)));
  await navigation.getByRole("button", { name: "Collapse panel", exact: true }).click();
  const collapsed = Number(await size());
  await navigation.getByRole("button", { name: "Expand panel", exact: true }).click();
  const half = Number(await size());
  await sheet.press("Home");
  const expanded = Number(await size());
  expect(collapsed).toBeGreaterThan(half);
  expect(half).toBeGreaterThan(expanded);
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeInViewport();
  const legend = page.getByRole("region", { name: "Map legend", exact: true });
  await page.getByText("Map legend", { exact: true }).click();
  await expect(legend).toBeInViewport({ ratio: 1 });
  await expect(legend.getByRole("button", { name: "Close legend" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(legend).toBeHidden();
  await expect(page.getByText("Map legend", { exact: true })).toBeFocused();
  await page.getByText("Map legend", { exact: true }).click();
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await expect(legend).toBeHidden();
  await page.keyboard.press("Escape");
  await sheet.press("End");
  await expect(sheet).toHaveAttribute("aria-valuenow", String(collapsed));
  await sheet.press("Home");
  await expect(sheet).toHaveAttribute("aria-valuenow", String(expanded));
  const grip = (await sheet.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, half + 20, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("aria-valuenow", String(half));
  await sheet.press("End");
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(sheet).toHaveAttribute("aria-valuenow", String(Math.round(375 * 0.82)));
  await navigation.getByRole("button", { name: "Expand panel", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeInViewport();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByText("Keyboard controls", { exact: true }).filter({ visible: true }).click();
  await expect(page.locator(".mobile-key-hints .keyboard-controls")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByText("Map legend", { exact: true }).click();
  await expect(legend).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(page.locator(".map-legend-popover")).toHaveCount(0);
  await expect(page.locator(".canvas-legend details").first()).toHaveAttribute("open", "");
  await expect(page.locator(".canvas-legend")).toBeInViewport({ ratio: 1 });
});

for (const width of [1440, 812, 390]) {
  test(`Explore separates layer visibility, inspection and stories at ${width}px @dev`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    await page.goto("/#v=explore&at=15,25,1.5");
    const layers = page.getByRole("tabpanel", { name: "Layers", exact: true });
    await expect(layers).toBeVisible();
    await expect(layers.getByRole("button", { name: / details$/ })).toHaveCount(9);
    await expect(layers.getByRole("region", { name: "Weather & sky", exact: true })).toBeVisible();
    await expect(layers.getByRole("region", { name: "Reported events", exact: true })).toBeVisible();
    if (width === 1440)
      await expect(layers.getByRole("button", { name: "Volcanoes details", exact: true })).toBeInViewport();
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/layers-${width}.png` });
    await expect(page.getByRole("region", { name: "Earthquake activity" })).toBeHidden();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    if (width >= 768) {
      const rail = (await page.locator("#chrome-rail").boundingBox())!;
      const globe = (await page.locator("#globe-view").boundingBox())!;
      expect(globe.x).toBeGreaterThanOrEqual(rail.x + rail.width);
      expect(globe.width).toBeGreaterThan(300);
    }
    const camera = () =>
      page.evaluate(() => (window as unknown as { __globe: { state: () => unknown } }).__globe.state());
    await expect
      .poll(() => page.evaluate(() => Boolean((window as unknown as { __globe?: unknown }).__globe)))
      .toBe(true);
    const pose = await camera();
    await layers.getByRole("button", { name: "Wildfires", exact: true }).click();
    await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(layers.getByRole("button", { name: / details$/ })).toHaveCount(9);
    await layers.getByRole("button", { name: "Tropical cyclones details", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tropical cyclones", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: "Tropical cyclones reports" })).toBeVisible();
    await page.getByText("About this layer & sources", { exact: true }).click();
    await expect(page.getByText(/Reported tropical cyclone tracks, not rainfall radar/)).toBeVisible();
    await page.getByRole("button", { name: "Show only this layer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Only tropical cyclones" })).toBeVisible();
    await page.getByRole("button", { name: "Restore layers", exact: true }).click();
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await expect(
      layers.getByRole("button", { name: "Tropical cyclones details", exact: true }),
    ).toBeFocused();
    await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await layers.getByRole("button", { name: "Earthquakes details", exact: true }).click();
    await expect(page.getByRole("region", { name: "Earthquake activity" })).toBeVisible();
    await page.getByRole("heading", { name: "Earthquakes", exact: true }).press("Escape");
    await expect(layers.getByRole("button", { name: "Earthquakes details", exact: true })).toBeFocused();
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    const stories = page.getByRole("tabpanel", { name: "Stories", exact: true });
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    await expect(stories.getByRole("region", { name: "Selected stories" }).getByRole("button")).toHaveCount(
      5,
    );
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/stories-${width}.png` });
    const library = stories.getByRole("button", { name: "Library", exact: true });
    await expect(library).toHaveAttribute("aria-expanded", "false");
    await expect(stories.getByRole("button", { name: "Saved & recent", exact: true })).toBeHidden();
    await library.click();
    await stories.getByRole("button", { name: "Saved & recent", exact: true }).click();
    await expect(stories.locator("#story-library-panel-visits")).toBeVisible();
    await library.click();
    await expect(stories.getByRole("button", { name: "Saved & recent", exact: true })).toBeHidden();
    await expect(stories.getByRole("heading", { name: "All stories", exact: true })).toBeVisible();
    await stories.getByRole("button", { name: "After Dark", exact: true }).click();
    await expect(stories.getByRole("heading", { name: "After Dark", exact: true })).toBeVisible();
    await stories.getByRole("button", { name: "Show all", exact: true }).click();
    await expect(stories.getByRole("heading", { name: "All stories", exact: true })).toBeVisible();
    await expect(stories.locator('.observatory-scenes [aria-pressed="true"]')).toHaveCount(0);
    await stories.getByRole("button", { name: "After Dark", exact: true }).click();
    expect(await camera()).toEqual(pose);
    const search = stories.getByRole("searchbox", { name: "Find a story", exact: true });
    await search.fill("Vanishing Sea");
    await expect(stories.getByRole("region", { name: "Search results" })).toContainText("1 match");
    const story = stories.getByRole("region", { name: "Search results" }).getByRole("button").first();
    const trigger = await story.getAttribute("id");
    await story.click();
    const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
    await expect(panel.getByRole("slider")).toBeVisible();
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(search).toHaveValue("Vanishing Sea");
    await expect(page.locator(`#${trigger}`)).toBeFocused();
    await expect(stories.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(camera).toEqual(pose);
    expect(
      await canvas!.evaluate((element) => element === document.querySelector("#globe-view canvas")),
    ).toBe(true);
    await search.fill("");
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect((await new AxeBuilder({ page }).include("#chrome-rail").analyze()).violations).toEqual([]);
  });
}

for (const title of ["Lights Return", "Shadow Chase"]) {
  test(`${title} returns to its Explore search with an accurate label @dev`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    await page.goto("/#v=explore");
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Find a story", exact: true });
    await search.fill(title);
    const trigger = page.getByRole("region", { name: "Search results" }).getByRole("button").first();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const panel = page.getByRole("region", { name: title, exact: true });
    await panel.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(search).toHaveValue(title);
    await expect(trigger).toBeFocused();
    await search.fill("");
    await expect(page.getByRole("button", { name: "Float Dive", exact: true })).toHaveAccessibleDescription(
      "Argo ocean measurements Follow a measured profile toward the surface.",
    );
    await expect(page.getByRole("button", { name: "Storm Radar", exact: true })).toHaveAccessibleDescription(
      "Recent observations Scrub recent radar from around the world on the globe.",
    );
    expect((await new AxeBuilder({ page }).include("#chrome-rail").analyze()).violations).toEqual([]);
  });
}

test("panel arrivals work in both directions and settle without replacing the canvas @dev", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.addInitScript(() => {
    const arrivals: string[] = [];
    Object.assign(window, { panelArrivals: arrivals });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.id === "explorer-layers" || this.id === "explorer-stories") arrivals.push(this.id);
      return animate.call(this, frames, options);
    };
  });
  await page.goto("/#v=explore&at=15,25,1");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await expect(page.getByRole("button", { name: "Volcanoes details", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const arrivals = () =>
    page.evaluate(() => (window as unknown as { panelArrivals: string[] }).panelArrivals);
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await expect.poll(arrivals).toEqual(["explorer-stories"]);
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect.poll(arrivals).toEqual(["explorer-stories", "explorer-layers"]);
  await expect
    .poll(() => page.locator("#explorer-layers").evaluate((node) => node.getAnimations().length))
    .toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Stories", exact: true })).toBeVisible();
  expect(await arrivals()).toEqual(["explorer-stories", "explorer-layers"]);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});
