import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

for (const [id, query, back] of [
  ["sky", "Tonight’s Sky", "Back to stories"],
  ["meteors", "Meteor Nights", "Back to stories"],
  ["moonfall", "Moonfall", "Back to stories"],
  ["sun", "Sun Watch", "Back to stories"],
  ["radar", "Storm Radar", "Back to stories"],
  ["float", "Float Dive", "Back to stories"],
] as const) {
  test(`${query} returns keyboard focus to its search result`, async ({ page }) => {
    if (id === "sky") await page.setViewportSize({ width: 320, height: 640 });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://erddap.marine.ie/**", (route) => route.abort());
    await page.route("**/json/rtsw/**", (route) => route.abort());
    await page.route("**/json/goes/**", (route) => route.abort());
    await page.route("https://opengeo.ncep.noaa.gov/**", (route) => route.abort());
    await page.goto("/");
    await openStories(page, "search");
    if (["sky", "meteors", "moonfall", "sun"].includes(id))
      await page.getByRole("button", { name: "After Dark", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Find a story" });
    await expect(search).toBeInViewport({ ratio: 1 });
    await search.fill(query);
    await page.locator(`#search-story-${id}`).click();
    await page.getByRole("button", { name: back, exact: true }).click();
    await expect(search).toHaveValue(query);
    await expect(page.locator(`#search-story-${id}`)).toBeFocused();
  });
}
