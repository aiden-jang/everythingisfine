import { expect, test } from "@playwright/test";
import { installFeeds, openStories } from "./feeds";

test("revisiting different stories releases replaced graphics resources @dev", async ({ page }) => {
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const buffers = new Set<WebGLBuffer>();
    const textures = new Set<WebGLTexture>();
    const proto = WebGL2RenderingContext.prototype;
    const makeBuffer = proto.createBuffer,
      deleteBuffer = proto.deleteBuffer;
    const makeTexture = proto.createTexture,
      deleteTexture = proto.deleteTexture;
    proto.createBuffer = function () {
      const value = makeBuffer.call(this);
      if (value) buffers.add(value);
      return value;
    };
    proto.deleteBuffer = function (value) {
      if (value) buffers.delete(value);
      deleteBuffer.call(this, value);
    };
    proto.createTexture = function () {
      const value = makeTexture.call(this);
      if (value) textures.add(value);
      return value;
    };
    proto.deleteTexture = function (value) {
      if (value) textures.delete(value);
      deleteTexture.call(this, value);
    };
    (window as unknown as { graphics: () => { buffers: number; textures: number } }).graphics = () => ({
      buffers: buffers.size,
      textures: textures.size,
    });
  });
  await page.goto("/");
  await openStories(page, "search");
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const readings: { buffers: number; textures: number }[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const [query, id, title] of [
      ["Aral", "aral", "Vanishing Sea"],
      ["Ridgecrest", "fault", "Fault Offset"],
    ]) {
      await page.getByRole("searchbox", { name: "Find a story" }).fill(query!);
      await page.locator(`#search-story-${id}`).click();
      await expect(
        page.getByRole("region", { name: title!, exact: true }).getByRole("slider").first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Back to stories", exact: true }).click();
      await expect(page.getByRole("searchbox", { name: "Find a story" })).toBeVisible();
    }
    readings.push(
      await page.evaluate(() =>
        (window as unknown as { graphics: () => { buffers: number; textures: number } }).graphics(),
      ),
    );
  }
  expect(readings[0]!.buffers).toBeGreaterThan(0);
  expect(readings[2]!.buffers).toBeLessThanOrEqual(readings[1]!.buffers);
  expect(readings[2]!.textures).toBeLessThanOrEqual(readings[1]!.textures);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);
  await test
    .info()
    .attach("graphics-resources", { body: JSON.stringify(readings), contentType: "application/json" });
});
