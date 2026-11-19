import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test("today’s feed discovery restores its disclosure and trigger after a story", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  const today = page.locator(".story-today");
  await today.locator("summary").click();
  const trigger = page.locator("#discovery-aurora");
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(today).toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeInViewport();
});

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
  const defaultSize = String(Math.round(844 * 0.43) - 60);
  await expect(sheet).toHaveAttribute("aria-valuenow", defaultSize);
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await expect(sheet).toHaveAttribute("aria-valuenow", defaultSize);
  const stories = page.getByRole("tabpanel", { name: "Stories", exact: true });
  const firstRow = stories.locator(".story-choice").first();
  await expect(firstRow).toBeInViewport({ ratio: 1 });
  const row = (await firstRow.boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual((await page.locator(".creator-credit").boundingBox())!.y);
  expect(
    Math.abs((await page.locator("#chrome-rail").boundingBox())!.y - Number(await size())),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(sheet).toHaveAttribute("aria-valuenow", defaultSize);
  await navigation.getByRole("button", { name: "More globe", exact: true }).click();
  const collapsed = Number(await size());
  await navigation.getByRole("button", { name: "More controls", exact: true }).click();
  const half = Number(await size());
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/sheet-390.png` });
  await sheet.press("Home");
  const expanded = Number(await size());
  expect(collapsed).toBeGreaterThan(half);
  expect(half).toBeGreaterThan(expanded);
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeInViewport();
  const legend = page.getByRole("region", { name: "Sources & legend", exact: true });
  await page.getByRole("button", { name: "Sources & legend", exact: true }).click();
  await expect(legend).toBeInViewport({ ratio: 1 });
  await expect(legend.getByRole("button", { name: "Close sources and legend" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(legend).toBeHidden();
  await expect(page.getByRole("button", { name: "Sources & legend", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Sources & legend", exact: true }).click();
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
  await page.getByRole("tab", { name: "Stories", exact: true }).click();
  await expect(sheet).toHaveAttribute("aria-valuenow", String(half));
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await sheet.press("End");
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(sheet).toHaveAttribute("aria-valuenow", String(Math.round(375 * 0.82) - 60));
  await navigation.getByRole("button", { name: "More controls", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeInViewport();
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/sheet-667.png` });
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByText("Keyboard controls", { exact: true }).filter({ visible: true }).click();
  await expect(page.locator(".mobile-key-hints .keyboard-controls")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sources & legend", exact: true }).click();
  await expect(legend).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(legend).toHaveCount(0);
  const desktopLegend = page.locator(".canvas-legend details").first();
  await desktopLegend.getByText("Legend", { exact: true }).click();
  await expect(desktopLegend).toHaveAttribute("open", "");
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
    await expect
      .poll(() => page.evaluate(() => Boolean((window as unknown as { __globe?: unknown }).__globe)))
      .toBe(true);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/layers-${width}.png` });
    await expect(page.getByRole("region", { name: "Earthquake activity" })).toBeHidden();
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const panelSurface = () =>
      page.locator("#chrome-rail").evaluate((element) => {
        const panel = getComputedStyle(element);
        const tabs = getComputedStyle(element.querySelector(".explorer-tabs")!);
        return [panel.backgroundImage, panel.borderColor, tabs.backgroundColor, tabs.marginBottom];
      });
    const layerSurface = await panelSurface();
    if (width >= 768) {
      const rail = (await page.locator("#chrome-rail").boundingBox())!;
      const globe = (await page.locator("#globe-view").boundingBox())!;
      expect(globe.x).toBeGreaterThanOrEqual(rail.x + rail.width);
      expect(globe.width).toBeGreaterThan(300);
    }
    const camera = () =>
      page.evaluate(() => (window as unknown as { __globe: { state: () => unknown } }).__globe.state());
    const pose = await camera();
    const switches = layers.locator(".layer-row .layer-visibility");
    const switchPositions = () =>
      switches.evaluateAll((buttons) =>
        buttons.map((button) => [(button as HTMLElement).offsetTop, (button as HTMLElement).offsetLeft]),
      );
    const before = await switchPositions();
    await layers.getByRole("button", { name: "Wildfires", exact: true }).click();
    await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(await switchPositions()).toEqual(before);
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
    expect(await panelSurface()).toEqual(layerSurface);
    const stories = page.getByRole("tabpanel", { name: "Stories", exact: true });
    const category = stories.getByRole("group", { name: "Story categories", exact: true });
    const allStories = category.getByRole("button", { name: "All stories", exact: true });
    const afterDark = category.getByRole("button", { name: "After Dark", exact: true });
    const search = stories.getByRole("searchbox", { name: "Find a story", exact: true });
    await expect(category).toBeInViewport({ ratio: 1 });
    await expect(category.getByRole("button")).toHaveText([
      "All stories",
      "Earth",
      "Below the Surface",
      "After Dark",
    ]);
    await page.locator("#chrome-rail").evaluate((rail) => rail.scrollTo({ top: 0 }));
    await page.evaluate(() => document.fonts.ready);
    const categoryBox = await category.boundingBox();
    const searchBox = await search.boundingBox();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const name of ["Earth", "Below the Surface", "After Dark", "All stories"]) {
      const filter = category.getByRole("button", { name, exact: true });
      await filter.click();
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      expect(await category.boundingBox()).toEqual(categoryBox);
      expect(await search.boundingBox()).toEqual(searchBox);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    await expect(
      stories.getByRole("region", { name: "Selected stories" }).locator(".story-choice > button"),
    ).toHaveCount(3);
    await expect(stories.getByRole("button", { name: "Preview Rupture Reveal", exact: true })).toBeVisible();
    if (width !== 812) {
      const firstRow = stories.locator(".story-choice").first();
      await expect(firstRow).toBeInViewport({ ratio: 1 });
      const row = (await firstRow.boundingBox())!;
      const credit = (await page.locator(".creator-credit").boundingBox())!;
      expect(row.y + row.height).toBeLessThanOrEqual(credit.y);
      if (width === 1440)
        await expect(stories.getByRole("button", { name: /^View all \d+ stories$/ })).toBeInViewport({
          ratio: 1,
        });
    }
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/stories-${width}.png` });
    const saved = stories.getByRole("button", { name: "Saved & recent", exact: true });
    await expect(saved).toHaveAttribute("aria-expanded", "false");
    await saved.click();
    await expect(stories.locator("#story-library-panel-visits")).toBeVisible();
    await saved.click();
    await expect(stories.locator("#story-library-panel-visits")).toBeHidden();
    await expect(allStories).toHaveAttribute("aria-pressed", "true");
    await afterDark.click();
    await expect(afterDark).toHaveAttribute("aria-pressed", "true");
    await expect(stories.getByRole("button", { name: /^(Open story: )?Moonfall$/ })).toBeVisible();
    await allStories.click();
    await expect(stories.getByRole("button", { name: "Float Dive", exact: true })).toBeVisible();
    await afterDark.click();
    await expect(afterDark).toHaveAttribute("aria-pressed", "true");
    expect(await camera()).toEqual(pose);
    await search.fill("Vanishing Sea");
    await expect(stories.getByRole("region", { name: "Search results" })).toContainText(
      "No matches in After Dark",
    );
    await allStories.click();
    await expect(search).toHaveValue("Vanishing Sea");
    await expect(stories.getByRole("region", { name: "Search results" })).toContainText("1 match");
    const story = stories.getByRole("region", { name: "Search results" }).getByRole("button").first();
    const trigger = await story.getAttribute("id");
    await story.click();
    const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
    await expect(panel.getByRole("slider")).toBeVisible();
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(search).toHaveValue("Vanishing Sea");
    await expect(page.locator(`#${trigger}`)).toBeFocused();
    await expect(allStories).toHaveAttribute("aria-pressed", "true");
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
    await expect(
      layers.getByRole("button", { name: "Aurora forecast details", exact: true }),
    ).toHaveAccessibleDescription("Polar forecast · check near the poles");
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
    await page.getByRole("button", { name: /^View all \d+ stories$/ }).click();
    await expect(page.getByRole("button", { name: "Float Dive", exact: true })).toHaveAccessibleDescription(
      "Measured profile Rise through an Argo temperature and salinity profile.",
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

test("clearing search and dismissing a transient location preview keep keyboard focus @dev", async ({
  page,
}) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse stories", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Find a story", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Tonga");
  const result = page.locator("#search-story-tonga");
  await expect(result).toBeEnabled();
  await result.focus();
  await expect(result).toBeFocused();
  const dismiss = page.getByRole("button", { name: "Dismiss location preview", exact: true });
  await dismiss.press("Enter");
  await expect(result).toBeFocused();
  await expect(dismiss).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).press("Enter");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
});
