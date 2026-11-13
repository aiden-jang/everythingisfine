import type { Object3D } from "three";
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

async function prepareRadar(page: Page, width: number, unavailable = true) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: width === 390 ? "reduce" : "no-preference" });
  await installFeeds(page, { presentation: "fresh", radar: "default" });
  await page.addInitScript(() => {
    const create = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args: Parameters<typeof createImageBitmap>) => {
      const source = args[0];
      if (
        source instanceof HTMLCanvasElement &&
        source.width === 1024 &&
        document.documentElement.dataset["holdRadarImages"] === "true"
      )
        await new Promise<void>((resolve) =>
          window.addEventListener("release-radar-images", () => resolve(), { once: true }),
        );
      return create(...args);
    };
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
  return {
    times,
    now,
    queries: () => queries,
    recover: () => {
      unavailable = false;
    },
  };
}

for (const width of [1440, 390]) {
  test(`radar starts on in Explore and plays without moving the camera at ${width}px @dev`, async ({
    page,
  }) => {
    const { times, now, queries, recover } = await prepareRadar(page, width);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
    await expect.poll(queries).toBe(1);
    await expect(page.locator("#radar-layer-controls")).toBeHidden();
    await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1);
    const originalCamera = await camera(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const layers = page.getByRole("region", { name: "Map layers", exact: true });
    const toggle = layers.getByRole("button", { name: "Storm radar", exact: true });
    const controls = layers.getByRole("region", { name: "Storm radar playback" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(controls).toBeVisible();
    await expect(controls).toHaveAttribute("data-compact", "true");
    const player = await controls.elementHandle();
    await openLayer(page, "Storm radar");
    expect(await controls.evaluate((node, original) => node === original, player)).toBe(true);
    await expect(controls).not.toHaveAttribute("data-compact", "true");
    const status = controls.getByRole("status", { name: "Radar status" });
    await expect(status).toHaveText("Couldn’t reach RainViewer radar.");
    expect(queries()).toBe(1);
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
    recover();
    await controls.getByRole("button", { name: "Retry RainViewer" }).click();
    await expect(status).toHaveCount(0);
    await expect(feedToggle).toHaveAccessibleName(/All feeds available|8\/8 available/);
    await feedToggle.click();
    await expect(radarFeed).toContainText("Available");
    await expect(radarFeed.locator("time")).toBeVisible();
    await page.keyboard.press("Escape");
    const time = controls.locator(".radar-clock time");
    await expect(time).toHaveAttribute("datetime", new Date(now).toISOString());
    if (width === 390) {
      expect((await page.locator(".layer-readout").boundingBox())!.height).toBeLessThanOrEqual(44);
      await page.getByRole("button", { name: "Sources & times", exact: true }).click();
      const reading = page.getByRole("group", { name: "Weather layer times" }).locator("time");
      await expect(reading).toBeVisible();
      await expect(reading).toHaveAttribute("datetime", new Date(now).toISOString());
      await page.keyboard.press("Escape");
    }
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
    const stoppedAt = queries();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(queries).toBe(stoppedAt);
    expect(await camera(page)).toEqual(mapCamera);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(queries()).toBe(stoppedAt);
  });

  test(`radar detours preserve the selected scan, camera and return focus at ${width}px @dev`, async ({
    page,
  }) => {
    const { times } = await prepareRadar(page, width, false);
    await page.goto("/#v=explore&at=15,25,1");
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const layers = page.getByRole("region", { name: "Map layers", exact: true });
    await openLayer(page, "Storm radar");
    const controls = layers.getByRole("region", { name: "Storm radar playback" });
    const time = controls.locator(".radar-clock time");
    await expect(time).toHaveAttribute("datetime", new Date(times[2]!).toISOString());
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect.poll(async () => (await camera(page))?.morph).toBe(1);
    const mapCamera = await camera(page);
    await controls.getByRole("slider", { name: "Radar scan time" }).press("ArrowLeft");
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    await page.evaluate(() => (document.documentElement.dataset["holdRadarImages"] = "true"));
    await layers.getByRole("button", { name: /Follow a radar region/ }).click();
    const guided = page.getByRole("region", { name: "Storm Radar", exact: true });
    await expect(guided.locator(".radar-clock time")).toHaveAttribute(
      "datetime",
      new Date(times[1]!).toISOString(),
    );
    await expect(guided.getByRole("status", { name: "Radar status" })).toHaveText(
      "Loading the selected scan…",
    );
    await guided.getByRole("button", { name: "Back to radar layer", exact: true }).click();
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());
    await page.evaluate(() => {
      delete document.documentElement.dataset["holdRadarImages"];
      window.dispatchEvent(new Event("release-radar-images"));
    });
    await expect.poll(() => camera(page)).toEqual(mapCamera);
    await expect(page.locator("#open-explorer-radar")).toBeFocused();
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    await page.getByRole("button", { name: "Storm Radar", exact: true }).click();
    await expect(guided.locator(".radar-clock time")).toHaveAttribute(
      "datetime",
      new Date(times[1]!).toISOString(),
    );
    await expect(guided.getByRole("button", { name: "Map", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await guided.getByRole("button", { name: "Back to stories", exact: true }).click();
    await expect(page.getByRole("button", { name: "Storm Radar", exact: true })).toBeFocused();
    await expect.poll(() => camera(page)).toEqual(mapCamera);
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await expect(time).toHaveAttribute("datetime", new Date(times[1]!).toISOString());

    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
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

for (const width of [1440, 390]) {
  test(`story browsing hides layers and restores the held layer view at ${width}px @dev`, async ({
    page,
  }) => {
    const { queries } = await prepareRadar(page, width, false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/#v=explore&at=15,25,1.5${width === 390 ? "&p=map" : ""}`);
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1.5);
    const pose = await camera(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    const layers = page.getByRole("tabpanel", { name: "Layers", exact: true });
    await layers.getByRole("button", { name: "Wildfires", exact: true }).click();
    const preferences = await page.evaluate(() => localStorage.getItem("eif.mapLayers"));
    const controls = page.getByRole("region", { name: "Storm radar playback", includeHidden: true });
    await expect(controls.locator(".radar-warning")).toHaveCount(0);
    await expect(controls.getByRole("slider", { name: "Radar scan time" })).toBeEnabled();
    await controls.getByRole("slider", { name: "Radar scan time" }).press("ArrowLeft");
    const held = await controls.locator("time").getAttribute("datetime");
    const player = await controls.elementHandle();
    const counts = () =>
      page.evaluate(() => {
        const world = window as unknown as {
          __events: { object: Object3D & { geometry: { drawRange: { count: number } } } };
          __marks: () => { id: string }[];
        };
        let root = world.__events.object as Object3D;
        while (root.parent) root = root.parent;
        return {
          radar: root.getObjectByName("storm-radar")?.visible ?? false,
          quakes: world.__events.object.geometry.drawRange.count,
          hazards: world.__marks().filter(({ id }) => /^(cyclone|fire|flood|volcano):/.test(id)).length,
        };
      });
    await expect.poll(async () => (await counts()).radar).toBe(true);
    await expect.poll(async () => (await counts()).quakes).toBeGreaterThan(0);
    await expect.poll(async () => (await counts()).hazards).toBeGreaterThan(0);
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    await expect.poll(counts).toEqual({ radar: false, quakes: 0, hazards: 0 });
    await expect(page.locator(".layer-readout")).toHaveCount(0);
    expect(await controls.evaluate((node, original) => node === original, player)).toBe(true);
    expect(queries()).toBe(1);
    await page.getByRole("button", { name: width === 390 ? "Globe" : "Map", exact: true }).click();
    await page.evaluate(() =>
      (
        window as unknown as { __globe: { flyTo: (lon: number, lat: number, zoom: number) => void } }
      ).__globe.flyTo(80, -20, 2),
    );
    await expect.poll(async () => (await camera(page))?.lon).toBe(80);
    const storiesTab = page.getByRole("tab", { name: "Stories", exact: true });
    await storiesTab.focus();
    await storiesTab.press("ArrowLeft");
    await expect.poll(() => camera(page)).toEqual(pose);
    await expect(controls.locator("time")).toHaveAttribute("datetime", held!);
    await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect.poll(async () => (await counts()).radar).toBe(true);
    await expect.poll(async () => (await counts()).quakes).toBeGreaterThan(0);
    await expect.poll(async () => (await counts()).hazards).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem("eif.mapLayers"))).toEqual(preferences);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    await controls.getByRole("button", { name: "Play scans", exact: true }).click();
    await page.getByRole("tab", { name: "Stories", exact: true }).click();
    const pausedAt = await controls.locator("time").getAttribute("datetime");
    await page.waitForTimeout(1200);
    expect(await controls.locator("time").getAttribute("datetime")).toBe(pausedAt);
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await expect(controls.locator("time")).not.toHaveAttribute("datetime", pausedAt!);
  });
}
