import { expect, test, type Page } from "@playwright/test";
import { installFeeds, openStories, revealStoryTools } from "./feeds";

const pose = (page: Page) =>
  page.evaluate(() => {
    const controls = (
      window as unknown as {
        __globe: {
          state: () => { lon: number; lat: number; zoom: number };
          morph: () => number;
          guidance: { read: () => boolean };
        };
      }
    ).__globe;
    return { ...controls.state(), map: controls.morph(), manual: controls.guidance.read() };
  });

async function wheel(page: Page, x = 1050, y = 350) {
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -220);
  await expect(page.getByRole("button", { name: "Recenter", exact: true })).toBeVisible();
}

test("a cinematic story yields during arrival, keeps its time, and recenters the current shot @dev", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await openStories(page);
  await page.getByRole("button", { name: "Follow Hurricane Katrina" }).click();
  const panel = page.getByRole("region", { name: "Eye of the Storm" });
  const time = panel.getByRole("slider", { name: "Track time" });
  await expect(time).toBeVisible();
  const original = await page.locator("#globe-view canvas").elementHandle();
  await wheel(page);
  const start = await time.inputValue();
  await expect.poll(() => time.inputValue()).not.toBe(start);
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#globe-view").focus();
  await page.keyboard.press("+");
  const exploring = await pose(page);
  expect(exploring.manual).toBe(true);
  await time.press("End");
  const held = await time.inputValue();
  await expect.poll(() => pose(page)).toEqual(exploring);
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(async () => (await pose(page)).map).toBe(1);
  expect((await pose(page)).manual).toBe(true);
  await expect(time).toHaveValue(held);
  await page.getByRole("button", { name: "Recenter", exact: true }).click();
  await expect.poll(async () => (await pose(page)).manual).toBe(false);
  await expect(time).toHaveValue(held);
  expect(await page.locator("#globe-view canvas").evaluate((el, old) => el === old, original)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("story-recenter-desktop.png") });
});

test("phone pinch explores the story and its Recenter stays reachable @dev", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/#v=observe&story=katrina");
  const panel = page.getByRole("region", { name: "Eye of the Storm" });
  await expect(panel.getByRole("slider")).toBeVisible();
  await panel.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(async () => (await pose(page)).map).toBe(1);
  const before = await pose(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 160, y: 240, id: 1 },
      { x: 230, y: 240, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 120, y: 240, id: 1 },
      { x: 270, y: 240, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await pose(page)).zoom).toBeGreaterThan(before.zoom);
  const recenter = page.getByRole("button", { name: "Recenter", exact: true });
  await expect(recenter).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath("story-recenter-phone.png") });
  await recenter.click();
  await expect(recenter).toBeHidden();
  await expect(page.locator("#globe-view")).toBeFocused();
  expect((await pose(page)).manual).toBe(false);
});

test("map section taps still pick while dragging and zooming remain available @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/#v=observe&story=seafloor");
  const panel = page.getByRole("region", { name: "Seafloor Flight", exact: true });
  await panel.getByRole("button", { name: "Measure a depth section" }).click();
  await expect.poll(async () => (await pose(page)).map).toBe(1);
  const before = await pose(page);
  await page.mouse.move(1000, 350);
  await page.mouse.down();
  await page.mouse.move(1150, 350, { steps: 8 });
  await page.mouse.up();
  expect(Math.abs((await pose(page)).lon - before.lon)).toBeGreaterThan(0.1);
  await expect(panel.getByRole("status").filter({ hasText: "Choose" })).toHaveText(
    "Choose two points inside the terrain to measure a depth section.",
  );
  await page.getByRole("button", { name: "Recenter", exact: true }).click();
  const point = await page.evaluate(() =>
    (
      window as unknown as { __globe: { project: (lon: number, lat: number) => { x: number; y: number } } }
    ).__globe.project(142.2, 11.4),
  );
  await page.mouse.click(point.x, point.y);
  await expect(panel.getByRole("status").filter({ hasText: "Choose" })).toHaveText(
    "Choose the other end of your section.",
  );
});

test("Float Dive yields to exploration without discarding the selected measurement @dev", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh", empty: true });
  await page.goto("/");
  await revealStoryTools(page);
  await page.getByRole("button", { name: "Float Dive", exact: true }).click();
  const panel = page.getByRole("region", { name: "Float Dive", exact: true });
  const depth = panel.getByRole("slider", { name: "Ascent depth" });
  await depth.press("End");
  const held = await depth.inputValue();
  const before = await pose(page);
  await wheel(page);
  expect((await pose(page)).zoom).toBeGreaterThan(before.zoom);
  await expect(depth).toHaveValue(held);
  await page.getByRole("button", { name: "Recenter", exact: true }).click();
  await expect(depth).toHaveValue(held);
  expect((await pose(page)).manual).toBe(false);
});

for (const [id, title] of [
  ["seafloor", "Seafloor Flight"],
  ["katrina", "Eye of the Storm"],
]) {
  test(`${title} map dragging keeps geography beneath the pointer @dev`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", empty: true });
    await page.goto(`/#v=observe&story=${id}`);
    const panel = page.getByRole("region", { name: title!, exact: true });
    await expect(panel.getByRole("slider").first()).toBeVisible();
    await panel.getByRole("button", { name: "Map", exact: true }).click();
    await expect.poll(async () => (await pose(page)).map).toBe(1);
    const anchor = await page.evaluate(() =>
      (
        window as unknown as {
          __globe: { pick: (x: number, y: number) => { lon: number; lat: number } | null };
        }
      ).__globe.pick(1000, 350),
    );
    expect(anchor).not.toBeNull();
    await page.mouse.move(1000, 350);
    await page.mouse.down();
    await page.mouse.move(1060, 374, { steps: 6 });
    await page.mouse.up();
    const moved = await page.evaluate(
      (point) =>
        (
          window as unknown as {
            __globe: { project: (lon: number, lat: number) => { x: number; y: number } };
          }
        ).__globe.project(point!.lon, point!.lat),
      anchor,
    );
    expect(moved.x).toBeCloseTo(1060, 0);
    expect(moved.y).toBeCloseTo(374, 0);
    await expect(page.getByRole("button", { name: "Recenter", exact: true })).toBeVisible();
  });
}

test("globe and map use the wider zoom range and preserve it in shared links @dev", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/#v=explore&at=0,0,3");
  await expect.poll(async () => (await pose(page)).zoom).toBe(3);
  const apparentWidth = () =>
    page.evaluate(() => {
      const c = (
        window as unknown as { __globe: { project: (lon: number, lat: number) => { x: number; y: number } } }
      ).__globe;
      return c.project(1, 0).x - c.project(-1, 0).x;
    });
  const before = await apparentWidth();
  await page.locator("#globe-view").focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press("+");
  await expect.poll(async () => (await pose(page)).zoom).toBe(12);
  await expect.poll(apparentWidth).toBeGreaterThan(before * 3.5);
  for (let i = 0; i < 20; i++) await page.keyboard.press("-");
  await expect.poll(async () => (await pose(page)).zoom).toBe(0.4);
  await page.goto("/#v=explore&p=map&at=0,30,10");
  await expect.poll(async () => (await pose(page)).zoom).toBe(10);
  await expect.poll(async () => (await pose(page)).map).toBe(1);
  await page.reload();
  await expect.poll(async () => (await pose(page)).zoom).toBe(10);
  expect((await pose(page)).lat).toBeCloseTo(30, 1);
});
