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

test("the landing globe rotates, pauses, and hands the same camera to Explore @dev", async ({ page }) => {
  await open(page);
  await moving(page);
  const canvas = await page.locator("canvas").elementHandle();
  const url = page.url();
  await moving(page);
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Pause globe rotation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume globe rotation", exact: true })).toBeVisible();
  await still(page);
  await page.screenshot({ path: test.info().outputPath("landing-rotation-desktop.png") });
  await page.getByRole("button", { name: "Resume globe rotation", exact: true }).click();
  await moving(page);
  const before = (await camera(page))!;
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
  await expect(page.getByRole("button", { name: /globe rotation/ })).toHaveCount(0);
  expect(await canvas!.evaluate((node) => node === document.querySelector("canvas"))).toBe(true);
  expect(Math.abs((await camera(page))!.lon - before.lon)).toBeLessThan(3);
  await still(page);
});

test("steering on a phone pauses rotation and its control fits the stage @dev", async ({ page }) => {
  await open(page, 390);
  await moving(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const resume = page.getByRole("button", { name: "Resume globe rotation", exact: true });
  await expect(resume).toBeVisible();
  const button = (await resume.boundingBox())!;
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(button.x).toBeGreaterThanOrEqual(box.x);
  expect(button.x + button.width).toBeLessThanOrEqual(box.x + box.width);
  const readout = (await page.locator("[data-orbit-readout]").boundingBox())!;
  expect(readout.y).toBeGreaterThanOrEqual(button.y + button.height + 8);
  await page.screenshot({ path: test.info().outputPath("landing-rotation-phone.png") });
  await expect(async () => {
    await still(page);
  }).toPass({ timeout: 20_000 });
  await resume.click();
  await moving(page);
  await page.locator("#globe-view").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(resume).toBeVisible();
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
