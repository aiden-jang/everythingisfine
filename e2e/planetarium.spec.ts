import { expect, test, type Page } from "@playwright/test";
import { installFeeds } from "./feeds";

test.use({
  video:
    process.env["EIF_CAPTURE_MOTION"] === "1" ? { mode: "on", size: { width: 960, height: 600 } } : "off",
});

const earthPosition = (page: Page) =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe: {
          state: () => { lon: number; lat: number; zoom: number };
          project: (lon: number, lat: number) => { x: number; y: number } | null;
          skyReady: () => boolean;
        };
      }
    ).__globe;
    const at = globe.state(),
      point = globe.project(at.lon, at.lat);
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    return { y: point ? (point.y - rect.top) / rect.height : -1, ready: globe.skyReady() };
  });

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(
    `After Dark opens a planetarium and returns Earth to the frame at ${width}px`,
    { tag: "@dev" },
    async ({ page }) => {
      await page.setViewportSize({ width: width!, height: height! });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installFeeds(page, { presentation: "fresh" });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
          errors.push(message.text());
      });
      await page.goto("/");
      await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("button", { name: "After Dark", exact: true }).click();
      await expect.poll(async () => (await earthPosition(page)).y).toBeGreaterThan(0.98);
      await expect.poll(async () => (await earthPosition(page)).ready).toBe(true);
      await page.waitForTimeout(1100);
      await page.screenshot({ path: test.info().outputPath(`planetarium-${width}.png`) });
      await page.getByRole("button", { name: "Live Earth", exact: true }).click();
      await expect.poll(async () => Math.abs((await earthPosition(page)).y - 0.5)).toBeLessThan(0.01);
      await page.screenshot({ path: test.info().outputPath(`earth-return-${width}.png`) });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "After Dark", exact: true }).click();
      expect((await earthPosition(page)).y).toBeGreaterThan(0.98);
      expect((await earthPosition(page)).ready).toBe(true);
      await page.getByRole("button", { name: "Explore the globe" }).click();
      await expect.poll(async () => Math.abs((await earthPosition(page)).y - 0.5)).toBeLessThan(0.01);
      await expect(page.locator("#chrome-rail")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("eif.figures"))).toBeNull();
      expect(errors).toEqual([]);
    },
  );
}

test("the reveal survives a saved map and restores its flat framing", { tag: "@dev" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    localStorage.setItem("eif.flat", "1");
    localStorage.setItem("eif.figures", "0");
  });
  await page.goto("/");
  const morph = () =>
    page.evaluate(() => (window as unknown as { __globe?: { morph: () => number } }).__globe?.morph());
  await expect.poll(morph).toBe(1);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Everything Is Fine, back to the default view" }).click();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect.poll(morph).toBe(0);
  await expect.poll(async () => (await earthPosition(page)).y).toBeGreaterThan(0.98);
  await expect.poll(async () => (await earthPosition(page)).ready).toBe(true);
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect.poll(morph).toBe(1);
  expect((await earthPosition(page)).ready).toBe(true);
  expect(
    await page.evaluate(() => [localStorage.getItem("eif.flat"), localStorage.getItem("eif.figures")]),
  ).toEqual(["1", "0"]);
});
