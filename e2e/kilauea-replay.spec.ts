import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

async function openKilauea(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await openStories(page);
  const trigger = page.getByRole("button", { name: "Kīlauea" });
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await trigger.click();
  return { trigger, panel: page.getByRole("region", { name: "Kīlauea", exact: true }), canvas, original };
}

test("Kīlauea plays the survey and opens USGS footage on the shared globe", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const { trigger, panel, canvas, original } = await openKilauea(page);
  await expect(panel.getByRole("heading", { name: "Fissure 8 reopens" })).toBeVisible();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await panel.getByRole("button", { name: "Ocean entry" }).click();
  await expect(panel.getByRole("heading", { name: "Lava reaches Kapoho Bay" })).toBeVisible();
  await panel.getByRole("button", { name: "Watch USGS overflight" }).click();
  await expect(page.getByRole("img", { name: /USGS field footage/ })).toBeVisible();
  await expect(page.getByText("USGS overflight · June 4, 2018")).toBeVisible();
  await panel.getByRole("button", { name: "Return to lava map" }).click();
  expect(await canvas.evaluate((element, before) => element === before, original)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Kīlauea keeps the same coastline comparison on globe and map", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { panel, canvas, original } = await openKilauea(page);
  await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Ocean entry" }).click();
  await expect(panel.getByRole("slider", { name: "Mapped extent date" })).toHaveAttribute(
    "aria-valuetext",
    "Jun 4 · 22:00 HST",
  );
  await panel.getByRole("button", { name: "Compare coast" }).click();
  const compare = panel.getByRole("slider", { name: "Compare before and after" });
  await compare.press("Home");
  await expect(compare).toHaveAttribute("aria-valuetext", "Before the eruption");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Kīlauea on the map" })).toContainText("Before eruption");
  await expect(compare).toHaveAttribute("aria-valuetext", "Before the eruption");
  await compare.press("End");
  await expect(compare).toHaveAttribute("aria-valuetext", "August 9 coastline");
  await panel.getByRole("button", { name: "Globe", exact: true }).click();
  await expect(page.getByRole("group", { name: "Kīlauea on the globe" })).toContainText("August 9, 2018");
  expect(await canvas.evaluate((element, before) => element === before, original)).toBe(true);
});

test("returning from Kīlauea keeps the archived day and its launch control", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/#d=2018-06-04");
  const trigger = page.getByRole("button", { name: "Follow Kīlauea’s lava", exact: true });
  await trigger.click();
  await page.getByRole("button", { name: "Back to archive", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/d=2018-06-04/);
});
