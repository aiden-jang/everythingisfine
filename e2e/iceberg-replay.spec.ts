import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("Iceberg Drift shares dated fragment tracks, satellite views and the selected iceberg", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await openStories(page);
  const trigger = page.getByRole("button", { name: "Iceberg Drift", exact: true });
  await trigger.click();
  const panel = page.getByRole("region", { name: "Iceberg Drift", exact: true });
  await panel.getByRole("button", { name: "Breakup", exact: true }).click();
  await panel.getByRole("button", { name: "Show satellite image" }).click();
  await expect(page.getByRole("img", { name: "Landsat 8 · Dec 23, 2020 · False color" })).toBeVisible();
  await panel.getByRole("button", { name: "Return to tracks" }).click();
  const ice = panel.getByRole("combobox", { name: "Iceberg" });
  await ice.selectOption({ label: "A-68J" });
  const slider = panel.getByRole("slider", { name: "Track date" });
  await expect(slider).toHaveAttribute("aria-valuetext", "Mar 17, 2021");
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Iceberg Drift on the map" })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", "Mar 17, 2021");
  await expect(ice).toHaveValue("J");
  await slider.press("Home");
  await expect(panel.getByText("This track starts Jan 30, 2021.")).toBeVisible();
  await slider.press("End");
  await expect(panel.getByText(/Last recorded position · Mar 17, 2021/)).toBeVisible();
  expect(await canvas.evaluate((element, before) => element === before, original)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
