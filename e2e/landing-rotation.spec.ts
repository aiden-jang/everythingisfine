import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

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
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
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
          const button = document.querySelector<HTMLButtonElement>(".observatory-primary");
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
  await page.screenshot({ path: test.info().outputPath("landing-rotation-desktop.png") });
  await page.getByRole("button", { name: "Auto-rotate globe" }).click();
  await page.keyboard.press("Escape");
  await moving(page);
  const before = (await camera(page))!;
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
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
