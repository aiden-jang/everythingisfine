import { expect, test } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

for (const width of [1440, 390, 320]) {
  test(`regional inspection stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto("/");
    await waitForData(page);
    const feeds = page.getByText("Feeds and layers", { exact: true }).filter({ visible: true });
    await feeds.click();
    const cutaway = page
      .getByRole("button", { name: "Regional cutaway", exact: true })
      .filter({ visible: true });
    await cutaway.click();
    await expect(cutaway).toHaveAttribute("aria-pressed", "true");
    const note = page.getByRole("status").filter({ hasText: "Regional cutaway" });
    await expect(note).toContainText("true scale");
    const anchored = await note.textContent();
    const caption = await note.boundingBox();
    const header = await page.locator("#chrome-head").boundingBox();
    expect(caption!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(caption!.x + caption!.width).toBeLessThanOrEqual(width);
    await feeds.click();
    if (width < 768) await page.getByRole("button", { name: "Expand globe", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`cutaway-${width}.png`) });
    await page.locator("body").click({ position: { x: width - 20, y: 140 } });
    await page.keyboard.press("ArrowRight");
    const readout = page.locator("[data-orbit-readout]");
    await expect(readout).toHaveAttribute("data-visible", "true");
    await expect(readout).toContainText("°");
    await expect(note).toHaveText(anchored!);
    await expect(readout).toHaveAttribute("data-visible", "false");
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(note).toHaveCount(0);
    await page.getByRole("button", { name: "Globe", exact: true }).click();
    await expect(note).toHaveText(anchored!);
    await feeds.click();
    await page
      .getByRole("button", { name: "Place markers at depth", exact: true })
      .filter({ visible: true })
      .click();
    await expect(note).toHaveCount(0);
    await expect(cutaway).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await feeds.click();
    if (width < 768) await page.getByRole("button", { name: "Recent earthquakes", exact: true }).click();
    await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
    if (width < 1280) await expect(page.locator(".zone-panel")).toHaveCSS("position", "absolute");
    expect(errors).toEqual([]);
  });
}

test("scene effects settle and skip decorative motion when requested", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    const counter = { frames: 0 };
    Object.assign(window, { presentationFrames: counter });
    window.requestAnimationFrame = (callback) =>
      original((at) => {
        counter.frames += 1;
        callback(at);
      });
  });
  await page.goto("/");
  await waitForData(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByText("Feeds and layers", { exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Constellations", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Regional cutaway", exact: true }).filter({ visible: true }).click();
  await page.getByText("Feeds and layers", { exact: true }).filter({ visible: true }).click();
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  await expect(page.locator(".pick-corners")).toHaveCSS("animation-name", "pin-settle");
  await page.mouse.move(950, 360);
  await page.mouse.wheel(0, -200);
  await page.screenshot({ path: test.info().outputPath("presentation-motion.png") });
  const frames = () =>
    page.evaluate(
      () => (window as unknown as { presentationFrames: { frames: number } }).presentationFrames.frames,
    );
  const waitForRest = async (): Promise<void> => {
    await expect
      .poll(
        async () => {
          const before = await frames();
          await page.waitForTimeout(500);
          return (await frames()) - before;
        },
        { timeout: 20_000 },
      )
      .toBeLessThanOrEqual(2);
  };
  await waitForRest();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await waitForRest();
  await expect(page.locator(".cutaway-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Globe", exact: true }).click();
  await waitForRest();
  await expect(page.locator(".cutaway-note")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pick-corners")).toHaveCSS("animation-name", "none");
  await expect(page.locator("[data-orbit-readout]")).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "Close", exact: true }).filter({ visible: true }).click();
  const image = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save image", exact: true }).click();
  const capture = await image;
  expect(capture.suggestedFilename()).toMatch(/^everything-is-fine-.*\.png$/);
  expect(await capture.failure()).toBeNull();
  await capture.saveAs(test.info().outputPath("cutaway-still.png"));
});

test("switching the historical depth layer off removes its markers @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);
  await page.getByText("Feeds and layers", { exact: true }).filter({ visible: true }).click();
  const layer = () =>
    page.evaluate(() => {
      const slab = (
        window as unknown as {
          __slab: {
            object: { visible: boolean; geometry: { attributes: { position?: { count: number } } } };
          };
        }
      ).__slab.object;
      return { visible: slab.visible, points: slab.geometry.attributes.position?.count ?? 0 };
    });
  const toggle = page
    .getByRole("button", { name: "Historical deep earthquakes", exact: true })
    .filter({ visible: true });
  await toggle.click();
  await expect.poll(layer).toMatchObject({ visible: true });
  expect((await layer()).points).toBeGreaterThan(1000);
  await toggle.click();
  await expect.poll(layer).toMatchObject({ visible: false });
  await page.locator("body").click({ position: { x: 1000, y: 200 } });
  const beforeOrbit = page.url();
  await page.keyboard.press("ArrowRight");
  await expect(page).not.toHaveURL(beforeOrbit);
  expect((await layer()).visible).toBe(false);
});
