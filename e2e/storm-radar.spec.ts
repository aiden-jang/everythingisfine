import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
  "base64",
);

test("Storm Radar scrubs published scans and keeps a missing image at its own time", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { empty: true, presentation: "fresh" });
  const now = Date.now();
  const times = [now - 35 * 60_000, now - 13 * 60_000, now - 4 * 60_000];
  const ids: number[] = [];
  let queries = 0;
  await page.route("**/radar_base_reflectivity_time/ImageServer/query?**", (route) => {
    queries += 1;
    return route.fulfill({
      json: {
        features: times.map((at, index) => ({ attributes: { objectid: index + 1, idp_validtime: at } })),
      },
    });
  });
  await page.route("**/radar_base_reflectivity_time/ImageServer/exportImage?**", (route) => {
    const url = new URL(route.request().url());
    const { lockRasterIds } = JSON.parse(url.searchParams.get("mosaicRule")!) as { lockRasterIds: number[] };
    const id = lockRasterIds[0]!;
    ids.push(id);
    return id === 2
      ? route.fulfill({ status: 503 })
      : route.fulfill({ contentType: "image/png", body: pixel });
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Storm Radar", exact: true });
  await expect(trigger).toBeVisible();
  expect(queries).toBe(0);
  await trigger.click();
  const scene = page.getByRole("dialog", { name: "Storm Radar" });
  const slider = scene.getByRole("slider", { name: "Radar scan time" });
  const time = scene.locator("time");
  const timestamp = (index: number) => new Date(times[index]!).toISOString();

  await expect(time).toHaveAttribute("datetime", timestamp(2));
  await expect(scene.getByRole("img", { name: /NOAA radar returns/ })).toBeVisible();
  await expect.poll(() => [...ids].sort()).toEqual([1, 2, 3]);
  await slider.press("ArrowLeft");
  await expect(time).toHaveAttribute("datetime", timestamp(1));
  await expect(scene.getByText("This scan’s image is unavailable.")).toBeVisible();
  await slider.press("Home");
  await expect(time).toHaveAttribute("datetime", timestamp(0));
  await expect(scene.getByRole("img", { name: /NOAA radar returns/ })).toBeVisible();
  await scene.getByLabel("Radar region").selectOption({ label: "Great Lakes" });
  await expect(scene.getByRole("heading", { name: "Great Lakes" })).toBeVisible();
  await scene.getByRole("button", { name: "Play scans" }).click();
  await expect(time).toHaveAttribute("datetime", timestamp(2));
  await expect(scene.getByText("Latest scan", { exact: true })).toBeVisible();
  await expect(scene.getByRole("button", { name: "Latest", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(slider).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(scene).toBeHidden();
  await expect(trigger).toBeFocused();
});
