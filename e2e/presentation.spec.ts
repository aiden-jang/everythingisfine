import { expect, test, type Page } from "@playwright/test";
import { openLayer, installFeeds, waitForData, saveImageButton } from "./feeds";

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
    await openLayer(page);
    const feeds = page
      .getByText("Earthquake display & sky guides", { exact: true })
      .filter({ visible: true });
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
    if (width < 768) await page.getByRole("button", { name: "Collapse panel", exact: true }).click();
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
    await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
    if (width < 1280) await expect(page.locator(".zone-panel")).toHaveCSS("position", "absolute");
    expect(errors).toEqual([]);
  });
}

async function openSceneEffects(page: Page, reduced = false): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page);
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const counter = { frames: 0, pending: new Set<number>() };
    Object.assign(window, { presentationFrames: counter });
    window.requestAnimationFrame = (callback) => {
      const id = request((at) => {
        counter.pending.delete(id);
        counter.frames += 1;
        callback(at);
      });
      counter.pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      counter.pending.delete(id);
      cancel(id);
    };
  });
  await page.goto("/");
  await waitForData(page);
  await openLayer(page);
  await page.getByText("Earthquake display & sky guides", { exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Constellations", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Regional cutaway", exact: true }).filter({ visible: true }).click();
  await page.getByText("Earthquake display & sky guides", { exact: true }).filter({ visible: true }).click();
  if (!reduced) await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
}

async function waitForRest(page: Page): Promise<void> {
  await expect(async () => {
    const sample = await page.evaluate(() => {
      const counter = (window as unknown as { presentationFrames: { frames: number; pending: Set<number> } })
        .presentationFrames;
      const before = counter.frames;
      // Driver round trips must not stretch the interval being measured.
      return new Promise<{ frames: number; pending: number }>((resolve) => {
        window.setTimeout(() => {
          resolve({ frames: counter.frames - before, pending: counter.pending.size });
        }, 500);
      });
    });
    expect(sample.frames, "the scene keeps drawing after settling").toBeLessThanOrEqual(2);
    // A stalled compositor can draw few frames while more work is still scheduled.
    expect(sample.pending, "the scene still has a frame scheduled").toBe(0);
  }).toPass({ timeout: 20_000 });
}

test("scene effects settle after pinning and zooming", async ({ page }) => {
  await openSceneEffects(page);
  await expect(page.locator(".pick-corners")).toHaveCSS("animation-name", "pin-settle");
  await page.mouse.move(950, 360);
  await page.mouse.wheel(0, -200);
  await waitForRest(page);
});

test("projection motion settles with an open cutaway", async ({ page }) => {
  await openSceneEffects(page, true);
  await page.mouse.move(950, 360);
  await page.mouse.wheel(0, -200);
  await waitForRest(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await waitForRest(page);
  await expect(page.locator(".cutaway-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Globe", exact: true }).click();
  await waitForRest(page);
  await expect(page.locator(".cutaway-note")).toBeVisible();
});

test("reduced motion skips decorative effects and preserves cutaway capture", async ({ page }) => {
  await openSceneEffects(page);
  await expect(page.locator(".pick-corners")).toHaveCSS("animation-name", "pin-settle");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pick-corners")).toHaveCSS("animation-name", "none");
  await expect(page.locator("[data-orbit-readout]")).toHaveCSS("transition-duration", "0s");
  await page.getByRole("button", { name: "Close", exact: true }).filter({ visible: true }).click();
  const image = page.waitForEvent("download");
  await (await saveImageButton(page)).click();
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
  await openLayer(page);
  await page.getByText("Earthquake display & sky guides", { exact: true }).filter({ visible: true }).click();
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
