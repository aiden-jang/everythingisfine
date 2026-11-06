import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function openKilauea(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Historical replays", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Follow Kīlauea’s lava" });
  await trigger.click();
  return { trigger, dialog: page.getByRole("dialog", { name: "A new coastline" }) };
}

test("Kīlauea’s flight reaches the HVO ocean-entry shot and opens the shoreline comparison", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { trigger, dialog } = await openKilauea(page);
  await expect(dialog.getByRole("heading", { name: "Fissure 8 reopens" })).toBeVisible();
  await dialog.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Play", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Lava reaches Kapoho Bay" })).toBeVisible();
  await expect(dialog.getByText("USGS overflight · June 4, 2018")).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Coastline comparison" })).toBeVisible();
  await expect(dialog.getByText("USGS estimate · ~3.5 km² added")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Kīlauea’s reduced-motion map compares the two shorelines from a phone keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog } = await openKilauea(page);
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Ocean entry" }).click();
  await expect(dialog.getByRole("slider", { name: "Mapped extent" })).toHaveAttribute(
    "aria-valuetext",
    "Jun 4 · 22:00 HST",
  );
  await dialog.getByRole("button", { name: "Compare coast" }).click();
  const compare = dialog.getByRole("slider", { name: "Coastline comparison" });
  await compare.press("Home");
  await expect(compare).toHaveAttribute("aria-valuetext", "Before the eruption");
  await expect(dialog.getByText("Before eruption", { exact: true })).toBeVisible();
  await compare.press("End");
  await expect(compare).toHaveAttribute("aria-valuetext", "August 9 map");
  await expect(dialog.getByText("August 9, 2018", { exact: true })).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(dialog.getByRole("button", { name: "Compare coast" })).toBeInViewport();
});
