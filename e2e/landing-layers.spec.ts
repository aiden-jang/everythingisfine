import { expect, test, type Page } from "@playwright/test";
import type { Mesh, MeshBasicMaterial, Object3D } from "three";
import { installFeeds } from "./feeds";

// Synthetic radar pixels make the actual scene texture observable without depending on today's storms.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
  "base64",
);
async function radarSource(page: Page) {
  let calls = 0;
  const at = Math.floor(Date.now() / 600_000) * 600_000;
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) => {
    calls++;
    return route.fulfill({
      json: {
        host: "https://tilecache.rainviewer.com",
        radar: { past: [at - 600_000, at].map((time) => ({ time: time / 1000, path: `/v2/radar/${time}` })) },
      },
    });
  });
  await page.route("https://tilecache.rainviewer.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  return { calls: () => calls, at };
}
const radarTexture = (page: Page) =>
  page.evaluate(() => {
    let root = (window as unknown as { __events?: { object: Object3D } }).__events?.object;
    if (!root) return null;
    while (root.parent) root = root.parent;
    const radar = root.getObjectByName("storm-radar") as Mesh | undefined;
    const texture = (radar?.material as MeshBasicMaterial | undefined)?.map;
    return radar?.visible && texture ? texture.uuid : null;
  });
const longitude = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __globe: { state: () => { lon: number } } }).__globe.state().lon,
  );

for (const width of [1440, 390]) {
  test(`landing radar survives the same-canvas handoff to Explore and back at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", radar: "default" });
    const source = await radarSource(page);
    await page.goto("/");
    await expect.poll(() => radarTexture(page)).not.toBeNull();
    const texture = await radarTexture(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
    await expect(page.locator("#chrome-rail")).toBeHidden();
    await expect(page.locator(".radar-canvas-credit time")).toHaveAttribute(
      "datetime",
      new Date(source.at).toISOString(),
    );
    await expect(page.getByRole("button", { name: /^Feed status,/ })).toHaveAccessibleName(
      /All feeds available|8\/8 available/,
    );
    const readout = page.getByRole("group", { name: "Globe readout" });
    const credit = await readout.locator(".radar-canvas-credit").boundingBox();
    const sunlight = await readout.getByText("Sun overhead", { exact: true }).boundingBox();
    expect(credit).not.toBeNull();
    expect(sunlight!.y).toBeGreaterThanOrEqual(credit!.y + credit!.height);
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/landing-radar-${width}.png` });
    await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
    const controls = page.getByRole("region", { name: "Storm radar playback" });
    await expect(controls).toBeVisible();
    expect(await radarTexture(page)).toBe(texture);
    expect(source.calls()).toBe(1);
    await controls.getByRole("slider").press("Home");
    await expect(page.locator(".radar-canvas-credit time")).toHaveAttribute(
      "datetime",
      new Date(source.at - 600_000).toISOString(),
    );
    const selected = await radarTexture(page);
    await page
      .getByRole("button", { name: "Everything Is Fine, back to the Observatory", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
    expect(await radarTexture(page)).toBe(selected);
    expect(source.calls()).toBe(1);
    expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("the landing radar rotates with the globe and stops in Explore @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFeeds(page, { presentation: "fresh", radar: "default" });
  await radarSource(page);
  await page.goto("/");
  await expect.poll(() => radarTexture(page)).not.toBeNull();
  const texture = await radarTexture(page);
  const before = await longitude(page);
  await expect.poll(async () => (await longitude(page)) - before).toBeGreaterThan(0.3);
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await expect(page.locator(".frame")).toHaveAttribute("data-presentation", "explore");
  expect(await radarTexture(page)).toBe(texture);
  const settled = await page.evaluate(async () => {
    const globe = (window as unknown as { __globe: { state: () => { lon: number } } }).__globe;
    const before = globe.state().lon;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return before === globe.state().lon;
  });
  expect(settled).toBe(true);
});

test("landing layers yield to After Dark and respect a saved off choice @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", radar: "default" });
  const source = await radarSource(page);
  await page.goto("/");
  await expect.poll(() => radarTexture(page)).not.toBeNull();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect.poll(() => radarTexture(page)).toBeNull();
  await expect(page.locator("#radar-layer-controls")).toHaveCount(0);
  await page.getByRole("button", { name: /^Feed status,/ }).click();
  await expect(
    page
      .getByRole("region", { name: "Background feed status" })
      .getByRole("listitem")
      .filter({ hasText: "RainViewer storm radar" }),
  ).toContainText("Paused in this view");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await expect.poll(() => radarTexture(page)).not.toBeNull();
  await page.getByRole("button", { name: "Explore the globe", exact: true }).click();
  await page.getByRole("button", { name: "Storm radar", exact: true }).click();
  await expect.poll(() => radarTexture(page)).toBeNull();
  await page
    .getByRole("button", { name: "Everything Is Fine, back to the Observatory", exact: true })
    .click();
  await expect(page.locator(".radar-canvas-credit")).toHaveCount(0);
  const before = source.calls();
  await page.reload();
  await expect(page.getByRole("button", { name: "Explore the globe", exact: true })).toBeEnabled();
  expect(await radarTexture(page)).toBeNull();
  expect(source.calls()).toBe(before);
});
