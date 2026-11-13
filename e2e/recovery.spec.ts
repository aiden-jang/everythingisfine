import { expect, test } from "@playwright/test";
import { openLayer, installFeeds, waitForData } from "./feeds";

test("archived earthquakes stay visible and selectable through projection and zoom @dev", async ({
  page,
}) => {
  await installFeeds(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=explore&d=2011-03-11&p=map");
  await expect(page.getByText("2011-03-11 UTC · Full day", { exact: true })).toBeVisible();
  const drawn = () =>
    page.evaluate(
      () =>
        (window as unknown as { __events: { object: { geometry: { drawRange: { count: number } } } } })
          .__events?.object.geometry.drawRange.count ?? 0,
    );
  await expect.poll(drawn).toBeGreaterThan(0);
  for (const name of ["Globe", "Map"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __globe: { morph: () => number } }).__globe.morph()),
      )
      .toBe(name === "Map" ? 1 : 0);
    await expect.poll(drawn).toBeGreaterThan(0);
    await page.locator("#globe-view").focus();
    await page.keyboard.press("+");
    await expect.poll(drawn).toBeGreaterThan(0);
  }
  const point = await page.evaluate(() => {
    const world = window as unknown as {
      __feed: {
        store: {
          forEach: (fn: (quake: { key: string; primary: { lon: number; lat: number } }) => void) => void;
        };
      };
      __globe: { project: (lon: number, lat: number) => { x: number; y: number } | null };
      __hitTest: (x: number, y: number) => string | null;
    };
    let hit: { x: number; y: number } | null = null;
    world.__feed.store.forEach((q) => {
      const p = world.__globe.project(q.primary.lon, q.primary.lat);
      if (
        !hit &&
        p &&
        document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS" &&
        world.__hitTest(p.x, p.y) === q.key
      )
        hit = p;
    });
    return hit;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator("#globe-view .bg-raised")).toHaveCSS("opacity", "1");
  await page.mouse.click(point!.x, point!.y);
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await page.getByRole("slider", { name: "Time in the window", exact: true }).press("Home");
  await expect
    .poll(() =>
      page.evaluate(() => {
        type Q = { key: string; primary: { lon: number; lat: number; time: number } };
        const world = window as unknown as {
          __feed: { store: { forEach: (fn: (q: Q) => void) => void; get: (id: string) => Q } };
          __globe: { project: (lon: number, lat: number) => { x: number; y: number } | null };
          __hitTest: (x: number, y: number) => string | null;
        };
        let invisibleHits = 0;
        world.__feed.store.forEach((q) => {
          const at = world.__globe.project(q.primary.lon, q.primary.lat);
          const hit = at ? world.__hitTest(at.x, at.y) : null;
          if (hit && world.__feed.store.get(hit).primary.time > Date.parse("2011-03-11T00:00:00Z"))
            invisibleHits++;
        });
        return invisibleHits;
      }),
    )
    .toBe(0);
  await page.getByRole("button", { name: "back to live", exact: true }).click();
  await expect.poll(drawn).toBeGreaterThan(0);
});

test("a lost graphics context restores the same scene and view @dev", async ({ page }) => {
  await installFeeds(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#v=explore&p=map&at=175,25,2&layers=earthquakes,fires");
  await waitForData(page);
  const canvas = page.locator("#globe-view canvas");
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __globe?: { morph: () => number } }).__globe?.morph()),
    )
    .toBe(1);
  const before = await canvas.elementHandle();
  const lose = await canvas.evaluate((node) => {
    const context = (node as HTMLCanvasElement).getContext("webgl2")!;
    const extension = context.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lose).toBe(true);
  await expect(page.getByText("The globe’s graphics were interrupted.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try the globe again", exact: true }).click();
  await expect(page.getByText("The globe’s graphics were interrupted.", { exact: true })).toBeHidden();
  expect(await before!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __globe: { state: () => { lon: number; lat: number; zoom: number }; morph: () => number };
        }
      ).__globe.state(),
    ),
  ).toMatchObject({ lon: 175, lat: 25, zoom: 2 });
  const layers = page.getByRole("region", { name: "Map layers", exact: true });
  await expect(layers.getByRole("button", { name: "Wildfires", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(layers.getByRole("button", { name: "Floods", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("WebGL failure leaves events usable and can recover", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
    (window as unknown as { restoreGraphics: () => void }).restoreGraphics = () => {
      HTMLCanvasElement.prototype.getContext = original;
    };
  });
  await installFeeds(page);
  await page.goto("/");
  await expect(page.getByText("The globe could not start.", { exact: true })).toBeVisible();
  await waitForData(page);
  await openLayer(page);
  const event = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first();
  await expect(event).toBeVisible();
  await event.click();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreGraphics: () => void }).restoreGraphics());
  await page.getByRole("button", { name: "Try the globe again", exact: true }).click();
  await expect(page.getByText("The globe could not start.", { exact: true })).toBeHidden();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("an archive response cannot undo returning to live", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await openLayer(page);
  await page.getByLabel("Open archive date", { exact: true }).fill("2011-03-11");
  await page.getByRole("button", { name: "Open date", exact: true }).click();
  await expect(page.getByText("2011-03-11 UTC · Full day", { exact: true })).toBeVisible();
  await page.getByRole("slider", { name: "Time in the window", exact: true }).press("Home");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  let released = 0;
  let aborted = 0;
  const nextDay = (url: string) => new URL(url).searchParams.get("starttime")?.startsWith("2011-03-10");
  page.on("requestfailed", (request) => {
    if (nextDay(request.url())) aborted += 1;
  });
  await page.route(/fdsnws\/event\/1\/query/, async (route) => {
    if (!nextDay(route.request().url())) return route.fallback();
    arrived += 1;
    await barrier;
    released += 1;
    await route.fallback();
  });
  await page.getByRole("button", { name: "‹ 2011-03-10", exact: true }).click();
  // Hold both agency requests until returning to live cancels the whole archive load.
  try {
    await expect.poll(() => arrived).toBe(2);
    await page.getByRole("button", { name: "back to live", exact: true }).click();
    await expect.poll(() => aborted).toBe(2);
  } finally {
    release();
  }
  await expect.poll(() => released).toBe(2);
  await waitForData(page);
  await expect(page.getByRole("button", { name: "back to live", exact: true })).toBeHidden();
  await expect(page.getByLabel("Open archive date", { exact: true })).toHaveValue("");
  await expect(page.getByRole("slider", { name: "Time in the window", exact: true })).toHaveValue("1000");
  await expect(page.locator(".stamp").getByText("2011-03-11 UTC · Full day", { exact: true })).toBeHidden();
});

test("the shared URL follows a held cursor and returning to live", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  const cursor = page.getByRole("slider", { name: "Time in the window", exact: true });
  await cursor.press("Home");
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).has("c")).toBe(true);
  await cursor.press("End");
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).has("c")).toBe(false);
});
