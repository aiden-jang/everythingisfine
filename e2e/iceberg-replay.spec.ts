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
  await panel.getByRole("button", { name: "Fragments", exact: true }).click();
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  const date = panel.getByRole("slider", { name: "Track date" });
  const fragment = panel.getByRole("button", { name: "Inspect A-68E", exact: true });
  await expect(date).toHaveAttribute("aria-valuetext", "Jan 11, 2021");
  await fragment.click();
  await expect(panel.getByRole("combobox", { name: "Iceberg" })).toHaveValue("E");
  await expect(date).toHaveAttribute("aria-valuetext", "Jan 11, 2021");
  await panel.getByRole("slider", { name: "Track date" }).press("ArrowLeft");
  await panel.getByRole("combobox", { name: "Iceberg" }).selectOption({ label: "A-68A" });
  await expect(date).toHaveAttribute("aria-valuetext", "Jan 10, 2021");
  await panel.getByRole("button", { name: "Breakup", exact: true }).click();
  await panel.getByRole("button", { name: "Show satellite image" }).click();
  const image = panel.getByRole("img", { name: "Landsat 8 · Dec 23, 2020 · False color" });
  await expect(image).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  const caption = panel.locator(".iceberg-photo figcaption");
  const photo = (await image.boundingBox())!;
  expect(photo.x + photo.width).toBeLessThan((await caption.boundingBox())!.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: "Globe", exact: true }).click();
  await panel.getByRole("button", { name: "Return to tracks" }).click();
  await expect(panel.getByRole("button", { name: "Show satellite image" })).toBeFocused();
  await expect(panel.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(date).toHaveAttribute("aria-valuetext", "Dec 23, 2020");
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
