import { expect, test, type Page } from "@playwright/test";
import { openLayer, installFeeds } from "./feeds";

const capture = process.env["EIF_CAPTURE_MOTION"] === "1";
test.use({ video: capture ? { mode: "on", size: { width: 960, height: 600 } } : "off" });

type Camera = {
  morph: () => number;
  state: () => { lon: number; lat: number; zoom: number };
};

const pose = (page: Page) =>
  page.evaluate(() => {
    const camera = (window as unknown as { __globe?: Camera }).__globe;
    return camera ? { ...camera.state(), morph: camera.morph() } : null;
  });

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`the atlas unfolds and curls back at ${width}px`, { tag: "@dev" }, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto("/");
    await openLayer(page);
    await expect.poll(async () => (await pose(page))?.morph).toBe(0);
    await expect(
      page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first(),
    ).toBeVisible({ timeout: 25_000 });
    const toggle = page.locator("#view-projection");
    await expect(toggle).toHaveText("Map");
    await expect(toggle).toHaveAttribute("aria-description", "Switch to map");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const before = (await pose(page))!;
    const globe = await page.locator("canvas").screenshot();

    await toggle.click();
    await expect(toggle).toHaveText("Globe");
    await expect(toggle).toHaveAttribute("aria-description", "Switch to globe");
    await expect.poll(() => pose(page)).toEqual({ ...before, morph: 1 });
    const flat = await page.locator("canvas").screenshot();
    expect(flat.equals(globe)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("eif.flat"))).toBe("1");
    if (width === 390) {
      const [ruler, credit] = await Promise.all([
        page.locator("[data-scale]").boundingBox(),
        page.locator(".creator-credit").boundingBox(),
      ]);
      expect(ruler!.y + ruler!.height).toBeLessThan(credit!.y);
    }
    if (capture) await page.screenshot({ path: test.info().outputPath(`atlas-${width}.png`) });

    await toggle.click();
    await expect.poll(() => pose(page)).toEqual(before);
    await expect(toggle).toHaveText("Map");
    expect(await page.evaluate(() => localStorage.getItem("eif.flat"))).toBe("0");

    const reversedAt = await page.evaluate(() => {
      const globe = (window as unknown as { __globe: Camera }).__globe;
      const toggle = document.querySelector<HTMLButtonElement>("#view-projection")!;
      toggle.click();
      return new Promise<number>((resolve) => {
        const reverse = (): void => {
          const t = globe.morph();
          if (t < 0.3) requestAnimationFrame(reverse);
          else {
            toggle.click();
            resolve(t);
          }
        };
        requestAnimationFrame(reverse);
      });
    });
    expect(reversedAt).toBeGreaterThan(0);
    expect(reversedAt).toBeLessThan(1);
    await expect.poll(() => pose(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem("eif.flat"))).toBe("0");
    expect(errors).toEqual([]);
  });
}
