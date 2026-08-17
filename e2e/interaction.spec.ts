import { expect, test, type Page } from "@playwright/test";

/*
 * The claims that only a browser can settle.
 *
 * Four of them, and each is here because the alternative would have been to assert it in a unit
 * test where the thing under test is absent, or to claim it from reading the code.
 */

/** The rail's event count is the app's own signal that both feeds have answered. */
async function waitForData(page: Page): Promise<number> {
  const counter = page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first();
  await expect(counter).not.toHaveText("0", { timeout: 30_000 });
  return Number((await counter.innerText()).replace(/,/g, ""));
}

test("the first frame is already live", async ({ page }) => {
  await page.goto("/");
  const held = await waitForData(page);

  // Not "some data eventually": a globe with four dots on it is what sent the seed window from an
  // hour to a day, and this is the assertion that stops it drifting back.
  expect(held).toBeGreaterThan(50);
  await expect(page.getByText("BOTH FEEDS LIVE")).toBeVisible();
  // The window states its own left edge rather than claiming a full 24 hours it does not have.
  await expect(page.locator(".zone-rail")).toContainText(/since \d\d:\d\d|last 24 hours/);
});

test("a pinned selection survives a data refresh", async ({ page }) => {
  await page.goto("/");
  await waitForData(page);

  const feed = page.getByRole("region", { name: "Recent earthquakes" });
  const items = feed.getByRole("button");
  await items.first().focus();
  const chosen = (await items.first().innerText()).trim();
  await page.keyboard.press("Enter");

  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  const magnitude = (await panel.innerText()).match(/M \d+\.\d/)?.[0];
  expect(magnitude).toBeTruthy();
  expect(chosen).toContain(magnitude!);

  /*
   * Force real refreshes rather than waiting a minute for the poller.
   *
   * The store is the thing under test, so it is fed directly: re-ingesting everything it already
   * holds is exactly what a USGS poll does, and it is what would break a selection held as an
   * object or an index.
   */
  await page.evaluate(() => {
    const feedHandle = (window as unknown as { __feed: { store: { forEach: (f: (q: unknown) => void) => void; ingest: (r: unknown) => void } } }).__feed;
    const readings: unknown[] = [];
    feedHandle.store.forEach((q) => {
      readings.push(...(q as { readings: unknown[] }).readings);
    });
    for (let round = 0; round < 3; round += 1) {
      for (const r of readings) feedHandle.store.ingest(r);
    }
  });

  // The panel must still be open, on the same event, with the same reading.
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(magnitude!);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("the globe is operable with the canvas hidden", async ({ page }) => {
  await page.goto("/");
  await waitForData(page);

  // Not merely aria-hidden: actually invisible, so nothing can be passing by accident through the
  // canvas that a screen reader user would never have reached.
  await page.locator("canvas").evaluate((el) => { el.style.visibility = "hidden"; });
  await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");

  const feed = page.getByRole("region", { name: "Recent earthquakes" });
  const items = feed.getByRole("button");
  await expect(items.first()).toBeAttached();

  await items.first().focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  // Three presses, three positions. Held as React state this moved one, because every synchronous
  // keypress read the same value before the next render.
  const focusedIndex = await feed.evaluate((section) => {
    const all = [...section.querySelectorAll("li button")];
    return all.indexOf(document.activeElement as Element);
  });
  expect(focusedIndex).toBe(3);

  await page.keyboard.press("Enter");
  await expect(page.locator(".zone-panel")).toBeVisible();
});

/*
 * The one claim that has been written down since step 3 and never observed.
 *
 * The context is built explicitly rather than through `test.use({ reducedMotion })`, because that
 * form silently did not reach the page in this Playwright version: `matchMedia` reported false
 * inside a block named "with reduced motion". The test passed its behavioural assertions anyway,
 * which is the worst possible outcome, so the emulation is asserted before anything else is.
 */
test("with reduced motion, there is no entrance and flying is instant", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:31600");

    expect(await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    )).toBe(true);

    await waitForData(page);

    const camera = (): Promise<{ lon: number; zoom: number }> => page.evaluate(
      () => (window as unknown as { __globe: { state: () => { lon: number; zoom: number } } })
        .__globe.state(),
    );

    // The entrance starts 42 degrees back and springs forward. Skipped, not shortened, so the
    // camera is at the framing longitude from the very first frame.
    const atLoad = await camera();
    expect(atLoad.lon).toBeCloseTo(145, 1);
    expect(atLoad.zoom).toBeCloseTo(1, 2);

    // Flying to a region arrives rather than travels.
    await page.evaluate(() => {
      (window as unknown as { __globe: { flyTo: (a: number, b: number, c: number) => void } })
        .__globe.flyTo(-71, -25, 1.8);
    });
    const arrived = await camera();
    expect(arrived.lon).toBeCloseTo(-71, 1);
    expect(arrived.zoom).toBeCloseTo(1.8, 2);
  } finally {
    await context.close();
  }
});

