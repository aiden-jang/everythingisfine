import { expect, test, type Page } from "@playwright/test";
import type { Mesh, MeshBasicMaterial, Object3D } from "three";
import { installFeeds, openLayer, selectScene } from "./feeds";

// Synthetic radar pixels make the actual scene texture observable without depending on today's storms.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQW///PwAFhwLMAV5hdQAAAABJRU5ErkJggg==",
  "base64",
);
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

async function radarSource(page: Page, covered = false) {
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
    route.fulfill({
      contentType: "image/png",
      body: covered && route.request().url().includes("/coverage/") ? transparentPixel : pixel,
    }),
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

for (const [width, height] of [
  [1440, 900],
  [390, 900],
  [812, 375],
] as const) {
  test(`landing radar survives the same-canvas handoff to Explore and back at ${width}px @dev`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFeeds(page, { presentation: "fresh", radar: "default" });
    const source = await radarSource(page);
    await page.goto("/");
    await expect.poll(() => radarTexture(page)).not.toBeNull();
    const texture = await radarTexture(page);
    const canvas = await page.locator("#globe-view canvas").elementHandle();
    await expect(page.getByRole("heading", { name: "Look closer." })).toBeVisible();
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
    expect(credit).not.toBeNull();
    if (width >= 900) {
      const sunlight = await readout.getByText("Sun overhead", { exact: true }).boundingBox();
      expect(sunlight).not.toBeNull();
      expect(
        sunlight!.y >= credit!.y + credit!.height || sunlight!.x >= credit!.x + credit!.width,
        "radar attribution and solar readout occupy separate space in the wrapping footer",
      ).toBe(true);
    }
    await expect(readout.getByRole("link", { name: /RainViewer/ })).toBeInViewport({ ratio: 1 });
    const sources = readout.getByRole("button", { name: "Sources & times", exact: true });
    await expect(sources).toBeInViewport();
    if (height === 375) {
      const collisions = await page.locator(".layer-readout").evaluate((readout) => {
        const footer = readout.getBoundingClientRect();
        return [...document.querySelectorAll(".observatory-entry-actions button, .creator-credit a")]
          .filter((node) => {
            const control = node.getBoundingClientRect();
            return (
              Math.min(footer.right, control.right) > Math.max(footer.left, control.left) &&
              Math.min(footer.bottom, control.bottom) > Math.max(footer.top, control.top)
            );
          })
          .map((node) => node.textContent?.trim());
      });
      expect(collisions, "loaded radar attribution stays clear of entry actions and creator credit").toEqual(
        [],
      );
      await sources.click();
      const times = page.getByRole("group", { name: "Weather layer times", exact: true });
      await expect(times).toBeVisible();
      await expect(times.locator("time").first()).toHaveAttribute(
        "datetime",
        new Date(source.at).toISOString(),
      );
      await times.getByRole("button", { name: "Close layer times", exact: true }).click();
      await expect(sources).toBeFocused();
    }
    if (process.env["EIF_CAPTURE_UI"])
      await page.screenshot({ path: `${process.env["EIF_CAPTURE_UI"]}/landing-radar-${width}.png` });
    await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
    await openLayer(page, "Storm radar");
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
      .getByRole("button", {
        name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
        exact: true,
      })
      .click();
    await expect(page.getByRole("heading", { name: "Look closer." })).toBeVisible();
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
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
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
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
  await openLayer(page, "Storm radar");
  await page.getByRole("region", { name: "Storm radar playback" }).getByRole("slider").press("Home");
  await page
    .getByRole("button", {
      name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
      exact: true,
    })
    .click();
  await selectScene(page, "After Dark");
  await expect.poll(() => radarTexture(page)).toBeNull();
  await expect(page.locator("#radar-layer-controls")).toBeHidden();
  await page.getByRole("button", { name: /^Feed status,/ }).click();
  await expect(
    page
      .getByRole("region", { name: "Background feed status" })
      .getByRole("listitem")
      .filter({ hasText: "RainViewer storm radar" }),
  ).toContainText("Available");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
      exact: true,
    })
    .click();
  await expect.poll(() => radarTexture(page)).not.toBeNull();
  await expect(page.locator(".radar-canvas-credit time")).toHaveAttribute(
    "datetime",
    new Date(source.at - 600_000).toISOString(),
  );
  await page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }).click();
  await page.getByRole("button", { name: "Storm radar", exact: true }).click();
  await expect.poll(() => radarTexture(page)).toBeNull();
  await page
    .getByRole("button", {
      name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
      exact: true,
    })
    .click();
  await expect(page.locator(".radar-canvas-credit")).toHaveCount(0);
  const before = source.calls();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Explore (the globe|the layers)$/, exact: true }),
  ).toBeEnabled();
  expect(await radarTexture(page)).toBeNull();
  expect(source.calls()).toBe(before);
});

