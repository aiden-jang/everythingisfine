import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";
import type { Controls } from "../src/globe/controlsTypes";
import { ZOOM_MIN } from "../src/globe/framing";

const camera = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __globe?: { state: () => { lon: number; lat: number; zoom: number } } }
    ).__globe?.state(),
  );
async function moving(page: Page) {
  const before = (await camera(page))!.lon;
  await expect.poll(async () => (await camera(page))!.lon - before, { timeout: 20_000 }).toBeGreaterThan(0.3);
}
async function still(page: Page) {
  const sample = (await page.evaluate(() => {
    const globe = (window as unknown as { __globe: { state: () => unknown } }).__globe;
    const before = globe.state();
    return new Promise((resolve) => setTimeout(() => resolve({ before, after: globe.state() }), 1000));
  })) as { before: unknown; after: unknown };
  expect(sample.after).toEqual(sample.before);
}
async function open(page: Page, width = 1440, reduced = false, fragment = "") {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto(`/${fragment}`);
  await expect(page.getByRole("heading", { name: "Look closer." })).toBeVisible();
  await expect.poll(async () => (await camera(page))?.zoom, { timeout: 20_000 }).toBe(1);
}

test("entering Explore during arrival preserves the camera destination @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    type Camera = { state: () => { zoom: number }; step: (dt: number) => boolean };
    let camera: Camera | undefined;
    let opened = false;
    Object.defineProperty(window, "__globe", {
      configurable: true,
      get: () => camera,
      set: (next: Camera) => {
        camera = next;
        const step = next.step;
        next.step = (dt) => {
          const moving = step(dt);
          const zoom = next.state().zoom;
          const button = Array.from(
            document.querySelectorAll<HTMLButtonElement>(".observatory-entry-actions button"),
          ).find((action) => action.textContent?.trim() === "Explore the globe");
          if (!opened && zoom > 1.1 && zoom < 2 && button && !button.disabled) {
            opened = true;
            // Click after this frame publishes its pose, before another frame can finish arrival.
            queueMicrotask(() => {
              document.documentElement.dataset["exploredDuringArrival"] = String(zoom);
              button.click();
            });
          }
          return moving;
        };
      },
    });
  });
  await page.goto("/#at=145,12,1&v=observe");
  await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
  const interruptedAt = Number(await page.locator("html").getAttribute("data-explored-during-arrival"));
  expect(interruptedAt).toBeGreaterThan(1.1);
  expect(interruptedAt).toBeLessThan(2);
  await expect.poll(() => camera(page)).toEqual({ lon: 145, lat: 12, zoom: 1 });
});

