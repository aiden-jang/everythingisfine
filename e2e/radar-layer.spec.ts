import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openLayer } from "./feeds";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
  "base64",
);
const camera = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe?: { state: () => { lon: number; lat: number; zoom: number }; morph: () => number };
      }
    ).__globe;
    return globe ? { ...globe.state(), morph: globe.morph() } : null;
  });
const marksVisible = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __events: { object: { parent: { visible: boolean }; geometry: { drawRange: { count: number } } } };
        }
      ).__events.object.parent.visible,
  );

for (const width of [1440, 390]) {
  test(`radar starts on in Explore and plays without moving the camera at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: width === 390 ? "reduce" : "no-preference" });
    await installFeeds(page, { presentation: "fresh", radar: "default" });
    await page.addInitScript(() => {
      const close = ImageBitmap.prototype.close;
      ImageBitmap.prototype.close = function () {
        if (this.width === 1024) {
          const root = document.documentElement;
          root.dataset["closedRadarFrames"] = String(Number(root.dataset["closedRadarFrames"] ?? 0) + 1);
        }
        close.call(this);
      };
    });
    let queries = 0;
    let unavailable = true;
    const now = Math.floor(Date.now() / 600_000) * 600_000;
    const times = [now - 1200_000, now - 600_000, now];
    await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) => {
      queries++;
      return unavailable
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            json: {
              host: "https://tilecache.rainviewer.com",
              radar: {
                past: times.map((at, index) => ({ time: at / 1000, path: `/v2/radar/frame${index}` })),
              },
            },
          });
    });
    await page.route("https://tilecache.rainviewer.com/**", (route) =>
      route.fulfill({ contentType: "image/png", body: pixel }),
    );
    await page.goto("/");
    await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
    await expect.poll(() => queries).toBe(1);
    await expect(page.locator("#radar-layer-controls")).toBeHidden();
    await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1);
    const originalCamera = await camera(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const layers = page.getByRole("region", { name: "Map layers", exact: true });
    const toggle = layers.getByRole("button", { name: "Storm radar", exact: true });
    const controls = layers.getByRole("region", { name: "Storm radar playback" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await openLayer(page, "Storm radar");
    const status = controls.getByRole("status", { name: "Radar status" });
    await expect(status).toHaveText("Couldn’t reach RainViewer radar.");
    expect(queries).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("eif.mapLayers"))).toBeNull();
    const feedToggle = page.getByRole("button", { name: /^Feed status,/ });
    const feedPanel = page.getByRole("region", { name: "Background feed status", exact: true });
    const radarFeed = feedPanel.getByRole("listitem").filter({ hasText: "RainViewer storm radar" });
    await expect(feedToggle).toHaveAccessibleName(/7(?: of |\/)8/);
    await feedToggle.click();
    await expect(radarFeed).toContainText("Couldn’t reach feed");
    await expect(radarFeed.locator("time")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    expect(await marksVisible(page)).toBe(true);
    expect(await camera(page)).toEqual(originalCamera);
    unavailable = false;
    await controls.getByRole("button", { name: "Retry RainViewer" }).click();
    await expect(status).toHaveCount(0);
    await expect(feedToggle).toHaveAccessibleName(/All feeds available|8\/8 available/);
    await feedToggle.click();
    await expect(radarFeed).toContainText("Available");
    await expect(radarFeed.locator("time")).toBeVisible();
    await page.keyboard.press("Escape");
    const time = controls.locator(".radar-clock time");
    await expect(time).toHaveAttribute("datetime", new Date(now).toISOString());
    const slider = controls.getByRole("slider", { name: "Radar scan time" });
    await slider.press("Home");
    await expect(time).toHaveAttribute("datetime", new Date(times[0]!).toISOString());
    await controls.getByRole("button", { name: "Play scans", exact: true }).click();
    await expect(controls.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(time).toHaveAttribute("datetime", new Date(now).toISOString());
    await expect(controls.getByRole("button", { name: "Play scans", exact: true })).toBeVisible();
    expect(await camera(page)).toEqual(originalCamera);
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect.poll(async () => (await camera(page))?.morph).toBe(1);
    const mapCamera = await camera(page);
    await slider.press("ArrowLeft");
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    expect(await marksVisible(page)).toBe(true);
    await page.getByRole("button", { name: "Back to layers", exact: true }).click();
    await expect(layers.getByRole("button", { name: "Earthquakes", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await openLayer(page, "Storm radar");
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/radar-layer-${width}.png` });
    expect((await new AxeBuilder({ page }).include(".map-layers").analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await layers.getByRole("button", { name: /Follow a radar region/ }).click();
    const guided = page.getByRole("region", { name: "Storm Radar", exact: true });
    await expect(guided.locator(".radar-clock time")).toHaveAttribute(
      "datetime",
      new Date(times[1]!).toISOString(),
    );
    await guided.getByRole("button", { name: "Back to radar layer", exact: true }).click();
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    await expect.poll(() => camera(page)).toEqual(mapCamera);
    await expect(page.locator("#open-explorer-radar")).toBeFocused();
    const closed = Number(await page.locator("html").getAttribute("data-closed-radar-frames"));
    await toggle.click();
    await expect(controls).toHaveCount(0);
    await expect(feedToggle).toHaveAccessibleName(/All feeds available|7\/7 available/);
    await feedToggle.click();
    await expect(radarFeed).toContainText("Off");
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => Number(await page.locator("html").getAttribute("data-closed-radar-frames")))
      .toBeGreaterThanOrEqual(closed + 3);
    const stoppedAt = queries;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => queries).toBe(stoppedAt);
    expect(await camera(page)).toEqual(mapCamera);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(queries).toBe(stoppedAt);
  });
}

test("the default radar layer stays off in the earthquake archive @dev", async ({ page }) => {
  await installFeeds(page, { radar: "default" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let requests = 0;
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) => {
    requests++;
    return route.fulfill({ json: { host: "https://tilecache.rainviewer.com", radar: { past: [] } } });
  });
  await page.goto("/#d=2011-03-11");
  await page.getByRole("button", { name: "Back to layers", exact: true }).click();
  const radar = page.getByRole("button", { name: "Storm radar", exact: true });
  await expect(radar).toBeDisabled();
  await expect(radar).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Storm radar playback" })).toHaveCount(0);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "back to live", exact: true }).click();
  await expect(radar).toHaveAttribute("aria-pressed", "true");
  await openLayer(page, "Storm radar");
  await expect(page.getByRole("status", { name: "Radar status" })).toHaveText(
    "No recent radar scans available.",
  );
  expect(requests).toBe(1);
});
