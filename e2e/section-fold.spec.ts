import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

const capture = process.env["EIF_CAPTURE_MOTION"] === "1";
test.use({ video: capture ? { mode: "on", size: { width: 960, height: 600 } } : "off" });

test("the drawn line becomes the depth chart hinge", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { count: 400 });
  await page.addInitScript(() => {
    localStorage.setItem("eif.flat", "1");
    const hinges: { from: [number, number]; to: [number, number] }[] = [];
    Object.assign(window, { sectionHinges: hinges });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.matches("[data-section-panel]") && Array.isArray(frames)) {
        const plot = this.querySelector("svg")!.getBoundingClientRect();
        const matrix = new DOMMatrix(String(frames[0]?.transform));
        const point = (x: number): [number, number] => {
          const p = new DOMPoint(x, 0).matrixTransform(matrix);
          return [plot.left + p.x / p.w, plot.top + p.y / p.w];
        };
        hinges.push({ from: point(0), to: point(plot.width) });
      }
      return animate.call(this, frames, options);
    };
  });
  await page.goto("/#at=140,36,2.6&m=2&w=24");
  await waitForData(page);
  await expect(page.locator("[data-scale]")).toHaveCSS("opacity", "1");
  const canvas = (await page.locator("canvas").boundingBox())!;
  const from = [
    Math.round(canvas.x + canvas.width / 2 - 200),
    Math.round(canvas.y + canvas.height * 0.42 + 100),
  ] as const;
  const to = [from[0] + 400, from[1] - 180] as const;
  const draw = async (start: readonly [number, number], end: readonly [number, number]): Promise<void> => {
    await page.keyboard.down("Shift");
    await page.mouse.move(...start);
    await page.mouse.down();
    await page.mouse.move(...end, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  const hinges = () =>
    page.evaluate(
      () =>
        (window as unknown as { sectionHinges: { from: [number, number]; to: [number, number] }[] })
          .sectionHinges,
    );
  await draw(from, to);
  const panel = page.locator("[data-section-panel]");
  await expect(panel.getByText("Cross-section", { exact: true })).toBeVisible();
  await expect.poll(hinges).toHaveLength(1);
  const [actual] = await hinges();
  for (const index of [0, 1] as const) {
    expect(actual!.from[index]).toBeCloseTo(from[index], 0);
    expect(actual!.to[index]).toBeCloseTo(to[index], 0);
  }
  await expect(panel).toHaveCSS("transform", "none");
  if (capture) {
    await page.screenshot({ path: test.info().outputPath("section-open.png") });
    await page.waitForTimeout(600);
  }

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const compact = (await page.locator("canvas").boundingBox())!;
  const x = compact.x + compact.width / 2;
  const y = compact.y + compact.height * 0.42;
  await draw([x - 95, y + 45], [x + 95, y - 45]);
  await expect(panel.getByText("Cross-section", { exact: true })).toBeVisible();
  expect(await hinges()).toHaveLength(1);
  await expect(panel).toHaveCSS("transform", "none");
  if (capture) await page.screenshot({ path: test.info().outputPath("section-phone.png") });
});