test("the landing globe rotates, pauses, and hands the same camera to Explore @dev", async ({ page }) => {
  await open(page);
  await moving(page);
  const canvas = await page.locator("canvas").elementHandle();
  const url = page.url();
  await moving(page);
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByRole("button", { name: "Auto-rotate globe" }).click();
  await expect(page.getByRole("button", { name: "Auto-rotate globe" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await still(page);
  if (process.env["EIF_CAPTURE_UI"])
    await page.screenshot({ path: test.info().outputPath("landing-rotation-desktop.png") });
  await page.getByRole("button", { name: "Auto-rotate globe" }).click();
  await page.keyboard.press("Escape");
  await moving(page);
  const before = (await camera(page))!;
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
  await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
  expect(Math.abs((await camera(page))!.lon - before.lon)).toBeLessThan(3);
  await still(page);
});

test("steering on a phone pauses rotation then resumes after idle @dev", async ({ page }) => {
  await open(page, 390);
  await moving(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  await expect(async () => {
    await still(page);
  }).toPass({ timeout: 20_000 });
  await page.mouse.up();
  await moving(page);
});

test("keyboard steering pauses landing rotation then resumes after idle @dev", async ({ page }) => {
  await open(page, 390);
  await moving(page);
  await page.locator("#globe-view").focus();
  // Measure the short idle plateau in-page; driver round trips can outlast it on software WebGL.
  await page.evaluate(() => {
    const globe = (window as unknown as { __globe: { state: () => unknown } }).__globe;
    Object.assign(window, {
      rotationKeyRest: new Promise<boolean>((resolve) => {
        const onKey = (event: KeyboardEvent) => {
          if (event.key !== "ArrowLeft") return;
          document.removeEventListener("keydown", onKey);
          const started = performance.now();
          let resting = started;
          let previous = JSON.stringify(globe.state());
          const sample = () => {
            const now = performance.now();
            const current = JSON.stringify(globe.state());
            if (current !== previous) resting = now;
            previous = current;
            if (now - resting >= 1000) resolve(true);
            else if (now - started >= 20_000) resolve(false);
            else setTimeout(sample, 50);
          };
          setTimeout(sample, 50);
        };
        document.addEventListener("keydown", onKey);
      }),
    });
  });
  await page.keyboard.press("ArrowLeft");
  expect(
    await page.evaluate(() => (window as unknown as { rotationKeyRest: Promise<boolean> }).rotationKeyRest),
  ).toBe(true);
  await moving(page);
});

test("landing rotation respects reduced motion and hidden tabs @dev", async ({ page }) => {
  await open(page, 1440, true);
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  await still(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await moving(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await still(page);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await moving(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  await still(page);
});

test("a shared Observatory camera stays at the shared viewpoint @dev", async ({ page }) => {
  await open(page, 1440, false, "#at=145,12,1&p=globe&v=observe");
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  await still(page);
  expect(await camera(page)).toEqual({ lon: 145, lat: 12, zoom: 1 });
});

for (const [width, height] of [
  [1390, 685],
  [1920, 821],
  [844, 390],
  [390, 844],
] as const) {
  test(`zooming out keeps the whole landing globe in view at ${width}×${height} @dev`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: width === 1390 ? "no-preference" : "reduce" });
    await installFeeds(page, { presentation: "fresh" });
    await page.goto("/");
    await expect.poll(async () => (await camera(page))?.zoom).toBe(1);
    const center = () =>
      page.evaluate(() => {
        const globe = (window as unknown as { __globe: Controls }).__globe;
        const { lon, lat } = globe.state();
        return globe.project(lon, lat)!;
      });
    const clearEdges = ({ x, y }: { x: number; y: number }) =>
      page.evaluate(
        ({ x, y }) => {
          const globe = (window as unknown as { __globe: Controls }).__globe;
          return [
            globe.pick(0, y),
            globe.pick(innerWidth - 1, y),
            globe.pick(x, 0),
            globe.pick(x, innerHeight - 1),
          ];
        },
        { x, y },
      );
    const before = await center();
    expect(await clearEdges(before)).toEqual([null, null, null, null]);
    const canvas = (await page.locator("#globe-view").boundingBox())!;
    expect(canvas.x).toBeCloseTo(0, 0);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(width);
    expect(canvas.y).toBeGreaterThanOrEqual(0);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(height);
    if (width >= 900) {
      await page.mouse.move(before.x, before.y);
      await page.mouse.wheel(0, 1200);
    } else {
      await page.locator("#globe-view").focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press("-");
    }
    await expect.poll(async () => (await camera(page))?.zoom).toBe(ZOOM_MIN);
    const after = await center();
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    if (width > height) {
      expect(after.x).toBeGreaterThan(width * 0.6);
      expect(after.y).toBeLessThan(height * 0.65);
    } else {
      expect(after.y).toBeLessThan(height * 0.36);
    }
    expect(await clearEdges(after)).toEqual([null, null, null, null]);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: test.info().outputPath(`landing-zoomed-out-${width}.png`) });
  });
}

test.describe("landing marker inspection", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce" });
  const point = { lon: 145, lat: 12 };
  test.beforeEach(async ({ page }) => {
    const at = Date.now() - 12 * 60_000;
    await installFeeds(page, {
      presentation: "fresh",
      count: 0,
      usgs: [
        {
          id: "preview-sample",
          properties: {
            mag: 5.2,
            magType: "mw",
            place: "Observed offshore",
            time: at,
            updated: at,
            type: "earthquake",
            net: "us",
          },
          geometry: { type: "Point", coordinates: [point.lon, point.lat, 8] },
        },
      ],
    });
    await page.goto("/#at=145,12,1&p=globe&v=observe");
    await expect.poll(() => camera(page)).toEqual({ ...point, zoom: 1 });
  });

  test("landing markers preview a timestamp and open on the second tap @dev", async ({ page }) => {
    const globe = page.getByRole("button", { name: "Explore visible observations" });
    const label = page.locator("#globe-marker-preview");
    await expect(globe).toBeVisible();
    const markerPosition = () =>
      page.evaluate(({ lon, lat }) => {
        const debug = window as unknown as {
          __globe: Controls;
          __hitTest: (x: number, y: number) => string | null;
        };
        const p = debug.__globe.project(lon, lat);
        if (!p || !debug.__hitTest(p.x, p.y) || document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS")
          return null;
        return p;
      }, point);
    await expect.poll(markerPosition).not.toBeNull();
    const projected = (await markerPosition())!;
    await page.mouse.move(projected.x, projected.y);
    await expect(label).toContainText("Observed offshore");
    await expect(page.getByRole("tooltip")).toHaveAccessibleName(/Observed offshore.*UTC/);
    await expect(globe).toHaveAccessibleDescription(/Observed offshore.*UTC/);
    await page.mouse.move(0, 0);
    await expect(label).toBeEmpty();
    await page.touchscreen.tap(projected.x, projected.y);
    await expect(label).toContainText("Tap again to open");
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "observe");
    await page.touchscreen.tap(projected.x, projected.y);
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    await expect(label).toBeEmpty();
  });

  test("a keyboard visitor can dismiss and open a landing marker @dev", async ({ page }) => {
    const globe = page.getByRole("button", { name: "Explore visible observations" });
    const label = page.locator("#globe-marker-preview");
    await globe.focus();
    await expect
      .poll(async () => {
        await globe.press("ArrowRight");
        return label.textContent();
      })
      .toContain("Observed offshore");
    await globe.press("Escape");
    await expect(label).toBeEmpty();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(globe).toHaveAccessibleDescription(/Use the left and right arrows/);
    expect(await camera(page)).toEqual({ ...point, zoom: 1 });
    await globe.press("ArrowRight");
    await expect(label).toContainText("Observed offshore");
    await globe.press("Enter");
    await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
    await expect(page.locator("#globe-marker-preview")).toBeEmpty();
  });
});

test("crowded observations offer three choices without moving either projection @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const point = { lon: 145, lat: 12 };
  const places = ["North of Guam", "East of Guam", "South of Guam", "Offshore Guam"];
  await installFeeds(page, {
    presentation: "fresh",
    count: 0,
    usgs: places.map((place, index) => {
      const time = Date.now() - (index + 1) * 600_000;
      return {
        id: `crowd-${index}`,
        properties: { mag: 5.2, place, time, updated: time, magType: "mw", type: "earthquake", net: "us" },
        geometry: { type: "Point", coordinates: [145 + index * 0.05, 12, 8] },
      };
    }),
  });
  const world = page.locator("#globe-view");
  for (const projection of ["globe", "map"]) {
    await page.goto(
      `/?projection=${projection}#at=145,12,1&p=${projection}&v=${projection === "map" ? "explore" : "observe"}`,
    );
    await expect.poll(() => camera(page)).toEqual({ ...point, zoom: 1 });
    const position = () =>
      page.evaluate(({ lon, lat }) => {
        const debug = window as unknown as {
          __globe: Controls;
          __hitTest: (x: number, y: number) => string | null;
        };
        const p = debug.__globe.project(lon, lat);
        if (!p || !debug.__hitTest(p.x, p.y) || document.elementFromPoint(p.x, p.y)?.tagName !== "CANVAS")
          return null;
        return p;
      }, point);
    await expect.poll(position).not.toBeNull();
    const projected = (await position())!;
    await page.mouse.click(projected.x, projected.y);
    const picker = page.getByRole("group", { name: "Nearby observations" });
    const choices = picker.getByRole("button", { name: /M 5\.2.*Guam.*UTC/ });
    await expect(choices).toHaveCount(3);
    await expect(choices.first()).toBeFocused();
    await still(page);
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(projection === "map" ? world : world.locator("canvas")).toBeFocused();
    await page.mouse.click(projected.x, projected.y);
    await choices.nth(1).press("Enter");
    await expect(picker).toBeHidden();
    await expect(page.getByRole("heading", { name: /East of Guam/ }).first()).toBeVisible();
  }
});
