import { expect, test } from "@playwright/test";
import {
  openLayer,
  installFeeds,
  waitForData,
  openStories,
  saveImageButton,
  revealStoryTools,
} from "./feeds";

for (const [width, height] of [
  [320, 640],
  [390, 844],
  [768, 1024],
  [812, 375],
  [1024, 768],
  [1440, 900],
]) {
  test(`the observatory fits at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: width === 768 ? "active" : "none" });
    await installFeeds(page, { presentation: "fresh" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /shader|WebGLProgram/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
    await expect(page.locator("#chrome-rail")).toBeHidden();
    const stage = page.getByRole("group", { name: "Globe readout" });
    await expect(stage).toContainText("Day–night boundary");
    await expect(stage).toContainText(/\d{2}:\d{2} UTC/);
    const explore = page.getByRole("button", { name: "Explore the globe" });
    await expect(explore).toBeVisible();
    const depth = page.getByRole("button", { name: "Below the Surface", exact: true });
    await expect(depth).toBeEnabled();
    for (const scene of ["Live Earth", "Below the Surface", "After Dark"])
      await expect(page.getByRole("button", { name: scene, exact: true })).toBeInViewport({ ratio: 1 });
    const bounds = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        height: document.documentElement.scrollHeight,
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      };
    });
    expect(bounds.overflow).toBe(false);
    expect(bounds.height).toBeLessThanOrEqual(height!);
    expect(bounds.canvas.width).toBeGreaterThan(150);
    expect(bounds.canvas.height).toBeGreaterThan(150);
    const credit = page.getByRole("link", { name: "aiden jang", exact: true });
    await expect(credit).toBeInViewport({ ratio: 1 });
    const creditPosition = await credit.boundingBox();
    expect(height! - (creditPosition!.y + creditPosition!.height)).toBeLessThanOrEqual(24);
    await page.screenshot({ path: test.info().outputPath(`observe-live-${width}.png`) });
    await page.getByRole("button", { name: "After Dark", exact: true }).click();
    await expect(page.getByRole("heading", { name: "The other side of day." })).toBeVisible();
    await expect(stage).toContainText("Catalogue sky");
    expect(await credit.boundingBox()).toEqual(creditPosition);
    await expect(page.getByRole("button", { name: "After Dark", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await depth.click();
    await expect(page.getByRole("heading", { name: "Beneath the surface." })).toBeVisible();
    await expect(depth).toHaveAttribute("aria-pressed", "true");
    await expect(stage).toContainText("300 / 600 / 900 km");
    expect(await credit.boundingBox()).toEqual(creditPosition);
    await page.screenshot({ path: test.info().outputPath(`observe-depth-${width}.png`) });
    await explore.click();
    await expect(page.locator("#chrome-rail")).toBeVisible();
    await expect(stage).toBeHidden();
    await expect(page.getByText("An observatory by")).toBeHidden();
    await openLayer(page);
    await expect(page.getByRole("region", { name: "Recent earthquakes" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("scenes preserve existing preferences and shared event links open the explorer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    localStorage.setItem("eif.flat", "1");
    localStorage.setItem("eif.railOpen", "0");
    localStorage.setItem("eif.depthSink", "0");
    localStorage.setItem("eif.ramp", "cividis");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Globe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page.getByRole("button", { name: "Globe", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the panel", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      depth: localStorage.getItem("eif.depthSink"),
      ramp: localStorage.getItem("eif.ramp"),
      figures: localStorage.getItem("eif.figures"),
    })),
  ).toEqual({ depth: "0", ramp: "cividis", figures: null });
  await page.goto("/#e=usgs:missing-shared-event");
  await expect(page.locator("main")).toHaveAttribute("data-presentation", "explore");
});

test("tour controls pause, advance, stop and leave the readings accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await revealStoryTools(page);
  const tour = page.getByRole("button", { name: "Take a tour" });
  await expect(tour).toBeEnabled();
  await tour.click();
  await expect(page.locator(".observatory-location")).toBeVisible();
  const first = await page.locator(".observatory-location").getAttribute("data-tour-location");
  await page.getByRole("button", { name: "Pause tour", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume tour", exact: true })).toBeVisible();
  await page.waitForTimeout(6500);
  await expect(page.locator(".observatory-location")).toHaveAttribute("data-tour-location", first!);
  await page.getByRole("button", { name: "Next tour stop", exact: true }).click();
  await expect(page.locator(".observatory-location")).not.toHaveAttribute("data-tour-location", first!);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await waitForData(page);
});

test("presentation changes keep the same WebGL scene with ordinary motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    const scene = { contexts: 0, flights: 0, canvas: null as HTMLCanvasElement | null };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const motion = animate.call(this, frames, options);
      if (
        this.matches(".zone-canvas") &&
        Array.isArray(frames) &&
        frames[0]?.transform !== frames[1]?.transform
      ) {
        scene.flights += 1;
        scene.canvas ??= this.querySelector("canvas");
      }
      return motion;
    };
    Object.assign(window, { observatoryScene: scene });
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (/webgl/.test(kind)) scene.contexts += 1;
      return Reflect.apply(get, this, [kind, ...args]);
    } as typeof get;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await revealStoryTools(page);
  await expect(page.getByRole("button", { name: "Take a tour" })).toBeEnabled();
  const contexts = () =>
    page.evaluate(
      () => (window as unknown as { observatoryScene: { contexts: number } }).observatoryScene.contexts,
    );
  const original = await contexts();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page.locator("#chrome-rail")).toBeVisible();
  await expect(page.locator("#view-projection")).toBeFocused();
  const rail = page.locator("#chrome-rail");
  const landingColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(rail).toHaveCSS("background-color", landingColor);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const globe = document.getElementById("globe-view")?.getBoundingClientRect();
        const panel = document.getElementById("chrome-rail")?.getBoundingClientRect();
        return Boolean(globe && panel && globe.left >= panel.right - 1);
      }),
    )
    .toBe(true);
  // An immediate reversal can cancel the outward flight before the globe has moved.
  await expect
    .poll(() => page.locator(".zone-canvas").evaluate((node) => node.getAnimations().length))
    .toBe(0);
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
  expect(await contexts()).toBe(original);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { flights, canvas } = (
          window as unknown as { observatoryScene: { flights: number; canvas: HTMLCanvasElement | null } }
        ).observatoryScene;
        return { flights, sameCanvas: canvas === document.querySelector(".zone-canvas canvas") };
      }),
    )
    .toEqual({ flights: 2, sameCanvas: true });
  expect(errors).toEqual([]);
});

test("a historical shortcut frames an actual archived event and keeps capture available", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page, { presentation: "fresh" });
  await page.goto("/");
  await expect(await saveImageButton(page)).toBeEnabled();
  const download = page.waitForEvent("download");
  await (await saveImageButton(page)).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await openStories(page);
  await page.getByRole("button", { name: "Japan, 2011", exact: true }).click();
  await expect(page).toHaveURL(/d=2011-03-11/);
  await expect(page.getByRole("complementary", { name: "Pinned earthquake" })).toBeVisible();
  await expect(page.getByRole("button", { name: "back to live", exact: true })).toBeVisible();
});

test("an empty view stays honest and keeps exploration available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { empty: true, presentation: "fresh" });
  await page.goto("/");
  await expect(page.locator(".observatory-summary")).toContainText("0 earthquakes");
  await revealStoryTools(page);
  await expect(page.getByRole("button", { name: "Take a tour" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Below the Surface", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "After Dark", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Below the Surface", exact: true }).click();
  await expect(
    page.getByText(
      "No earthquake at least 70 km deep in this window. Recorded depth stories are still available.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Rupture Reveal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page.locator("#chrome-rail")).toBeVisible();
  await openLayer(page);
  await expect(page.getByRole("region", { name: "Recent earthquakes" }).getByRole("status")).toHaveText(
    "No earthquakes reported in this window.",
  );
});

test("unavailable earthquake feeds do not masquerade as an empty or loading view", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { dead: true, presentation: "fresh" });
  await page.goto("/");
  await expect(page.locator(".observatory-source-note")).toContainText("USGS and EMSC are not answering");
  await expect(page.locator(".observatory-summary")).toContainText("Earthquake feeds unavailable.");
  await revealStoryTools(page);
  await expect(page.getByRole("button", { name: "Take a tour" })).toBeDisabled();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page.locator("#chrome-rail")).toBeVisible();
});

test("the observatory keeps capture recovery and home navigation available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Refused", "NotAllowedError")),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "After Dark", exact: true }).click();
  await (await saveImageButton(page)).click();
  await expect(page.getByRole("region", { name: "View options", exact: true })).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Sharing is unavailable" })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("button", { name: "View options", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.getByRole("heading", { name: "Meanwhile, on Earth." })).toBeVisible();
});

test("a missing WebGL context still offers the source readings", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { presentation: "fresh" });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (/webgl/.test(kind)) return null;
      return Reflect.apply(get, this, [kind, ...args]);
    } as typeof get;
  });
  await page.goto("/");
  for (const scene of ["Live Earth", "Below the Surface", "After Dark"])
    await expect(page.getByRole("button", { name: scene, exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Stories and layers", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Explore the globe" })).toBeVisible();
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await waitForData(page);
});

test("a shared map restores Explore and the Observatory preserves the held view", async ({
  page,
  browser,
}) => {
  await installFeeds(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const transport = page.getByRole("slider", { name: "Time in the window" });
  await transport.press("ArrowLeft");
  await expect(page).toHaveURL(/p=map&v=explore.*&c=/);
  const link = page.url();
  await page.getByRole("button", { name: "Everything Is Fine, back to the Observatory" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-presentation", "observe");
  await page.getByRole("button", { name: "Explore the globe" }).click();
  await expect(page).toHaveURL(/p=map&v=explore.*&c=/);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("c")).toBe(
    new URLSearchParams(new URL(link).hash.slice(1)).get("c"),
  );
  const recipient = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await installFeeds(recipient, { presentation: "fresh" });
    await recipient.goto(link);
    await expect(recipient.getByRole("button", { name: "Globe", exact: true })).toBeVisible();
    await expect(recipient.getByRole("button", { name: "Return to live", exact: true })).toBeVisible();
  } finally {
    await recipient.close();
  }
});

test("an archived time returns to day end and partial coverage stays explicit", async ({ page }) => {
  await installFeeds(page);
  await page.route(/seismicportal\.eu.*fdsnws\/event\/1\/query/, async (route) => {
    if (new URL(route.request().url()).searchParams.has("starttime")) await route.abort();
    else await route.fallback();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#d=2011-03-11&e=emsc:missing-fixture");
  const back = page.getByRole("button", { name: "back to live", exact: true });
  await expect(back).toBeVisible();
  await expect(page.getByText(/EMSC · Couldn’t be reached/)).toBeVisible();
  await expect(page.getByText("EMSC archive reports couldn’t be reached for 2011-03-11.")).toBeVisible();
  const transport = page.getByRole("slider", { name: "Time in the window" });
  await transport.press("Home");
  await page.getByRole("button", { name: "Jump to end of day", exact: true }).click();
  await expect(transport).toHaveAttribute("aria-valuetext", "End of day");
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toBeHidden();
});
