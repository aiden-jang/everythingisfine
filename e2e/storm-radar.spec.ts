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
  await page.addInitScript(() => {
    const upload = WebGL2RenderingContext.prototype.texSubImage2D;
    WebGL2RenderingContext.prototype.texSubImage2D = function (...args: unknown[]) {
      const image = args.at(-1);
      if (image instanceof ImageBitmap && image.width === 1 && this.canvas instanceof HTMLCanvasElement) {
        const count = Number(this.canvas.dataset["radarUploads"] ?? 0);
        this.canvas.dataset["radarUploads"] = String(count + 1);
      }
      Reflect.apply(upload, this, args);
    };
  });
  const now = Date.now();
  const times = [now - 35 * 60_000, now - 13 * 60_000, now - 4 * 60_000];
  const ids: number[] = [];
  let queries = 0;
  let catalogueDown = false;
  let lightningDown = true;
  await page.route("https://noaa-goes19.s3.amazonaws.com/**", (route) =>
    lightningDown
      ? route.fulfill({ status: 503 })
      : route.fulfill({ contentType: "application/xml", body: "<ListBucketResult/>" }),
  );
  await page.route("**/radar_base_reflectivity_time/ImageServer/query?**", (route) => {
    queries += 1;
    if (catalogueDown) return route.fulfill({ status: 503 });
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
  const canvas = page.locator("#globe-view canvas");
  const globe = await canvas.elementHandle();
  await expect(trigger).toBeEnabled();
  expect(queries).toBe(0);
  await trigger.click();
  const scene = page.getByRole("region", { name: "Storm Radar" });
  await expect(scene.getByRole("button", { name: "Back to Live Earth" })).toBeFocused();
  await expect(page.getByRole("group", { name: "Radar on the globe" })).toBeInViewport();
  expect(await canvas.evaluate((element, original) => element === original, globe)).toBe(true);
  const slider = scene.getByRole("slider", { name: "Radar scan time" });
  const time = scene.locator(".radar-clock time");
  const timestamp = (index: number) => new Date(times[index]!).toISOString();

  await expect(time).toHaveAttribute("datetime", timestamp(2));
  const lightning = scene.getByRole("button", { name: "Lightning", exact: true });
  await lightning.click();
  await expect(scene.getByText("Couldn’t load lightning data.")).toBeVisible();
  await lightning.click();
  lightningDown = false;
  await lightning.click();
  await expect(scene.getByText("No lightning scan matches this radar time.")).toBeVisible();
  await lightning.click();
  await expect(canvas).toHaveAttribute("data-radar-uploads", "1");
  await expect.poll(() => [...ids].sort()).toEqual([1, 2, 3]);
  await slider.press("ArrowLeft");
  await expect(time).toHaveAttribute("datetime", timestamp(1));
  await expect(scene.getByText("This scan’s image is unavailable.")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-radar-uploads", "1");
  await slider.press("Home");
  await expect(time).toHaveAttribute("datetime", timestamp(0));
  await expect(canvas).toHaveAttribute("data-radar-uploads", "2");
  await scene.getByLabel("Radar region").selectOption({ label: "Great Lakes" });
  await expect(scene.getByRole("heading", { name: "Great Lakes" })).toBeVisible();
  await scene.getByRole("button", { name: "Play scans" }).click();
  await expect(time).toHaveAttribute("datetime", timestamp(2));
  await expect(scene.getByText("Latest scan", { exact: true })).toBeVisible();
  await expect(scene.getByRole("button", { name: "Latest", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 812, height: 375 });
  await scene.getByLabel("Radar region").selectOption("national");
  await expect(slider).toBeInViewport({ ratio: 1 });
  await expect(scene.getByRole("button", { name: "Play scans" })).toBeInViewport({ ratio: 1 });
  await scene.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("group", { name: "Radar on the map" })).toBeVisible();
  await expect(time).toHaveAttribute("datetime", timestamp(2));
  await slider.press("Home");
  catalogueDown = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const status = scene.getByRole("status");
  await expect(status).toContainText("Showing the last available radar scans.");
  await expect(status.locator("time")).toHaveAttribute("datetime", timestamp(2));
  await expect(time).toHaveAttribute("datetime", timestamp(0));
  catalogueDown = false;
  await scene.getByRole("button", { name: "Retry NOAA" }).click();
  await expect(status).not.toContainText("Showing the last available radar scans.");
  await expect(time).toHaveAttribute("datetime", timestamp(0));
  await page.keyboard.press("Escape");
  await expect(scene).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await canvas.evaluate((element, original) => element === original, globe)).toBe(true);
});

test("Storm Radar returns to Explore with the same globe", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { empty: true, presentation: "fresh" });
  await page.route("**/radar_base_reflectivity_time/ImageServer/query?**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const canvas = page.locator("#globe-view canvas");
  const globe = await canvas.elementHandle();
  const trigger = page.getByRole("button", { name: "Storm Radar", exact: true });
  await trigger.click();
  const scene = page.getByRole("region", { name: "Storm Radar" });
  await expect(scene.getByRole("status")).toHaveText("No recent radar scans available.");
  await scene.getByRole("button", { name: "Back to Explore" }).click();
  await expect(scene).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "Globe", exact: true })).toBeVisible();
  expect(await canvas.evaluate((element, original) => element === original, globe)).toBe(true);
});
