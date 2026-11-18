import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("a failed story download leaves the shared globe and a usable return path", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.route(/\/a\/FloatDivePanel-[^/]+\.js(?:\?|$)/, (route) => route.abort());
  await page.goto("/");
  await openStories(page, "search");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await page.getByRole("searchbox", { name: "Find a story" }).fill("Float Dive");
  const trigger = page.locator("#search-story-float");
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const recovery = page.getByRole("region", { name: "Story unavailable" });
  await expect(recovery.getByRole("heading")).toHaveText("Couldn’t open Float Dive.");
  await expect(recovery.getByRole("button", { name: "Try again" })).toBeVisible();
  await recovery.getByRole("button", { name: "Back to stories" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Find a story" })).toHaveValue("Float Dive");
  expect(
    await page.locator("#globe-view canvas").evaluate((node, previous) => node === previous, canvas),
  ).toBe(true);
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("button", { name: "Earthquakes details" })).toBeVisible();
});