/*
 * The entrance, at normal motion, must arrive without a bounce.
 *
 * This is the assertion the reduced-motion failure paid for: chasing why the camera sat past its
 * destination turned up an integrator that overshot by up to fifteen degrees when frames were slow.
 * The spring is now sliced, so the destination is exact whatever the frame rate.
 */
test("the entrance settles exactly on the framing shot", async ({ page }) => {
  await page.goto("/");
  await waitForData(page);

  const lon = (): Promise<number> => page.evaluate(
    () => (window as unknown as { __globe: { state: () => { lon: number } } }).__globe.state().lon,
  );
  await expect.poll(async () => Math.abs((await lon()) - 145) < 0.001, {
    timeout: 10_000,
  }).toBe(true);
});

/*
 * A permalink has to survive leaving the machine that made it.
 *
 * The failure this guards against is subtle and would look like success: the store's key is an
 * arrival counter, so a link carrying `q12` restores *a* twelfth event, just not the same one. This
 * asserts the link names the event the way the agency does, and that a fresh page finds it again.
 */
test("a shared link restores the view on a fresh page", async ({ page }) => {
  await page.goto("/");
  await waitForData(page);

  const items = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button");
  await items.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".zone-panel")).toBeVisible();
  const pinnedText = await page.locator(".zone-panel").innerText();

  await page.getByRole("button", { name: /colourblind ramp/i }).click();
  await expect.poll(async () => page.evaluate(() => window.location.hash), { timeout: 5_000 })
    .toMatch(/e=(usgs|emsc):/);

  const link = await page.evaluate(() => window.location.href);
  expect(link).toMatch(/r=cividis/);
  // Never our own key, which means nothing on another machine.
  expect(link).not.toMatch(/e=q[a-z0-9]+(&|$)/);

  const fresh = await page.context().newPage();
  await fresh.goto(link);
  await waitForData(fresh);

  await expect(fresh.locator(".zone-panel")).toBeVisible();
  await expect(fresh.getByRole("button", { name: /colourblind ramp/i }))
    .toHaveAttribute("aria-pressed", "true");
  // The same earthquake, not merely some earthquake.
  expect(await fresh.locator(".zone-panel").innerText())
    .toContain(pinnedText.match(/M \d+\.\d/)![0]);
  await fresh.close();
});

test("a link naming an event that has aged out says so", async ({ page }) => {
  await page.goto("/#at=140,35,1.4&m=2&w=24&s=emsc,usgs&r=thermal&e=usgs:us1000gonelongago");
  await waitForData(page);

  // Silently opening no panel would look like the link was broken. The app knows why, so it says
  // why, which is the same honesty the window's left edge gets.
  await expect(page.locator(".zone-rail")).toContainText("no longer in the window");
  await expect(page.locator(".zone-panel")).toHaveCount(0);
});
