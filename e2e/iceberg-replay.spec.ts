import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

async function openIceberg(page: Page) {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await page.getByText("Revisit a day", { exact: true }).click();
  const trigger = page.getByRole("button", { name: "Follow iceberg A-68A" });
  await trigger.click();
  return { trigger, dialog: page.getByRole("dialog", { name: "Iceberg Drift" }) };
}

test("Iceberg Drift cuts from satellite views to the recorded fragment paths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { trigger, dialog } = await openIceberg(page);
  await expect(dialog.getByText("Terra MODIS · Nov 5, 2020")).toBeVisible();
  await dialog.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Play", exact: true }).click();
  await expect(dialog.getByText("Scotia Sea · Satellite tracks")).toBeVisible();
  await expect(dialog.getByText("Landsat 8 · Dec 23, 2020 · False color")).toBeVisible();
  await expect(dialog.getByText("NOAA-20 VIIRS · Jan 11, 2021")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Where the pieces went" })).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Track date" })).toHaveAttribute(
    "aria-valuetext",
    "Apr 16, 2021",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Iceberg Drift keeps the fragment picker and dated map available with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog } = await openIceberg(page);
  await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Breakup", exact: true }).click();
  await expect(dialog.getByText("Landsat 8 · Dec 23, 2020 · False color")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Iceberg", exact: true }).selectOption({ label: "A-68J" });
  const slider = dialog.getByRole("slider", { name: "Track date" });
  await expect(slider).toHaveAttribute("aria-valuetext", "Mar 17, 2021");
  await expect(dialog.getByText(/Last listed · Mar 17, 2021/)).toBeVisible();
  await slider.press("Home");
  await expect(dialog.getByText("This track starts Jan 30, 2021.")).toBeVisible();
  await slider.press("End");
  await expect(dialog.getByText(/Last listed · Mar 17, 2021/)).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(dialog.getByRole("button", { name: "Fragments", exact: true })).toBeInViewport();
});
