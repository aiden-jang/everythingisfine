import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories, openLayer } from "./feeds";

const camera = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe: { state: () => { lon: number; lat: number; zoom: number }; morph: () => number };
      }
    ).__globe;
    return { ...globe.state(), morph: globe.morph() };
  });
async function start(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 950 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openStories(page, "search");
}

test("search scopes match the category and expanding the scope preserves the query @dev", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Find a story" });
  await search.fill("Aral");
  await expect(page.getByText("No matches in After Dark. Try a place, year or subject.")).toBeVisible();
  await expect(page.locator("#search-story-aral")).toHaveCount(0);
  await page.getByRole("button", { name: "Search all stories", exact: true }).click();
  await expect(search).toHaveValue("Aral");
  await expect(search).toBeFocused();
  await expect(page.locator("#search-story-aral")).toBeVisible();
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#search-story-aral").click();
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(search).toHaveValue("Aral");
  await expect(page.locator("#search-story-aral")).toBeFocused();
});

for (const width of [1440, 390]) {
  test(`a visible preview restores the view and a story return keeps the original camera at ${width}px @dev`, async ({
    page,
  }) => {
    await start(page, width);
    if (width === 1440) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/#v=explore&p=map");
      await expect(page.getByRole("tab", { name: "Stories", exact: true })).toBeVisible();
      await openStories(page, "search");
      await expect.poll(async () => (await camera(page)).morph).toBe(1);
    }
    await page.getByRole("searchbox", { name: "Find a story" }).fill("Aral");
    const before = await camera(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const preview = page.getByRole("button", { name: "Preview Vanishing Sea", exact: true });
    await preview.click();
    await expect.poll(async () => (await camera(page)).lon).toBeCloseTo(59.5, 1);
    await page.getByRole("button", { name: "Dismiss location preview" }).click();
    await expect.poll(() => camera(page)).toEqual(before);
    await expect(preview).toBeFocused();
    if (width === 1440) {
      await preview.click();
      await page.getByRole("tab", { name: "Layers", exact: true }).click();
      await expect(page.getByRole("button", { name: "Dismiss location preview" })).toHaveCount(0);
      await page.getByRole("tab", { name: "Stories", exact: true }).click();
      await expect.poll(() => camera(page)).toEqual(before);
    }
    await preview.click();
    await expect.poll(async () => (await camera(page)).lon).toBeCloseTo(59.5, 1);
    await page.screenshot({ path: test.info().outputPath(`preview-${width}.png`) });
    await page.locator("#search-story-aral").click();
    await page.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect.poll(() => camera(page)).toEqual(before);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(
      await page.locator("#stories-panel").evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  });
}

test("returning visits are one action away and preserve their saved moment and focus @dev", async ({
  page,
}) => {
  await start(page, 390);
  const search = page.getByRole("searchbox", { name: "Find a story" });
  await search.fill("Aral");
  await page.locator("#search-story-aral").click();
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  const slider = panel.getByRole("slider").first();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("2");
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await search.fill("");
  const resume = page.locator("#continue-story");
  await expect(resume).toContainText("Continue Vanishing Sea");
  await expect(resume).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath("continue-phone.png") });
  await page.reload();
  await openStories(page, "search");
  await resume.click();
  await expect(slider).toHaveValue("2");
  await page.getByRole("button", { name: "Back to stories", exact: true }).click();
  await expect(resume).toBeFocused();
});

test("story endings reveal one next story without moving focus and only offer one replay @dev", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("searchbox", { name: "Find a story" }).fill("Aral");
  await page.locator("#search-story-aral").click();
  const panel = page.getByRole("region", { name: "Vanishing Sea", exact: true });
  const slider = panel.getByRole("slider").first();
  const related = panel.locator(".related-stories");
  await expect(related).not.toHaveAttribute("open", "");
  await slider.press("End");
  await expect(related).toHaveAttribute("open", "");
  await expect(related.locator("summary")).toHaveText("Up next");
  await expect(related.getByRole("button")).toHaveCount(1);
  await expect(slider).toBeFocused();
  await expect(panel.getByRole("button", { name: "Replay", exact: true })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Restart", exact: true })).toHaveCount(0);
  await related.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("story-ending.png") });
  await slider.press("Home");
  await expect(related).not.toHaveAttribute("open", "");
  await expect(panel.getByRole("button", { name: "Restart", exact: true })).toHaveCount(1);
});

test("quiet layers explain empty reports beside the toggle and clear the explanation when hidden @dev", async ({
  page,
}) => {
  await installFeeds(page, { empty: true });
  await page.route(/gdacsapi\/api\/events\/geteventlist/, (route) =>
    route.fulfill({ json: { type: "FeatureCollection", features: [] } }),
  );
  await page.goto("/#v=explore");
  const row = page
    .locator(".layer-row")
    .filter({ has: page.getByRole("button", { name: "Wildfires details", exact: true }) });
  const toggle = row.getByRole("button", { name: "Wildfires", exact: true });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await expect(row).toContainText("No matching reports in this time window");
  await toggle.click();
  await expect(row.locator(".layer-status")).toHaveCount(0);
  await toggle.click();
  await openLayer(page, "Wildfires");
  await expect(page.getByRole("heading", { name: "Wildfires", exact: true })).toBeVisible();
  await expect(page.locator(".layer-inspector-heading")).toContainText(
    "No matching reports in this time window",
  );
});
