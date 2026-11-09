import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

for (const [id, title] of [
  ["fault", "Fault Offset"],
  ["dust", "Dust Curtain"],
  ["fire", "Fire Front"],
  ["ice", "Ice Line"],
  ["north", "Wandering North"],
  ["ozone", "Ozone Season"],
  ["water", "Water Weight"],
  ["comet", "Comet Return"],
] as const) {
  test(`${title} advances its recorded data after arrival and pauses on request`, async ({ page }) => {
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await openStories(page);
    await page.getByRole("searchbox", { name: "Find a story or layer" }).fill(title);
    await page.locator(`#search-story-${id}`).click();
    const panel = page.getByRole("region", { name: title, exact: true });
    const timeline = panel.getByRole("slider");
    await expect(panel.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(0);
    await panel.getByRole("button", { name: "Pause", exact: true }).click();
    const held = await timeline.inputValue();
    await expect(panel.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect(timeline).toHaveValue(held);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
  });
}
