import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

const home = "Everything Is Fine, back to the Observatory";
test("discovery changes with the scene and keeps the same globe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await openStories(page);
  await expect(page.locator(".featured-story button")).toHaveAccessibleName("Float Dive");
  await expect(page.getByRole("region", { name: "Worth looking at today" })).toContainText(
    "calculated for a level horizon",
  );
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await openStories(page);
  await expect(page.locator(".featured-story button")).toHaveAccessibleName("Moonfall");
  await page.locator(".featured-story button").click();
  await expect(page.getByRole("group", { name: "Lunar view" })).toBeVisible();
  await page.getByRole("button", { name: home }).click();
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("a saved lunar traverse resumes after a new page visit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await openStories(page);
  await page.locator(".featured-story button").click();
  await page.getByRole("combobox", { name: "Rover traverse" }).selectOption("1");
  const distance = page.getByRole("slider", { name: "Mapped distance" });
  await distance.press("End");
  const value = await distance.inputValue();
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(page.locator(".visit-save")).toContainText("Saved on this device");
  await page.goto("/");
  await openStories(page);
  await page
    .getByRole("region", { name: "Your visits" })
    .getByRole("button", { name: /Moonfall Traverse 2/ })
    .click();
  await expect(distance).toHaveValue(value);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("a saved float returns to its measured depth after a new page visit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.route("https://erddap.marine.ie/**", (route) =>
    route.fulfill({ json: { table: { rows: [] } } }),
  );
  await page.goto("/");
  await openStories(page);
  await page.locator(".featured-story button").click();
  const depth = page.getByRole("slider", { name: "Ascent depth" });
  await depth.press("End");
  const value = await depth.inputValue();
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.goto("/");
  await openStories(page);
  const shelf = page.getByRole("region", { name: "Your visits" });
  await shelf.getByText("Saved views (1)", { exact: true }).click();
  await shelf
    .locator("details")
    .getByRole("button", { name: /Float Dive Saved float/ })
    .click();
  await expect(depth).toHaveValue(value);
  await expect(page.getByRole("button", { name: "Replay ascent" })).toBeVisible();
});

test("saved views and recent history can be cleared independently", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const visit = { id: "float", seen: Date.now(), position: {} };
    localStorage.setItem("eif.visits", JSON.stringify({ version: 1, recent: [visit], saved: [visit] }));
  });
  await page.goto("/");
  await openStories(page);
  const shelf = page.getByRole("region", { name: "Your visits" });
  await shelf.getByText("Saved views (1)", { exact: true }).click();
  await shelf.getByRole("button", { name: "Remove saved Float Dive" }).click();
  await expect(shelf).toContainText("Saved views (0)");
  await expect(shelf).toContainText("Float Dive");
  await shelf.getByRole("button", { name: "Clear recent visits" }).click();
  await expect(shelf).toHaveCount(0);
});

test("refused storage keeps a usable visit without promising persistence", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "eif.visits") throw new DOMException("Denied", "QuotaExceededError");
      set.call(this, key, value);
    };
  });
  await page.goto("/#v=observe&story=katrina");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await expect(page.locator(".visit-save")).toContainText("Saved for this visit");
  await page.getByRole("button", { name: home }).click();
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await page.getByRole("button", { name: home }).click();
  await openStories(page);
  await expect(page.getByRole("region", { name: "Your visits" })).toContainText("Eye of the Storm");
  expect(await page.evaluate(() => localStorage.getItem("eif.visits"))).toBeNull();
});
