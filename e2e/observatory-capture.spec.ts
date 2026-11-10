import { expect, test } from "@playwright/test";
import { installFeeds } from "./feeds";

type Captured = { lines: string[]; size: number; type: string };

test("the featured lunar journey keeps its canvas and saves its own scientific caption", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    const result: Captured = { lines: [], size: 0, type: "" };
    (window as unknown as { captured: Captured }).captured = result;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
      if (this.canvas.width === 1200 && this.canvas.height === 1200) result.lines.push(args[0]);
      Reflect.apply(fill, this, args);
    };
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: { files?: File[] }) => {
        result.size = data.files?.[0]?.size ?? 0;
        result.type = data.files?.[0]?.type ?? "";
        return Promise.resolve();
      },
    });
  });
  await page.goto("/");
  const canvas = page.locator("#globe-view canvas");
  const original = await canvas.elementHandle();
  await page.getByRole("button", { name: "Moonfall", exact: true }).click();
  const moon = page.locator("#observatory-intro");
  await expect(page.getByRole("group", { name: "Lunar view" })).toContainText("Taurus–Littrow Valley");
  await expect(moon).toHaveRole("region");
  await expect(moon).toHaveAccessibleName("Moonfall");
  await moon.getByLabel("Rover traverse").selectOption("1");
  await moon.getByRole("slider", { name: "Mapped distance" }).press("End");
  await page.getByRole("button", { name: "Save image", exact: true }).click();
  const result = await page.evaluate(() => (window as unknown as { captured: Captured }).captured);
  expect(result.type).toBe("image/png");
  expect(result.size).toBeGreaterThan(20_000);
  expect(result.lines).toContain("Moonfall");
  expect(result.lines).toContain("Apollo 17 · December 1972 · Traverse 2");
  expect(result.lines.join(" ")).toContain("LRO / USGS terrain");
  expect(result.lines.join(" ")).not.toMatch(/earthquakes|magnitude|Live ·/);
  await moon.getByRole("button", { name: "Back to Live Earth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Moonfall", exact: true })).toBeFocused();
  expect(await canvas.evaluate((element, previous) => element === previous, original)).toBe(true);
});
