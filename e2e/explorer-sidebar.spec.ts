import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

for (const width of [1440, 812, 390]) {
  test(`Explore separates layer visibility, inspection and stories at ${width}px @dev`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 812 ? 375 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    await page.goto("/#v=explore&at=15,25,1.5");
    const layers = page.getByRole("tabpanel", { name: "Layers", exact: true });
    await expect(layers).toBeVisible();
    await expect(layers.getByRole("button", { name: / details$/ })).toHaveCount(9);
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
      7,
    );
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
      "Argo ocean measurements Follow a measured profile from the deep Atlantic toward the surface.",
    );
    await expect(page.getByRole("button", { name: "Storm Radar", exact: true })).toHaveAccessibleDescription(
      "Recent observations Scrub recent radar from around the world on the globe.",
    );
    expect((await new AxeBuilder({ page }).include("#chrome-rail").analyze()).violations).toEqual([]);
  });
}