test("Home leaves archive mode and browser Back recovers the recorded day @dev", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { radar: "default" });
  await radarSource(page);
  await page.goto("/#d=2011-03-11");
  await page.getByRole("button", { name: "Back to layers", exact: true }).click();
  const toggle = page
    .getByRole("region", { name: "Map layers", exact: true })
    .getByRole("button", { name: "Storm radar", exact: true });
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole("button", { name: "back to live", exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Everything is fine. Earth, ocean & sky, back to the Observatory",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: "Look closer." })).toBeVisible();
  await expect.poll(() => radarTexture(page)).not.toBeNull();
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get("d")).toBeNull();
  await page.goBack();
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole("button", { name: "back to live", exact: true })).toBeVisible();
  await expect(page.locator("#archive-day")).toHaveValue("2011-03-11");
  await expect.poll(() => radarTexture(page)).toBeNull();
});

test("place radar rewinds in the shared canvas and copies a held scan @dev", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFeeds(page, { dead: true, radar: "default" });
  const source = await radarSource(page, true);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new DOMException("Blocked", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/#v=explore&at=139.7,35.7,2.3&layers=radar");
  const tokyo = page.locator(".place-labels > span").filter({ hasText: /^Tokyo$/ });
  await expect(tokyo).toBeVisible();
  const point = (await tokyo.boundingBox())!;
  await page.mouse.click(point.x + point.width / 2, point.y + point.height);
  const canvas = await page.locator("#globe-view canvas").elementHandle();
  const place = page.getByRole("region", { name: "Around this point" });
  const coordinates = await place.locator(".place-coordinates").textContent();
  await place.getByRole("button", { name: "Rewind radar" }).click();
  const heading = page.getByRole("heading", { name: "Radar rewind" });
  await expect(heading).toBeFocused();
  const playback = page.getByRole("region", { name: "Storm radar playback" });
  const timestamp = playback.locator(".radar-clock time");
  const slider = playback.getByRole("slider");
  const held = await longitude(page);
  await slider.press("Home");
  await expect(timestamp).toHaveAttribute("datetime", new Date(source.at - 600_000).toISOString());
  expect(await longitude(page)).toBeCloseTo(held, 3);
  expect(await canvas!.evaluate((node) => node === document.querySelector("#globe-view canvas"))).toBe(true);

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Copy radar link" }).click();
  const link = page.getByRole("textbox", { name: "Link to copy" });
  await expect(link).toBeVisible();
  await page.goto(await link.inputValue());
  await expect(heading).toBeVisible();
  await expect(page.getByRole("region", { name: "Map", exact: true })).toBeVisible();
  await expect(timestamp).toHaveAttribute("datetime", new Date(source.at - 600_000).toISOString());

  const samePlace = await longitude(page);
  await page.getByRole("button", { name: "Back to live", exact: true }).click();
  await expect(place.locator(".place-coordinates")).toHaveText(coordinates!);
  await expect(place.locator("time")).toHaveAttribute("datetime", new Date(source.at).toISOString());
  await expect(place.getByRole("button", { name: "Rewind radar" })).toBeFocused();
  expect(await longitude(page)).toBeCloseTo(samePlace, 3);
  const params = new URL(page.url()).hash;
  expect(params).not.toContain("radarAt");
  expect(params).not.toContain("radarPlace");
});
