import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

const now = Date.parse("2026-11-12T04:00:00Z");

test.beforeEach(async ({ page }) => {
  // Keep the starting hemisphere sunlit: these checks measure clipping, not changing day/night shading.
  await page.clock.setFixedTime(new Date(now));
});

test("records the existing globe with a source caption and releases the downloadable video", async ({
  page,
}) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", now });
  await page.addInitScript(() => {
    const lines: string[] = [];
    Object.assign(window, { clipLines: lines });
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
      if (this.canvas.width === 720) lines.push(args[0]);
      Reflect.apply(fill, this, args);
    };
  });
  await page.goto("/");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record 10-second clip" })).toBeEnabled();
  await page.getByRole("button", { name: "Record 10-second clip" }).click();
  const panel = page.getByRole("region", { name: "Video clip" });
  await expect(panel.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect(panel).toContainText("Clip ready");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const video = panel.locator("video");
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
    .toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((node: HTMLVideoElement) => [node.videoWidth, node.videoHeight])).toEqual([
    720, 720,
  ]);
  const pixels = await video.evaluate((node: HTMLVideoElement) => {
    const c = document.createElement("canvas");
    c.width = c.height = 720;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(node, 0, 0);
    // Exclude the caption: a blank globe with readable text must still fail.
    const p = ctx.getImageData(0, 0, 720, 640).data;
    let bright = 0;
    for (let i = 0; i < p.length; i += 4) if (p[i]! > 80 && p[i + 1]! > 80 && p[i + 2]! > 80) bright++;
    return bright;
  });
  expect(pixels).toBeGreaterThan(1000);
  const lines = await page.evaluate(() => (window as unknown as { clipLines: string[] }).clipLines.join(" "));
  expect(lines).toContain("UTC");
  expect(lines).toContain("USGS");
  expect(lines).toContain("localhost");
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download clip" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  const url = await video.getAttribute("src");
  await panel.getByRole("button", { name: "Dismiss clip" }).click();
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!);
        return true;
      } catch {
        return false;
      }
    }, url),
  ).toBe(false);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
});

test("unsupported browsers preserve the image fallback", async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", now });
  await page.addInitScript(() => Object.defineProperty(window, "MediaRecorder", { value: undefined }));
  await page.goto("/");
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record 10-second clip" })).toBeDisabled();
  await expect(
    page.getByText("Video recording is unavailable in this browser. Save image still works."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save image", exact: true })).toBeEnabled();
  const menu = page.getByRole("region", { name: "View options", exact: true });
  const bounds = await menu.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(375);
  await menu.getByRole("link", { name: "Terms", exact: true }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole("link", { name: "Terms", exact: true })).toBeInViewport();
});

test("the mobile recording notice leaves the visible globe intact", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", now });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  const lowerGlobePixels = async () => {
    // This strip is below the notice and above the HUD, where an ordinary overlay cropped WebGL.
    const screenshot = await page.screenshot();
    return page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(100, 325, 180, 50).data;
      let earth = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1]! > 35 && pixels[i + 2]! > 50) earth++;
      }
      return earth;
    }, screenshot.toString("base64"));
  };
  const before = await lowerGlobePixels();
  expect(before).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByRole("button", { name: "Record 10-second clip" }).click();
  const panel = page.getByRole("region", { name: "Video clip" });
  await expect(panel.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await panel.getByRole("button", { name: "Cancel recording" }).click();
  await expect(panel).toContainText("Recording cancelled.");
  expect(await lowerGlobePixels()).toBeGreaterThan(before * 0.8);
  await panel.getByRole("button", { name: "Dismiss clip" }).click();
  await expect(page.getByRole("button", { name: "View options", exact: true })).toBeFocused();
});
