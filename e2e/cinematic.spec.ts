import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

test.use({
  video:
    process.env["EIF_CAPTURE_MOTION"] === "1" ? { mode: "on", size: { width: 960, height: 600 } } : "off",
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(
    `the cinematic arrival settles and scenes remain usable at ${width}px`,
    { tag: "@dev" },
    async ({ page }) => {
      await page.setViewportSize({ width: width!, height: height! });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await installFeeds(page, { presentation: "fresh" });
      await page.addInitScript(() => {
        type Camera = { state: () => { lon: number; lat: number; zoom: number } };
        let camera: Camera | undefined;
        Object.assign(window, { cinemaStart: null });
        Object.defineProperty(window, "__globe", {
          configurable: true,
          get: () => camera,
          set: (next: Camera) => {
            camera = next;
            queueMicrotask(() => Object.assign(window, { cinemaStart: next.state() }));
          },
        });
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
          errors.push(message.text());
      });
      await page.goto("/");
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { cinemaStart: unknown }).cinemaStart))
        .not.toBeNull();
      const from = await page.evaluate(
        () => (window as unknown as { cinemaStart: { lon: number; zoom: number } }).cinemaStart,
      );
      expect(from.lon).toBeCloseTo(77, 2);
      expect(from.zoom).toBeCloseTo(2.1, 2);
      await page.screenshot({ path: test.info().outputPath(`horizon-${width}.png`) });
      await page.waitForTimeout(700);
      await page.screenshot({ path: test.info().outputPath(`orbit-flight-${width}.png`) });
      const pose = () =>
        page.evaluate(() =>
          (
            window as unknown as { __globe: { state: () => { lon: number; lat: number; zoom: number } } }
          ).__globe.state(),
        );
      await expect.poll(async () => Math.abs((await pose()).lon - 145)).toBeLessThan(0.001);
      await expect.poll(async () => (await pose()).zoom).toBe(1);
      await page.screenshot({ path: test.info().outputPath(`orbit-arrived-${width}.png`) });
      await page.getByRole("button", { name: "After Dark", exact: true }).click();
      await expect(page.getByRole("heading", { name: "The other side of day." })).toBeVisible();
      await page.waitForTimeout(600);
      await page.screenshot({ path: test.info().outputPath(`night-flight-${width}.png`) });
      await page.getByRole("button", { name: "Below the Surface", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Beneath the surface." })).toBeVisible();
      const depthView = () =>
        page.evaluate(() => {
          const { __globe: globe } = window as unknown as {
            __globe: {
              state: () => { lon: number; lat: number };
              project: (lon: number, lat: number, radius?: number) => { y: number } | null;
              diveReady: () => boolean;
            };
          };
          const { lon, lat } = globe.state();
          const surface = globe.project(lon, lat);
          const deep = globe.project(lon, lat, 0.86);
          const height = document.querySelector("canvas")!.getBoundingClientRect().height;
          return {
            gap: surface && deep ? Math.abs(surface.y - deep.y) / height : 0,
            settled: globe.diveReady(),
          };
        });
      await expect.poll(async () => (await depthView()).settled).toBe(true);
      expect((await depthView()).gap).toBeGreaterThan(0.04);
      await page.waitForTimeout(1050);
      await page.screenshot({ path: test.info().outputPath(`depth-reveal-${width}.png`) });
      await page.getByRole("button", { name: "Explore the globe" }).click();
      await expect(page.locator("#chrome-rail")).toBeVisible();
      await page.getByRole("button", { name: "Everything Is Fine, back to the default view" }).click();
      await expect.poll(async () => (await pose()).zoom).toBeGreaterThan(1.2);
      await expect.poll(async () => (await pose()).lon).toBe(145);
      await expect.poll(async () => (await pose()).zoom).toBe(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const dive = page.getByRole("button", { name: "Below the Surface", exact: true });
      await dive.click();
      await expect(dive).toHaveAttribute("aria-pressed", "true");
      const reduced = await depthView();
      expect(reduced.settled).toBe(true);
      expect(reduced.gap).toBeGreaterThan(0.04);
      expect(errors).toEqual([]);
    },
  );
}
