import { expect, test, type Page } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

/*
 * The claims that only a browser can settle. Each is here because the alternative would be to assert it in
 * a unit test where the thing under test is absent, or to claim it from reading the code.
 */

/** The rail's event count is the app's own signal that both feeds have answered. */
interface Camera {
  lon: number;
  lat: number;
  zoom: number;
  morph: number;
}

/* `morph` is sampled alongside the camera because the projection unwrap is the same kind of thing: a value
 * easing toward a target that a test must not read halfway through. */
/** True when this run is against `dist`, where the DEV-only `window.__*` hooks do not exist. */
/* A spring stepped with a dt clamped at 50ms, so its wall-clock length scales with the frame rate,
   plus a hash rewritten on a 1s interval rather than per frame. Measured warm: camera settled at
   2799ms, hash at 3338ms. The old 8s left barely twice that, and CI came in over it. */
const CAMERA_SETTLE_MS = 20_000;

const AGAINST_BUILD = process.env["EIF_BUILD"] === "1";

/** Call at the top of a test that needs the DEV-only hooks. */
function needsDevHooks(): void {
  test.skip(AGAINST_BUILD, "reads window.__globe / __feed, which a production build does not expose");
}

const cameraNow = (page: Page): Promise<Camera> =>
  page.evaluate(() => {
    const globe = (
      window as unknown as {
        __globe: { state: () => Omit<Camera, "morph">; morph: () => number };
      }
    ).__globe;
    return { ...globe.state(), morph: globe.morph() };
  });

/**
 * Waits for the camera to stop moving, and returns where it stopped. Samples until two readings agree
 * rather than waiting a fixed time, which is the same test on a fast and a slow machine.
 */
async function cameraStill(page: Page): Promise<Camera> {
  let last: Camera | null = null;
  await expect
    .poll(
      async () => {
        const now = await cameraNow(page);
        const previous = last;
        last = now;
        if (previous === null) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(now.lon - previous.lon),
          Math.abs(now.lat - previous.lat),
          Math.abs(now.zoom - previous.zoom),
          Math.abs(now.morph - previous.morph),
        );
        // Generous on purpose: the ceiling is here to catch a spring that never settles, not to time a
        // machine. Reported as a movement-per-sample so a failure says how fast it was still going.
      },
      { timeout: 60_000, intervals: [250] },
    )
    .toBeLessThan(1e-4);
  return last!;
}

test("the first frame is already live", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  const held = await waitForData(page);

  // Not "some data eventually": a globe with four dots on it is what sent the seed window from an
  // hour to a day, and this is the assertion that stops it drifting back.
  expect(held).toBeGreaterThan(50);
  await expect(page.getByText(/feeds live/i)).toBeVisible();
  // The window states its own left edge rather than claiming a full 24 hours it does not have.
  // Any live span, not one particular window: this is about the first frame being live.
  await expect(page.locator(".zone-rail")).toContainText(/since \d\d:\d\d|last 24 hours|last 7 days/);
});

test("a pinned selection survives a data refresh", async ({ page }) => {
  needsDevHooks();
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const feed = page.getByRole("region", { name: "Recent earthquakes" });
  const items = feed.getByRole("button");
  await items.first().focus();
  const chosen = (await items.first().innerText()).trim();
  await page.keyboard.press("Enter");

  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  // Compared as a number, not as a rendered string. Matching `M 2.9` broke when the list dropped the `M`
  // prefix and kept it only in the panel, while the data never changed.
  const magnitude = (await panel.innerText()).match(/M (\d+\.\d)/)?.[1];
  expect(magnitude).toBeTruthy();
  expect(chosen).toContain(magnitude!);

  // Force real refreshes rather than waiting a minute for the poller. The store is the thing under test, and
  // re-ingesting everything it already holds is exactly what a USGS poll does.
  await page.evaluate(() => {
    const feedHandle = (
      window as unknown as {
        __feed: { store: { forEach: (f: (q: unknown) => void) => void; ingest: (r: unknown) => void } };
      }
    ).__feed;
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
  await expect(panel).toContainText(`M ${magnitude!}`);

  await page.keyboard.press("Escape");
  // Not `toHaveCount(0)`: the panel stays mounted holding its last event so it can animate out, and
  // lands on `display: none` at the end. Gone to a reader and gone to the layout is the contract; an
  // unmount was only ever how it happened to be implemented.
  await expect(panel).not.toBeVisible();
});

test("the globe is operable with the canvas hidden", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  // Not merely aria-hidden: actually invisible, so nothing can be passing by accident through the
  // canvas that a screen reader user would never have reached.
  await page.locator("canvas").evaluate((el) => {
    el.style.visibility = "hidden";
  });
  // On the canvas, not on the region around it: that region also holds the legend now, which is
  // content and has to stay reachable.
  await expect(page.locator("canvas")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("main")).not.toHaveAttribute("aria-hidden", "true");

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

/* The one claim written down since step 3 and never observed. See ARCHITECTURE.md#e2einteractionspects. */
test("with reduced motion, there is no entrance and flying is instant", async ({ browser }) => {
  needsDevHooks();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await installFeeds(page);
    await page.goto("http://localhost:31600");

    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );

    await waitForData(page);

    const camera = (): Promise<{ lon: number; zoom: number }> =>
      page.evaluate(() =>
        (window as unknown as { __globe: { state: () => { lon: number; zoom: number } } }).__globe.state(),
      );

    // The entrance starts 42 degrees back and springs forward. Skipped, not shortened, so the
    // camera is at the framing longitude from the very first frame.
    const atLoad = await camera();
    expect(atLoad.lon).toBeCloseTo(145, 1);
    expect(atLoad.zoom).toBeCloseTo(1, 2);

    // Flying to a region arrives rather than travels.
    await page.evaluate(() => {
      (window as unknown as { __globe: { flyTo: (a: number, b: number, c: number) => void } }).__globe.flyTo(
        -71,
        -25,
        1.8,
      );
    });
    const arrived = await camera();
    expect(arrived.lon).toBeCloseTo(-71, 1);
    expect(arrived.zoom).toBeCloseTo(1.8, 2);
  } finally {
    await context.close();
  }
});

/*
 * The entrance, at normal motion, must arrive without a bounce. Chasing why the camera sat past its
 * destination turned up an integrator that overshot by up to fifteen degrees when frames were slow.
 */
test("the entrance settles exactly on the framing shot", async ({ page }) => {
  needsDevHooks();
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  // Wait for the spring to stop, then assert where it stopped. Those are two different claims and
  // only the second one is what this test is about.
  const resting = await cameraStill(page);
  expect(resting.lon).toBeCloseTo(145, 3);
});

/*
 * A permalink has to survive leaving the machine that made it. The failure would look like success: the
 * store's key is an arrival counter, so a link carrying `q12` restores a twelfth event, just not the same one.
 */
test("a shared link restores the view on a fresh page", async ({ page }) => {
  // Twice the budget, because this test opens a second page with its own fixtures and its own WebGL globe.
  test.setTimeout(90_000);
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const items = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button");
  await items.first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".zone-panel")).toBeVisible();
  const pinnedText = await page.locator(".zone-panel").innerText();

  await page.getByRole("button", { name: /colourblind ramp/i }).click();
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 5_000 })
    .toMatch(/e=(usgs|emsc):/);

  const link = await page.evaluate(() => window.location.href);
  expect(link).toMatch(/r=cividis/);
  // Never our own key, which means nothing on another machine.
  expect(link).not.toMatch(/e=q[a-z0-9]+(&|$)/);

  const fresh = await page.context().newPage();
  // The second page needs its own fixtures: routes are per-page, so without this the fresh tab went
  // to the real agencies and could not find the event the link names.
  await installFeeds(fresh);
  await fresh.goto(link);
  await waitForData(fresh);

  await expect(fresh.locator(".zone-panel")).toBeVisible();
  await expect(fresh.getByRole("button", { name: /colourblind ramp/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The same earthquake, not merely some earthquake.
  expect(await fresh.locator(".zone-panel").innerText()).toContain(pinnedText.match(/M \d+\.\d/)![0]);

  await fresh.close();
});

test("an hour can be held from the keyboard, and let go", async ({ page }) => {
  // The keyboard half. Hover had no keyboard equivalent, so a keyboard user could not ask which hour an
  // event landed in.
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const strip = page.locator("[data-ramp]").filter({ has: page.locator(".gap-px") });
  const readout = strip.locator("span.font-mono").first();
  const bars = strip.locator(".gap-px > button");
  await expect(readout).toHaveText(/^peak \d+ · /);

  // One tab stop for twenty-four bars, or the strip would be a wall in front of the rest of the rail.
  expect(await bars.evaluateAll((all) => all.filter((b) => b.tabIndex === 0).length)).toBe(1);

  // Focus is the hold: no click, and no second state to keep in step with the pointer's.
  await bars.nth(Math.floor((await bars.count()) * 0.66)).focus();
  await expect(readout).toHaveText(/^\d+ events? · (latest|\d+[hd] ago)$/);

  // Escape lets go without leaving the strip, which a pointer does by moving away.
  await page.keyboard.press("Escape");
  await expect(readout).toHaveText(/^peak \d+ · /);
});

test("a swarm can be walked one event at a time", async ({ page }) => {
  // The other half of the sequence strip: it could draw three hundred neighbours in time order and there was
  // no way to visit one. This asserts the step actually re-pins.
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);

  // Into the densest region, where a pinned event certainly has neighbours either side of it in time.
  await page
    .getByRole("button", { name: /Indonesia|Flores/ })
    .first()
    .click();
  const row = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first();
  await row.click();

  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  const first = await panel.innerText();

  // Labelled with the neighbour's magnitude, because the useful question in a swarm is how big it was.
  const step = panel.getByRole("button", { name: /(previous|next) event in this sequence/ }).first();
  await expect(step).toBeVisible();
  await step.click();

  // A different event, still a panel: the pin moved rather than the panel closing or reloading.
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await panel.innerText()) !== first, { timeout: 8_000 }).toBe(true);
  await expect(panel).toContainText(/M \d+\.\d/);
});

test("the window buttons move the data and the headline follows", async ({ page }) => {
  /*
   * Three claims that only exist together in a browser: the window is a control, the control reaches the
   * data, and the headline counts what is on the globe rather than what is in the buffer. The last is why
   * this test exists - the number was the held total, so every filter moved the picture and left it still.
   */
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const headline = page.locator(".zone-rail .text-\\[48px\\]");
  const count = async (): Promise<number> => Number((await headline.innerText()).replace(/[^0-9]/g, ""));

  // Settle before measuring. The two feeds seed independently, and a baseline taken from a moving total
  // made narrowing the window produce a larger number.
  let whole = 0;
  await expect
    .poll(
      async () => {
        const seen = await count();
        const stable = seen > 0 && seen === whole;
        whole = seen;
        return stable;
      },
      { timeout: 30_000, intervals: [1_500] },
    )
    .toBe(true);

  // A week reaches further back than a day, so it can only hold more. The fixture is a day wide, so the count
  // need not grow, but the label and the permalink both have to follow the button.
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(page.getByText("last 7 days")).toBeVisible();
  expect(await count()).toBeGreaterThanOrEqual(whole);

  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 5_000 })
    .toMatch(/&w=168&/);

  // Back to the day. Narrowing refetches nothing, so this is the filter alone doing the work.
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await expect(page.getByText("last 24 hours")).toBeVisible();
  await expect.poll(count, { timeout: 5_000 }).toBeLessThanOrEqual(whole);
});

test("holding a bucket on the strip reads it, and lets go", async ({ page }) => {
  /*
   * The globe knows where and the strip knows when, and neither could answer the other's question. What is
   * asserted here is the observable half: the strip reports the bucket under the pointer and stops when the
   * pointer leaves. The veil itself is gated by the perf test.
   */
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const strip = page.locator("[data-ramp]").filter({ has: page.locator(".gap-px") });
  const readout = strip.locator("span.font-mono").first();
  await expect(readout).toHaveText(/^peak \d+ · /);

  // Two thirds along, so it lands on a bucket the seed covers rather than on the newest bar.
  // `button`, not `div`: the bars became real buttons when holding an hour stopped being mouse-only.
  const bars = strip.locator(".gap-px > button");
  await bars.nth(Math.floor((await bars.count()) * 0.66)).hover();
  await expect(readout).toHaveText(/^\d+ events? · (latest|\d+[hd] ago)$/);

  // Off the strip entirely, which is what releases it.
  await page.locator('.zone-rail [data-rail="headline"]').hover();
  await expect(readout).toHaveText(/^peak \d+ · /);
});

test("a revised magnitude says what the agency first said", async ({ page }) => {
  /*
   * The one test here that routes a feed instead of waiting on one: an agency reviewing an automatic
   * magnitude an hour later is not something a test can wait for. USGS's parser reads each feature
   * independently, so one payload carrying the same identifier twice exercises the real ingest path.
   */
  const feature = (mag: number, updated: number, depthKm = 24.6) => ({
    id: "ak0219neksb",
    properties: {
      mag,
      place: "88 km SW of Adak, Alaska",
      time: Date.now() - 20 * 60_000,
      updated,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [-177.3, 51.2, depthKm] },
  });

  await installFeeds(page, { usgs: [feature(6.1, 1), feature(6.4, 2, 41.2)] });

  // Filtered to M6 and above so the routed event is the only thing that can be in the list.
  await page.goto("/#at=-177,51,1&m=6&w=24&s=usgs&r=thermal");

  const row = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button", { name: /Adak/ });
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  // The row says so too, so the header's count is reachable rather than a statistic about an
  // invisible set, and the label carries the value rather than a dead-end word.
  await expect(row).toContainText("revised");
  // The row has no aria-label: its accessible name is computed from the content, so asserting the
  // name is asserting that the word actually reaches a screen reader rather than only a sighted one.
  await expect(row).toHaveAccessibleName(/revised/);

  const panel = page.locator(".zone-panel");
  // Both halves, and only the halves that moved.
  await expect(panel).toContainText("USGS first said M 6.1 → M 6.4, 25 km → 41 km deep");
  // The current value is what the headline and the marker use, not the first one.
  await expect(panel.locator(".text-\\[30px\\]")).toContainText("6.4");
  await expect(page.locator("header")).toContainText("revised");
});

test("before any data lands, the rail says what it is waiting for", async ({ page }) => {
  // This state used to read "Events 0" over "nothing yet · still filling": a number that meant nothing under
  // two disclaimers stacked by two independently reasonable branches.
  await installFeeds(page, { silent: true });

  await page.goto("/");
  const rail = page.locator(".zone-rail");
  await expect(rail).toContainText("Asking USGS and EMSC for the last day.");
  await expect(rail).not.toContainText("nothing yet");
  await expect(rail).not.toContainText("still filling");
  // No headline either: an empty count is not a count.
  await expect(rail.locator(".text-\\[48px\\]")).toHaveCount(0);
  // Writing this test turned up two more of the same kind. The strip reported "nothing yet" beside
  // the sentence, and the list blamed the filters for a feed that had not answered yet.
  await expect(rail).toContainText("Waiting for the first events.");
  await expect(rail).not.toContainText("No events match");
  await expect(rail).not.toContainText("not quiet hours");

  // Both tracks on screen from the first frame, empty, and saying which state they are in. The sentence above
  // says the app is asking two agencies; these say which has replied.
  const activity = page.locator("[data-activity]");
  await expect(activity).toContainText("USGS");
  await expect(activity).toContainText("EMSC");
  // "waiting", not "no backlog": a feed still being waited for resolves itself and a refused one does
  // not, and this fixture never answers rather than refusing.
  expect(await activity.locator("text=waiting").count()).toBe(2);
  await expect(activity).not.toContainText("no answer");
  // Nothing drawn on either track until a feed vouches for something.
  const filled = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("[data-activity] .relative > span")).filter(
        (el) => el.getBoundingClientRect().width > 0.5,
      ).length,
  );
  expect(filled).toBe(0);
});

test("the sequence says whether the big one has already happened", async ({ page }) => {
  /*
   * The question anybody has when they click an earthquake in a swarm, and the one the panel could not
   * answer: it said how many neighbours and how far, never when. Routed rather than waited on, for the same
   * reason as the revision test.
   */
  const at = (mag: number, minutesAgo: number, id: string, dLat = 0) => ({
    id,
    properties: {
      mag,
      place: `${id} near Ruteng, Indonesia`,
      time: Date.now() - minutesAgo * 60_000,
      updated: 1,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [120.5, -8.6 + dLat, 20] },
  });

  await installFeeds(page, {
    usgs: [
      at(6.0, 180, "mainshock"),
      at(4.2, 150, "after1", 0.1),
      at(4.1, 90, "after2", 0.2),
      at(4.4, 30, "pinned", 0.3),
    ],
  });

  await page.goto("/#at=120,-8,1&m=4&w=24&s=usgs&r=thermal");

  const row = page
    .getByRole("region", { name: "Recent earthquakes" })
    .getByRole("button", { name: /pinned/ });
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const panel = page.locator(".zone-panel");
  // Only the side that has something on it is printed. The empty half read "0 after" beside an axis already
  // rendering "this event" on the right. Asserted as the rule rather than as the string.
  await expect(panel).toContainText("3 before");
  await expect(panel).not.toContainText("0 after");
  await expect(panel.getByText("this event")).toBeVisible();
  await expect(panel).toContainText("The largest nearby was M 6.0, 2.5h before this one.");
  // One tick per neighbour plus the chrome marker for the pinned event.
  await expect(panel.locator("[data-ramp] > div.relative > span")).toHaveCount(4);
});

test("notches compound off where the camera is heading", async ({ page }) => {
  needsDevHooks();
  /*
   * Ten fast notches must travel ten notches. Assigning `zoom` straight onto the camera made each one a
   * 14% step in a single frame; going through the spring fixed the staircase and, unguarded, let a burst
   * race the animation and arrive short.
   */
  await installFeeds(page, { silent: true });
  await page.goto("/#at=140,20,1&m=2&w=24&s=usgs&r=thermal");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
  // The entrance has to finish before the wheel means anything: a notch delivered mid-flight is added
  // to a camera that is still moving, and the resting zoom is then whatever the two happened to sum to.
  // This replaces a flat two-second wait, which was the same assumption with no way to be sure of it.
  await cameraStill(page);

  // Well up the canvas. The timeline band owns the bottom of it now and takes its own wheel, so a point
  // that used to be open planet is a control - which is correct, and not what this test is about.
  await page.mouse.move(900, 220);
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);

  await cameraStill(page);
  // exp(0.264) twice is 1.696, and zoom is written to two places.
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/,1\.7&/);
});

test("the globe is operable from the keyboard, and the keys are written down", async ({ page }) => {
  // The canvas is aria-hidden and unfocusable on purpose, because the accessible feed is the screen-reader
  // interface. A sighted person with no mouse could not move the globe at all.
  await installFeeds(page, { silent: true });
  await page.goto("/#at=140,20,1&m=2&w=24&s=usgs&r=thermal");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });

  // The hints moved onto the map, next to the thing the keys move.
  const zones = page.locator(".zones");
  await expect(zones).toContainText("orbit");
  await expect(zones).toContainText("zoom");
  await expect(zones).toContainText("reset");

  // After the entrance has landed. Pressing during the flight compounds off a moving target, which is
  // correct behaviour and makes the destination depend on when the key arrived.
  // CAMERA_SETTLE_MS, not a shorter one of its own: on CI the eased flight was still 0.07 short at 15s.
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/^#at=140,20,1&/);

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/^#at=148,20,1&/);

  await page.keyboard.press("Equal");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/,1\.25&/);

  await page.keyboard.press("Digit0");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/^#at=145,12,1&/);

  // A focused control keeps its own arrows. One global handler that fired regardless of focus would
  // break every slider it sits next to.
  await page.locator("#mag").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".zones")).toContainText("Magnitude 2.1 and above");
  expect(await page.evaluate(() => window.location.hash)).toMatch(/^#at=145,12,1&/);
});

test("a dead feed says so, and does not claim a covered day", async ({ page }) => {
  /* Two bugs in one state. DESIGN.md 6 specifies a hairline notice naming the source and the retry, and
     `SourceStatus` carried both while nothing read them. See ARCHITECTURE.md#e2einteractionspects. */
  await installFeeds(page, { dead: true });
  await page.goto("/");

  const rail = page.locator(".zone-rail");
  await expect(rail).toContainText("USGS is not answering", { timeout: 25_000 });
  await expect(rail).toContainText("Retrying at");
  await expect(rail).toContainText("The globe keeps what it has.");

  /*
   * Nothing was fetched, so nothing is covered, and the headline says which of those it is. "Asking" stops
   * being true once both feeds have answered no. Asserted as the rule rather than the sentence: what this
   * defends is that a dead feed says so.
   */
  await expect(rail).not.toContainText("last 24 hours");
  await expect(rail).not.toContainText("Asking USGS and EMSC");
  await expect(rail).toContainText(/Neither feed is answering/);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("one finger orbits and two fingers zoom the globe", async ({ page }) => {
    needsDevHooks();
    // Touch had no coverage at all. The drag worked; the pinch was zooming the document, because the canvas
    // was `touch-action: auto` and the browser claims a two-finger gesture first.
    test.setTimeout(120_000);
    await installFeeds(page);
    await page.goto("/#at=140,20,1&m=2&w=24&s=usgs,emsc&r=thermal");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("canvas")).toHaveCSS("touch-action", "none");
    // Was a flat nine seconds. A drag delivered while the entrance is still flying is added to a moving
    // camera, so the test has to wait for stillness - and now waits exactly that long, not nine seconds.
    await cameraStill(page);

    const box = (await page.locator("canvas").boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
      .not.toMatch(/^#at=140,/);

    await page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector("canvas")!;
        const send = (type: string, points: [number, number][]): void => {
          points.forEach((p, i) =>
            canvas.dispatchEvent(
              new PointerEvent(type, {
                pointerId: i + 1,
                pointerType: "touch",
                clientX: p[0],
                clientY: p[1],
                bubbles: true,
                isPrimary: i === 0,
              }),
            ),
          );
        };
        send("pointerdown", [
          [x - 40, y],
          [x + 40, y],
        ]);
        for (let k = 1; k <= 6; k += 1)
          send("pointermove", [
            [x - 40 - k * 12, y],
            [x + 40 + k * 12, y],
          ]);
        send("pointerup", [
          [x - 112, y],
          [x + 112, y],
        ]);
      },
      [cx, cy],
    );

    // Spread fingers, so the globe comes closer rather than the page getting bigger.
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
      .toMatch(/,2\.\d&/);
  });

  test("the key hints are not offered to a device with no keys", async ({ page }) => {
    // Every entry names something touch cannot do. The row describes what works in the current view, so on a
    // phone the honest version is empty. The desktop test above asserts the pair: hidden here has to mean
    // "no keyboard", not "narrow".
    await installFeeds(page, { silent: true });
    await page.goto("/#at=140,20,1&m=2&w=24&s=usgs&r=thermal");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".key-hints")).toBeHidden();
  });
});

test("a pinned event the filters exclude says so", async ({ page }) => {
  // Raising the magnitude slider above a pinned event left the panel describing it in full beside a headline
  // reading 0 and a globe with nothing on it.
  const at = (mag: number, id: string) => ({
    id,
    properties: {
      mag,
      place: `${id} near Ruteng, Indonesia`,
      time: Date.now() - 30 * 60_000,
      updated: 1,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [120.5, -8.6, 20] },
  });

  await installFeeds(page, { usgs: [at(2.7, "small")] });

  await page.goto("/#at=120,-8,1&m=2&w=24&s=usgs&r=thermal");
  const row = page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button", { name: /small/ });
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText("Outside the current filters");

  await page.locator("#mag").fill("6");
  // Kept, because losing a pin to a nudged slider is worse than holding one. Named, because a full
  // panel beside an empty globe is the app describing something it is not showing.
  await expect(panel).toContainText("Outside the current filters");
  await expect(panel).toContainText("M 2.7");
  await expect(page.locator(".zone-rail .text-\\[48px\\]")).toHaveText("0");

  await page.locator("#mag").fill("2");
  await expect(panel).not.toContainText("Outside the current filters");
});

test("the rail names the largest event and flies to it", async ({ page }) => {
  // The list is newest first, so a magnitude 6 from eight hours ago sits forty rows below forty magnitude 2s.
  const at = (mag: number, id: string, agoMinutes: number, lon: number) => ({
    id,
    properties: {
      mag,
      place: `${id} region`,
      time: Date.now() - agoMinutes * 60_000,
      updated: 1,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [lon, -8.6, 20] },
  });

  await installFeeds(page, {
    usgs: [at(6.3, "mainshock", 480, 120), at(2.4, "newer", 5, -70), at(2.9, "newest", 2, -71)],
  });
  await page.goto("/#at=0,0,1&m=2&w=24&s=usgs&r=thermal");

  const largest = page.getByRole("button", { name: /Largest/ });
  await expect(largest).toBeVisible({ timeout: 25_000 });
  await expect(largest).toContainText("6.3");
  await expect(largest).toContainText("mainshock region");
  await expect(largest).toContainText("8h");

  // It is the shortest route to the event it names.
  await largest.click();
  await expect(page.locator(".zone-panel")).toContainText("M 6.3");
  /*
   * Compared as numbers within a degree, never against the rounded string: the readout prints whole
   * degrees, so a camera one degree out reads identical to one that arrived.
   */
  await expect
    .poll(
      async () => {
        const at = new URLSearchParams((await page.evaluate(() => window.location.hash)).slice(1)).get("at");
        const [lon, lat, zoom] = (at ?? "").split(",").map(Number);
        return Math.max(Math.abs((lon ?? 0) - 120), Math.abs((lat ?? 0) + 8.6), Math.abs((zoom ?? 0) - 1.9));
      },
      { timeout: 30_000 },
    )
    .toBeLessThan(1);
});

test("the globe unwraps into a map and back", async ({ page }) => {
  needsDevHooks();
  /* Double the budget, because this test costs about a full one. See ARCHITECTURE.md#e2einteractionspects. */
  test.setTimeout(90_000);
  // One geometry, projected in the vertex shader. Two scenes cross-faded would double every buffer and make
  // the switch a dissolve, which says nothing.
  await installFeeds(page);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first(),
  ).toBeVisible({ timeout: 25_000 });
  await cameraStill(page);

  const toggle = page.getByRole("button", { name: /^(Map|Globe)$/ });
  await expect(toggle).toHaveText("Map");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const globe = await page.locator("canvas").screenshot();
  await toggle.click();
  await expect(toggle).toHaveText("Globe");
  /*
   * A flat wait here, deliberately, where the camera assertions use `cameraStill`. The morph is an exponential
   * ease, so a stillness threshold tight enough to mean "finished" is reached many time constants after the
   * projection has visibly changed. This test only needs "changed enough to screenshot".
   */
  await page.waitForTimeout(2_500);

  const flat = await page.locator("canvas").screenshot();
  expect(flat.equals(globe)).toBe(false);

  // Remembered, because which projection somebody reads in is a preference, not a view.
  expect(await page.evaluate(() => localStorage.getItem("eif.flat"))).toBe("1");

  await toggle.click();
  await page.waitForTimeout(2_500);
  await expect(toggle).toHaveText("Map");
  expect(await page.evaluate(() => localStorage.getItem("eif.flat"))).toBe("0");
});

test("a shared camera survives the entrance", async ({ page }) => {
  // Regression. The entrance named the default framing as its destination and runs after the permalink has
  // aimed the camera, so every shared link arrived at the default view. Nothing threw.
  await installFeeds(page);
  await page.goto("/#at=-70.5,-33.5,2.4&m=2&w=24&s=emsc,usgs&r=thermal");
  await waitForData(page);
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 15_000 })
    .toMatch(/^#at=-70\.5,-33\.5,2\.4&/);
});

test("a link naming an event that has aged out says so", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/#at=140,35,1.4&m=2&w=24&s=emsc,usgs&r=thermal&e=usgs:us1000gonelongago");
  await waitForData(page);

  // Silently opening no panel would look like the link was broken. The app knows why, so it says
  // why, which is the same honesty the window's left edge gets.
  await expect(page.locator(".zone-rail")).toContainText("no longer in the window");
  await expect(page.locator(".zone-panel")).toHaveCount(0);
});

/*
 * Both edges of the rail are draggable, and both answer a keyboard. The failure they share is silent: a
 * splitter whose pointer handler works and whose keys do nothing looks finished. The width case also has to
 * survive a reload, since the whole argument for it is that the app should stop guessing.
 */
test("the rail resizes in both directions, by pointer and by key", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installFeeds(page, { count: 240 });
  await page.goto("/");
  await waitForData(page);

  const height = page.getByRole("separator", { name: "Regions height" });
  const before = Number(await height.getAttribute("aria-valuenow"));
  const rows = page.locator(".rail-regions button");
  const visibleRows = async (): Promise<number> => {
    const box = await page.locator(".rail-regions").boundingBox();
    let seen = 0;
    for (const row of await rows.all()) {
      const r = await row.boundingBox();
      if (r && r.y + r.height <= box!.y + box!.height + 1) seen += 1;
    }
    return seen;
  };
  const shownBefore = await visibleRows();

  const handle = await height.boundingBox();
  await height.hover();
  await page.mouse.down();
  await page.mouse.move(handle!.x + 40, handle!.y + 120, { steps: 10 });
  await page.mouse.up();

  // The box grew, and it grew into more regions rather than more padding.
  expect(Number(await height.getAttribute("aria-valuenow"))).toBeGreaterThan(before + 60);
  expect(await visibleRows()).toBeGreaterThan(shownBefore);

  /* Arrow keys, not just a pointer. Shift is the coarse step. See ARCHITECTURE.md#e2einteractionspects. */
  await height.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowUp");
  const keyed = Number(await height.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowUp");
  expect(Number(await height.getAttribute("aria-valuenow"))).toBe(keyed - 16);
  await page.keyboard.press("Shift+ArrowDown");
  expect(Number(await height.getAttribute("aria-valuenow"))).toBe(keyed + 32);

  const width = page.getByRole("separator", { name: "Rail width" });
  await width.focus();
  const wide = Number(await width.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  expect(Number(await width.getAttribute("aria-valuenow"))).toBe(wide + 16);

  // Both are remembered. Re-choosing a size on every visit is its own barrier.
  //
  // Wait for the write, not for a moment. Saving happens in an effect, so a reload fired straight after
  // the keypress can land before the effect has run and read back the size nobody chose.
  await expect
    .poll(async () => await page.evaluate(() => localStorage.getItem("eif.rail")))
    .toBe(String(wide + 16));
  await expect
    .poll(async () => await page.evaluate(() => localStorage.getItem("eif.regions")))
    .toBe(String(keyed + 32));
  await page.reload();
  await waitForData(page);
  expect(
    Number(await page.getByRole("separator", { name: "Rail width" }).getAttribute("aria-valuenow")),
  ).toBe(wide + 16);
  expect(
    Number(await page.getByRole("separator", { name: "Regions height" }).getAttribute("aria-valuenow")),
  ).toBe(keyed + 32);
});

/*
 * Shift-drag on the map draws a cross-section. The gesture is the risk, not the geometry: it has to take the
 * drag away from the camera without leaving a mode behind, and it has to read the same direction as the panel
 * it opens.
 */
test("a line dragged across the map opens a section through it", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installFeeds(page, { count: 400 });
  await page.goto("/#at=140,36,2.6&m=2&w=24");
  await waitForData(page);
  await page.getByRole("button", { name: "Map" }).click();
  await page.waitForTimeout(1400);

  const section = page.getByText("Cross-section", { exact: true });
  await expect(section).toHaveCount(0);
  // The hint row says so, on the map only. A gesture nobody is told about is not shipped.
  await expect(page.locator(".zone-canvas")).toContainText("shift-drag");

  const box = (await page.locator("canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.42;
  const before = page.url();

  const drag = async (ax: number, ay: number, bx: number, by: number): Promise<void> => {
    await page.keyboard.down("Shift");
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(bx, by, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  // Both ends named, so the reversed drag is the same segment and not a different one that happens to
  // be the same length.
  const west = [cx - 200, cy + 100] as const;
  const east = [cx + 200, cy - 80] as const;

  await drag(...west, ...east);
  await expect(section).toBeVisible();
  // Into the link, which is written on a one-second interval rather than on every state change.
  await expect.poll(() => page.url(), { timeout: 4000 }).toContain("x=");
  /* Found by the corridor width, not by the length: this looked for "km long", which the header stopped
     printing when the length moved to being read off the axis. */
  const band = page.locator(".zone-canvas").getByText(/km either side/);
  await expect(band).toContainText(/1:1|vertical/);
  // The camera did not move, which is the whole reason this listens in the capture phase. Compared on
  // the camera's own field, since the link has legitimately gained the section by now.
  const at = (url: string): string => new URLSearchParams(url.split("#")[1]).get("at")!;
  expect(at(page.url())).toBe(at(before));

  // The same line dragged the other way reads the same way. Measured on where the marks land, not on the
  // stated length, which is the same either way round and made the first version a tautology.
  const centroid = async (): Promise<number> => {
    const xs = await page
      .locator(".zone-canvas svg circle[fill]")
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute("cx"))));
    expect(xs.length).toBeGreaterThan(3);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const eastward = await centroid();
  await page.keyboard.press("Escape");
  await expect(section).toHaveCount(0);
  await drag(...east, ...west);
  await expect(section).toBeVisible();
  expect(await centroid()).toBeCloseTo(eastward, 0);

  // A shift-click with no drag is the undo, rather than a zero-length section reporting nothing found.
  await page.keyboard.down("Shift");
  await page.mouse.click(cx, cy);
  await page.keyboard.up("Shift");
  await expect(section).toHaveCount(0);
  // Polled: the permalink is written on a one-second interval, so reading it the instant the section
  // closes is a race against that tick rather than a statement about the link.
  await expect.poll(() => page.url(), { timeout: 5_000 }).not.toContain("x=");
});

/* A section survives being sent to somebody. It carries its own view, which no other field does: a section
   has nowhere to be drawn except the map. See ARCHITECTURE.md#e2einteractionspects. */
test("a link carrying a section opens on the map with the line drawn", async ({ browser }) => {
  needsDevHooks();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  try {
    await installFeeds(page, { count: 400 });
    await page.goto("http://localhost:31600");
    await page.evaluate(() => localStorage.setItem("eif.flat", "0"));

    await page.goto("http://localhost:31600/#at=140,36,2.6&m=2&w=24&x=134.2,31.5,146.1,41.2");
    await waitForData(page);

    await expect(page.getByText("Cross-section", { exact: true })).toBeVisible();
    // On the map, not on the globe: the toggle offers the way back rather than the way there.
    await expect(page.getByRole("button", { name: "Globe" })).toBeVisible();
    // And the line itself is on the canvas, not just the panel below it.
    const drawn = page.locator(".zone-canvas svg line[stroke-dasharray]");
    await expect(drawn).toHaveCount(1);
    expect(Number(await drawn.getAttribute("x2"))).toBeGreaterThan(Number(await drawn.getAttribute("x1")));

    // Closing it takes it out of the link, so the next copy is not a section somebody dismissed.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cross-section", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain("x=");
  } finally {
    await context.close();
  }
});

/*
 * A mark in the section is an event, not a dot. The section shipped read-only for a version. The other thing
 * this covers is the layout consequence: the panel it opens sits over the band the section is in.
 */
test("a mark in the cross-section pins the event it stands for", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installFeeds(page, { count: 400 });
  await page.goto("/#at=140,36,2.6&m=2&w=24&x=134.2,31.5,146.1,41.2");
  await waitForData(page);

  const band = page.locator(".zone-canvas");
  await expect(band.getByText("Cross-section", { exact: true })).toBeVisible();
  // The boundary the slab belongs to is marked, and the key for it only appears when it is.
  await expect(band).toContainText("plate boundar");

  /*
   * The clickable marks, not every circle. The slab is drawn in the same `svg` and it ships on now, so
   * `circle[fill]` put 1,583 `pointer-events: none` dots in front of the four this test is about.
   */
  const marks = band.locator("svg circle.cursor-pointer");
  await expect(marks.first()).toBeVisible();

  // Hovering names it in the header, in place of the section's own geometry.
  await marks.nth(3).hover();
  await expect(band).toContainText(/M \d\.\d · \d+ km/);

  await marks.nth(3).click();
  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  // By its own hook. ".font-mono first" used to be the magnitude scale and became the close key the
  // moment that key was set in lowercase mono, so the test read "esc" and still looked like it passed
  // something meaningful.
  const pinned = (await panel.locator("[data-magscale]").textContent())!;

  // The band stops where the panel starts. It ran to the right edge, so opening an event from the section hid
  // a fifth of the section behind it.
  const bandBox = (await band.locator("svg").last().boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(bandBox.x + bandBox.width).toBeLessThanOrEqual(panelBox.x + 1);

  // Clicking the same mark again unpins, so the mark is a toggle like the rows in the list.
  await marks.nth(3).click();
  await expect(panel).not.toBeVisible();
  expect(pinned).toMatch(/m[bl]|M[wc]/i);
});

/* The cursor, which only a browser can settle: the reveal limit reaches the event layer through a ref the
 * frame loop reads, and a unit test has neither the loop nor the layer. */
test("holding the cursor part way through draws part of the window", async ({ page }) => {
  // A day, asked for: the fixture spreads over 24 hours, so at the default week a cursor at 40% of the
  // strip reveals nothing. This test is about the cursor.
  await installFeeds(page, { count: 400 });
  await page.goto("/#w=24");
  const live = await waitForData(page);
  // Past the entrance, which drives the same reveal and would be the thing under test otherwise.
  await page.waitForTimeout(4000);

  await page.getByRole("slider", { name: "Time in the window" }).fill("400");
  await page.waitForTimeout(700);

  const held = Number(
    (
      await page
        .locator(".zone-rail div")
        .filter({ hasText: /^\d[\d,]*$/ })
        .first()
        .innerText()
    ).replace(/,/g, ""),
  );
  // Fewer than the whole window and more than none: forty percent of a day is a real count, and
  // both of the ways this breaks land on one of those two edges.
  expect(held).toBeLessThan(live);
  expect(held).toBeGreaterThan(0);
  // The headline says which state it is in rather than going on claiming the window's total.
  await expect(page.getByText("held", { exact: true })).toBeVisible();

  // Escape gives it back, and the count returns to what it was.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await expect(page.getByText("held", { exact: true })).toBeHidden();
});

test("playing advances the cursor against the wall clock", async ({ page }) => {
  // A day, asked for: the fixture spreads over 24 hours, so at the default week a cursor at 40% of the
  // strip reveals nothing. This test is about the cursor.
  await installFeeds(page, { count: 400 });
  await page.goto("/#w=24");
  await waitForData(page);
  await page.waitForTimeout(4000);

  await page.getByRole("button", { name: "Play the window through" }).click();
  await page.waitForTimeout(800);
  const early = Number(
    (
      await page
        .locator(".zone-rail div")
        .filter({ hasText: /^\d[\d,]*$/ })
        .first()
        .innerText()
    ).replace(/,/g, ""),
  );
  await page.waitForTimeout(2200);
  const later = Number(
    (
      await page
        .locator(".zone-rail div")
        .filter({ hasText: /^\d[\d,]*$/ })
        .first()
        .innerText()
    ).replace(/,/g, ""),
  );

  // Two readings, not one. The first version stepped by the interval it asked for rather than by the time
  // that passed, so a twelve second window took over fourteen. A single reading would have passed that.
  expect(later).toBeGreaterThan(early);
});

test("the transport has a keyboard path, and the keys are written down", async ({ page }) => {
  // The cursor and its play control shipped reachable by pointer only. Tab reaches both, but tabbing to a
  // clock to move it one bar is not a path anybody uses.
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);
  // Past the entrance, which drives the same reveal and would otherwise be the thing under test.
  await page.waitForTimeout(4000);

  const zones = page.locator(".zones");
  await expect(zones).toContainText("play");
  await expect(zones).toContainText("step");

  const cursor = page.getByRole("slider", { name: "Time in the window" });
  await expect(cursor).toHaveValue("1000");

  // A bar per press. The track is 0 to 1000 so a drag is smooth, which made the native arrow step a
  // thousandth of the window: three presses would read 997 here instead of 875.
  await page.keyboard.press(",");
  await page.keyboard.press(",");
  await page.keyboard.press(",");
  const three = Number(await cursor.inputValue());
  expect(Math.abs(three - (1000 - 3 * (1000 / 24)))).toBeLessThan(3);
  await expect(page.getByText("held", { exact: true })).toBeVisible();

  // Forward the same number of times comes back to live, rather than parking a second behind the
  // present with every event drawn and the headline still saying held.
  await page.keyboard.press(".");
  expect(Number(await cursor.inputValue())).toBeGreaterThan(three);
  await page.keyboard.press(".");
  await page.keyboard.press(".");
  await expect(cursor).toHaveValue("1000");
  await expect(page.getByText("held", { exact: true })).toBeHidden();

  // Space is the play button. From live it starts at the old edge, so the cursor is somewhere it was
  // not, and moving.
  await page.keyboard.press(" ");
  await page.waitForTimeout(700);
  const playing = Number(await cursor.inputValue());
  expect(playing).toBeLessThan(1000);
  await page.waitForTimeout(1200);
  expect(Number(await cursor.inputValue())).toBeGreaterThan(playing);

  await page.keyboard.press(" ");
  const paused = Number(await cursor.inputValue());
  await page.waitForTimeout(1000);
  // Within a unit, not equal: a parked cursor's fraction drifts as `to` moves under it, which is the
  // window sliding rather than the cursor going anywhere.
  expect(Math.abs(Number(await cursor.inputValue()) - paused)).toBeLessThan(2);

  // A focused control keeps its own keys, the same one rule the camera keys follow.
  await page.locator("#mag").focus();
  await page.keyboard.press(",");
  expect(Math.abs(Number(await cursor.inputValue()) - paused)).toBeLessThan(2);

  // On the transport itself the arrows are the step, where there is no camera to confuse them with.
  await cursor.focus();
  await page.keyboard.press("ArrowLeft");
  expect(paused - Number(await cursor.inputValue())).toBeGreaterThan(30);
});

test("the chrome says how far back each agency actually covers", async ({ page }) => {
  /*
   * EMSC's catalogue returns its most recent page whatever `start` asks for, so at a month USGS vouches for
   * thirty days and EMSC for eighteen hours, and nothing said where corroboration was even possible.
   *
   * Not scoped to the rail: the source toggles float onto the map at xl, so this asserts the fact.
   */
  // A day, because the fraction below is six hours of it. The default window is a week.
  await installFeeds(page, { count: 400, emscCappedHours: 6 });
  await page.goto("/#w=24");
  await waitForData(page);

  // On the activity strip, against its own axis, rather than on the source toggles: the axis is what the
  // durations have to be read against, and both would be the same span measured twice.
  const activity = page.locator("[data-activity]");
  // USGS has no result cap, so a successful fetch of a feed vouches for the whole of it.
  await expect(activity).toContainText("24h");
  // Six hours of a twenty-four hour window, which is the fixture's cap and not the window.
  await expect(activity).toContainText(/[56]h/);
  await expect(activity).toContainText("returns its most recent page whatever the window");
  await expect(activity).toContainText("Older events are USGS alone");

  // The bar has to be a fraction of the axis, not merely present. Widening the window widens USGS's bar and
  // leaves EMSC's where it was, and that difference is the whole point of drawing them.
  const emscWidth = async (): Promise<number> =>
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("[data-activity] .relative"));
      const row = rows.find((el) => el.parentElement?.textContent?.startsWith("EMSC"));
      const fill = row?.firstElementChild as HTMLElement | undefined;
      const track = row?.getBoundingClientRect().width ?? 1;
      return (fill?.getBoundingClientRect().width ?? 0) / track;
    });
  const atDay = await emscWidth();
  expect(atDay).toBeGreaterThan(0.15);

  // Scoped to the strip, which owns the window buttons wherever it is rendering.
  await page.locator("[data-activity]").getByRole("button", { name: "30d", exact: true }).click();
  await expect(activity).toContainText("30d");
  // A thirtieth of the axis it was, or thereabouts: the stub is the fact being stated loudly.
  await expect.poll(emscWidth, { timeout: 8_000 }).toBeLessThan(atDay / 3);
});

test("with both agencies covering the window, nothing is caveated", async ({ page }) => {
  // The note has to be absent when the thing it explains is absent, or it stops being read.
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);

  const activity = page.locator("[data-activity]");
  // Both bars full, and no caveat, because there is no asymmetry to caveat.
  await expect(activity).toContainText("USGS");
  await expect(activity).toContainText("EMSC");
  await expect(page.locator(".zones")).not.toContainText("most recent page");
});

test("the rail can be searched, and says what it cannot search", async ({ page }) => {
  /*
   * Four region rows were the entire navigation. There is no gazetteer and cannot be one under the no-key
   * constraint, so the half that matters most is the empty state: a real place with no seismicity looks
   * exactly like a typo unless the app says which it means.
   */
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(4000);

  const rail = page.locator('[data-rail="regions"]');
  await expect(rail).toContainText("Regions");

  // A region, which is authored navigation and is offered whether or not anything is happening in it.
  await page.getByLabel("Find").fill("japan");
  await expect(rail.getByRole("button", { name: /Japan & Kurils/ })).toBeVisible();
  // The results stand in the region rows rather than beside them, so the rail keeps its height.
  await expect(rail).not.toContainText("Regions");

  // A place, from what an agency wrote on the events currently held, grouped rather than listed.
  await page.getByLabel("Find").fill("flores");
  const flores = rail.getByRole("button", { name: /Flores Sea/ });
  await expect(flores).toBeVisible();
  await expect(flores).toContainText(/\d+ · M\d\.\d/);

  // Picking a place flies to its strongest event and pins it, so arriving explains itself.
  await flores.click();
  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Flores Sea/i);

  // Which of the two nothings this is.
  await page.getByLabel("Find").fill("paris");
  await expect(rail).toContainText("not a map of the world");

  // Escape is the innermost rung while there is a query, so it clears the box and not the pin.
  await page.getByLabel("Find").press("Escape");
  await expect(page.getByLabel("Find")).toHaveValue("");
  await expect(rail).toContainText("Regions");
  await expect(panel).toBeVisible();
});

test("enter takes the first result, so the box does not swallow the query", async ({ page }) => {
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(4000);

  await page.getByLabel("Find").fill("flores");
  await page.getByLabel("Find").press("Enter");
  // The first hit for a place-only query is the place, which pins as well as flies.
  await expect(page.locator(".zone-panel")).toContainText(/Flores Sea/i);
});

test("the map carries a scale, and it names the latitude it is true at", async ({ page }) => {
  /*
   * The flat map gave nothing to read a distance against. The interesting half is that on equirectangular a
   * horizontal bar is only true where it is drawn: the same pixels cover half the ground at sixty degrees.
   */
  await installFeeds(page, { count: 200, silent: false });
  await page.goto("/#at=140,0,0.9&m=6");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(4000);

  const scale = page.locator("[data-scale]");
  // Asserted on opacity, not on visibility. The bar fades rather than unmounting, so Playwright rightly calls
  // an `opacity: 0` element visible.
  const shown = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-scale]")!).opacity);
  // Nothing on the globe: a ball carries its own size and nobody reads a distance off one.
  expect(await shown()).toBe("0");

  await page.getByRole("button", { name: "Map" }).click();
  await expect.poll(shown, { timeout: 10_000 }).toBe("1");
  await expect(scale).toContainText(/^[\d,]+ km at 0°$/);
  // The rule, by its own hook. Matching on the text instead found the Globe's root div, whose text
  // contains the label too, and measured the selection ring inside it: equal every time, for nothing.
  const ruleWidth = () =>
    page.evaluate(() => document.querySelector("[data-scale] > div")?.getBoundingClientRect().width ?? 0);
  const atEquator = await ruleWidth();
  expect(atEquator).toBeGreaterThan(20);

  // North, and the bar has to change. The camera keys only fire while nothing has focus, which the Map button
  // still had, so the blur is the part that makes this test test anything.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(1200);

  await expect(scale).toContainText(/km at \d+°N$/);
  const atLatitude = await ruleWidth();
  // Longer, for the same round number of kilometres. If this ever comes back equal, the `cos` has been
  // dropped and the bar is quoting an equatorial measurement over Alaska.
  expect(atLatitude).toBeGreaterThan(atEquator + 5);
});

test("the legend says what a ring is, since nothing else did", async ({ page }) => {
  /*
   * The rings are the signature of the design and were the one mark with no explanation. A ring appears when
   * an event lands, expands for fifteen seconds and is gone, so a first-time viewer gets one look at it. The
   * multiplier is part of the claim rather than a footnote to it.
   */
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);

  const zones = page.locator(".zones");
  await expect(zones).toContainText("two rings leave each new epicentre");
  // The gap is the reason there are two, so the sentence has to carry it and not just name them.
  await expect(zones).toContainText("how distance to a quake is measured");
  await expect(zones).toContainText("×20");
  /*
   * The "first motion is a seismogram term" sentence used to be asserted here and is gone on purpose: it
   * explained the app's own name while the app was called First Motion. The rename missed this string, and
   * the suite was not being run, so a stale expectation sat here green-until-executed.
   */

  // Once, not twice. The header carried a bare "wavefront ×20" that the sentence now states in the one place
  // it means something.
  expect(await zones.evaluate((el) => (el.textContent ?? "").split("×20").length - 1)).toBe(1);
});

test("the largest event is a way in, in time as well as in space", async ({ page }) => {
  /* The app opens on the present, which at a wide window is the least interesting moment it holds. The rail
     already named the strongest event and flew to it, and left the cursor live. See ARCHITECTURE.md#e2einteractionspects. */
  const now = Date.now();
  const features = [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `recent${i}`,
      properties: {
        mag: 2 + (i % 12) / 10,
        place: `Off Honshu ${i}`,
        time: now - i * 4 * 60_000,
        updated: now - i * 4 * 60_000,
        magType: "ml",
        type: "earthquake",
      },
      geometry: { coordinates: [141 + (i % 7) * 0.3, 38 - (i % 5) * 0.4, 30] },
    })),
    {
      id: "thebig",
      properties: {
        mag: 6.4,
        place: "Flores Sea",
        // Twenty hours back, so parking the cursor there is a visible move and not a rounding.
        time: now - 20 * 3_600_000,
        updated: now - 20 * 3_600_000,
        magType: "mww",
        type: "earthquake",
      },
      geometry: { coordinates: [122.4, -6.2, 45] },
    },
    // Aftershocks, inside the 150km the panel calls a neighbourhood and after the main shock. With the big one
    // alone in the Flores Sea the panel correctly answered "on its own, so far", which demonstrates nothing.
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `after${i}`,
      properties: {
        mag: 3 + (i % 9) / 10,
        place: "Flores Sea",
        time: now - 20 * 3_600_000 + (i + 1) * 6 * 60_000,
        updated: now - 20 * 3_600_000 + (i + 1) * 6 * 60_000,
        magType: "ml",
        type: "earthquake",
      },
      geometry: { coordinates: [122.4 + (i % 5) * 0.12, -6.2 - (i % 4) * 0.1, 40] },
    })),
  ];
  await installFeeds(page, { usgs: features });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(4000);

  const live = Number(
    (
      await page
        .locator(".zone-rail div")
        .filter({ hasText: /^\d[\d,]*$/ })
        .first()
        .innerText()
    ).replace(/,/g, ""),
  );

  const largest = page.locator('[data-rail="largest"]');
  await expect(largest).toContainText("6.4");
  await largest.click();
  await page.waitForTimeout(900);

  // Space: the panel opens on the event it named.
  const panel = page.locator(".zone-panel");
  await expect(panel).toContainText("M 6.4");
  // With its sequence, which is the half of this the plan asked for by name.
  await expect(panel).toContainText("Sequence");

  // Time: the window is held at that moment rather than at the present.
  await expect(page.getByText("held", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "go live" })).toBeVisible();
  // And the globe is drawing that moment, not the end state. Twenty hours back of this fixture is the big one
  // and nothing else, against forty-one events live.
  const held = Number(
    (
      await page
        .locator(".zone-rail div")
        .filter({ hasText: /^\d[\d,]*$/ })
        .first()
        .innerText()
    ).replace(/,/g, ""),
  );
  expect(held).toBeLessThan(live);
  expect(held).toBeGreaterThan(0);

  // Escape gives the present back and keeps the pin: one rung at a time, innermost first.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await expect(page.getByText("held", { exact: true })).toBeHidden();
  await expect(panel).toContainText("M 6.4");
});

test("a section can be opened from the panel, not only by a gesture", async ({ page }) => {
  // `CrossSection` was reachable by shift-dragging the map and by nothing else: undiscoverable with a mouse
  // and impossible on a touch screen, where there is no shift to hold.
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(4000);

  // From the largest, which is in a margin and so has a trend to cut across.
  await page.locator('[data-rail="largest"]').click();
  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Slice here" }).click();
  await page.waitForTimeout(1200);

  // A section only exists on the map, so taking it goes there rather than opening over a globe with
  // no line on it. Same reasoning a shared link carrying a section already follows.
  await expect(page.getByRole("button", { name: "Globe" })).toBeVisible();
  await expect(page.locator(".zones")).toContainText(/Cross-section|Section/);
  // And it is in the permalink, so the slice somebody found this way is shareable.
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: CAMERA_SETTLE_MS })
    .toMatch(/[&#]x=/);
});

test("the key folds away and the controls do not go with it", async ({ page }) => {
  // Five layers made the legend seven paragraphs. The risk in folding it is folding the wrong half: the
  // slider is how you change what is on the globe, and it has to survive the fold.
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  /*
   * Filtered to the visible copy. The key is mounted twice - the canvas corner from `md` up, the rail on a
   * phone - and only one is ever shown, so `.first()` picks by DOM order and lands on the hidden one.
   */
  const only = (text: string) => page.getByText(text).filter({ visible: true });
  const key = only("What the marks mean");
  const explanation = only("size shows it too");
  const slider = page.locator("#mag");

  // The glossary starts folded; the filter remains visible before and after opening it.
  await expect(explanation).toHaveCount(0);
  await expect(slider).toBeVisible();
  await key.click();
  await expect(explanation).toBeVisible();
  await expect(slider).toBeVisible();

  // The feeds fold on their own, because they are set once. Behind the fold, not gone.
  const feeds = only("Feeds and layers");
  await expect(feeds).toBeVisible();
  // `exact`, or the accessible name of every event row that names its agency matches too.
  const usgs = page.getByRole("button", { name: "USGS", exact: true });
  await expect(usgs).toBeHidden();
  await feeds.click();
  await expect(usgs).toBeVisible();

  await key.click();
  await expect(explanation).toHaveCount(0);
  await expect(slider).toBeVisible();

  // Remembered, because a panel somebody closed is a preference too.
  await page.reload();
  await waitForData(page);
  await expect(only("size shows it too")).toHaveCount(0);
  await expect(page.locator("#mag")).toBeVisible();

  await only("What the marks mean").click();
  await expect(only("size shows it too")).toBeVisible();
});

/*
 * The share link, which is the one promise this app makes to somebody who is not looking at it. Every other
 * failure is visible to the person who caused it; a link that opens the right globe and the wrong event is
 * indistinguishable from a working link until the two of them are in the same room.
 */
test("a copied link reopens the same event, not merely the same view", async ({ page, context }) => {
  // Two cold loads of a WebGL app in one test, which is genuinely more than the default allows.
  test.setTimeout(120_000);
  await installFeeds(page, { count: 400 });
  await page.goto("/#at=145,12,1&m=2&w=24&s=usgs,emsc&r=thermal");
  await waitForData(page);

  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  const panel = page.locator('.zone-panel[data-open="true"]');
  await expect(panel).toBeVisible();

  // The magnitude scale by its own hook, because that is the field that says which reading this is. Two events
  // in the same region at the same minute would agree on almost everything else.
  const scale = await panel.locator("[data-magscale]").textContent();
  const place = await panel
    .locator("[data-magscale]")
    .locator("xpath=../following-sibling::div[1]")
    .textContent();
  const href = await page.evaluate(() => window.location.href);
  expect(href).toContain("&e=");

  // A cold page, not a reload: the link has to work for somebody who has never opened this app.
  const opened = await context.newPage();
  await installFeeds(opened, { count: 400 });
  await opened.goto(href);

  const reopened = opened.locator('.zone-panel[data-open="true"]');
  await expect(reopened).toBeVisible({ timeout: 30_000 });
  await expect(reopened.locator("[data-magscale]")).toHaveText(scale ?? "");
  if (place) await expect(reopened).toContainText(place.trim());
  /*
   * The same event id, which is the promise. Deliberately not the same camera: a link carrying an event flies
   * to it during setup, so the sender's framing is a starting point rather than a guarantee, and a test that
   * asserted otherwise would be asserting the bug.
   */
  const hash = await opened.evaluate(() => window.location.hash);
  expect(hash).toContain("e=");
  expect(hash.split("e=")[1]).toBe(href.split("e=")[1]);
});

/*
 * The tour's narration, which is the whole of its licence to move the camera. The label and the flight were
 * set on the same tick, so for the first few seconds of every stop the rail named the destination while the
 * globe still showed the last one: "Japan & Kurils · 685 events" at longitude -82.8, which is Chile.
 */
test("the tour names where the camera is, not where it is going", async ({ page }) => {
  /*
   * Reads the live camera rather than the hash. Sampling `location.hash` failed at "California" with the
   * camera at -83, which looked like the bug returning and was the throttle: the hash trails the camera by
   * enough to pair a fresh label with a stale position.
   */
  needsDevHooks();
  // A tour stop is about six seconds, so seeing several of them takes longer than the default allows.
  test.setTimeout(120_000);
  await installFeeds(page, { count: 6000 });
  await page.goto("/#at=145,12,1&m=2&w=24&s=usgs,emsc&r=thermal");
  await waitForData(page);

  await page.getByRole("button", { name: /^Tour$/ }).click();

  // Sampled in the page rather than by polling from here: a round trip per sample is slower than the stop it
  // is trying to observe, and a sparse series lands on the transitions and manufactures its own findings.
  /*
   * Collected to a target rather than for a fixed number of ticks. A count is a guard, not the
   * assertion: what matters is that the cursor advances against the wall clock, so a slow machine takes
   * longer and asserts the same thing.
   */
  const named = await page.evaluate(async () => {
    const seen: { name: string; lon: number }[] = [];
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && seen.length < 12) {
      // 150ms, not 300. The arrived window inside a stop is under a second on a busy machine, and the
      // sampler has to land in it more than twice.
      await new Promise((r) => {
        setTimeout(r, 150);
      });
      const head = (document.querySelector("[data-rail=headline]")?.textContent ?? "").replace(/\s+/g, " ");
      const label = /\d\/\d\s*([^·]+)·/.exec(head);
      const globe = (window as unknown as { __globe?: { state: () => { lon: number } } }).__globe;
      if (label && globe) seen.push({ name: label[1]!.trim(), lon: globe.state().lon });
    }
    return seen;
  });

  // Above zero, not above two. The count is only proof the tour narrated; how many samples land inside an
  // arrived window is a fact about the machine, and a runner caught exactly 2. The loop below is the test.
  expect(named.length, "the tour never narrated at all").toBeGreaterThan(0);

  /** Where each region sits, from `regions.ts`. Only the ones the tour can reach on this fixture. */
  const at: Record<string, number> = {
    "Japan & Kurils": 142,
    Kamchatka: 160,
    Indonesia: 118,
    Philippines: 124,
    "Tonga & Kermadec": -175,
    "Alaska & Aleutians": -155,
    California: -120,
    "Chile & Peru": -71,
    "Mediterranean & Turkey": 28,
    "Hindu Kush & Himalaya": 75,
    "Mid-Atlantic Ridge": -30,
  };
  for (const sample of named) {
    const want = at[sample.name];
    if (want === undefined) continue;
    // Shortest way round, so a stop at 175E is not judged 350 degrees from one at 175W.
    let off = Math.abs(sample.lon - want) % 360;
    if (off > 180) off = 360 - off;
    // Ten degrees, which is tight enough to mean something: the narration is gated on the camera being within
    // four of the stop. The failure this exists for was a hemisphere.
    expect(off, `narrated "${sample.name}" while the camera was at ${sample.lon}`).toBeLessThan(10);
  }
});

/* The two ways the panel moves the camera, and the fact that they pull opposite ways. Opening it flies to
   the epicentre; "Far side" draws five circles spanning the planet, so it has to pull back. See
   ARCHITECTURE.md. */
test("pinning flies in, and the far side pulls back to the same place", async ({ page }) => {
  // Three eased flights in one test, each of which has to settle before the next is measured.
  test.setTimeout(120_000);
  await installFeeds(page, { count: 400 });
  await page.goto("/#at=145,12,1&m=2&w=24&s=usgs,emsc&r=thermal");
  await waitForData(page);
  await cameraStill(page);

  await page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first().click();
  const panel = page.locator('.zone-panel[data-open="true"]');
  await expect(panel).toBeVisible();

  const near = await cameraStill(page);
  // In, not merely elsewhere: the default framing is 1, so a pin that did nothing would pass a test that
  // only checked the camera had moved off its start. `Math.max(zoom, 1.9)` lands exactly on the floor from
  // a default camera, which is why this is not a strict `>`.
  expect(near.zoom).toBeGreaterThanOrEqual(1.9);

  const farSide = panel.getByRole("button", { name: "Far side" });
  await expect(farSide).toHaveAttribute("aria-pressed", "false");
  await farSide.click();
  await expect(farSide).toHaveAttribute("aria-pressed", "true");
  const wide = await cameraStill(page);

  // Pulled back far enough to hold the figure, and pointed at the same place. The antipode is half a planet
  // away and the camera deliberately does not go there: what is being framed is the whole sphere.
  expect(wide.zoom).toBeLessThan(1.1);
  expect(Math.abs(wide.lon - near.lon)).toBeLessThan(1);
  expect(Math.abs(wide.lat - near.lat)).toBeLessThan(1);

  // A toggle, not a one-way door: it was offered rather than drawn, so it can be put away.
  await farSide.click();
  await expect(farSide).toHaveAttribute("aria-pressed", "false");
});

/*
 * What gets spoken, and what deliberately does not. `announce.ts` states the trade: an event published
 * unusually late passes unannounced, because the other direction floods somebody's screen reader on every page
 * load. The window is one edit away from being widened to "fix" a late publisher.
 */
test("the live region speaks a new event and stays silent about an old one", async ({ page }) => {
  test.setTimeout(120_000);

  const at = (mag: number, minutesAgo: number, id: string) => ({
    id,
    properties: {
      mag,
      place: `${id} near Sendai, Japan`,
      time: Date.now() - minutesAgo * 60_000,
      updated: 1,
      magType: "mww",
      type: "earthquake",
    },
    geometry: { coordinates: [142, 38, 25] },
  });

  // One inside the thirty-minute window and one well outside it, both above the threshold and both unseen.
  // "Unseen" was once the whole test, and let a seed of hours-old events announce itself on a cold load.
  await installFeeds(page, { usgs: [at(5.6, 4, "justnow"), at(6.4, 240, "hoursago")] });
  await page.goto("/#at=142,38,2&m=2&w=24&s=usgs&r=thermal");
  await waitForData(page);

  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText("justnow", { timeout: 25_000 });
  // The louder one is the silent one. `hoursago` is the larger magnitude and would win any ranking; it is four
  // hours old, so it is not news however big it was.
  await expect(live).not.toContainText("hoursago");
});

/*
 * The sound toggle, which is a device handle rather than a preference. A leaked `AudioContext` is a tab a
 * browser eventually marks as making noise. What only a browser can settle is whether the handle is opened at
 * the right moment and never before.
 */
test("sound opens no audio device until it is asked to", async ({ page }) => {
  test.setTimeout(120_000);

  // Counted rather than mocked away: the app still gets a real context, and the test sees each one made.
  await page.addInitScript(() => {
    const w = window as unknown as { made: number; AudioContext: unknown };
    w.made = 0;
    const Real = w.AudioContext as new () => AudioContext;
    class Counted extends (Real as new () => AudioContext) {
      constructor() {
        super();
        w.made += 1;
      }
    }
    w.AudioContext = Counted;
  });

  await installFeeds(page, { count: 400 });
  await page.goto("/#at=145,12,1&m=2&w=24&s=usgs,emsc&r=thermal");
  await waitForData(page);

  const made = () => page.evaluate(() => (window as unknown as { made: number }).made);
  // A page that has never been asked for sound has no business holding a device open.
  expect(await made()).toBe(0);

  const toggle = page.getByRole("button", { name: /^Sound (on|off)$/ });
  await expect(toggle).toHaveText("Sound off");
  await toggle.click();
  await expect(toggle).toHaveText("Sound on");
  await expect.poll(made, { timeout: 10_000 }).toBe(1);

  // And back off again, which is the half that leaks if nobody checks it.
  await toggle.click();
  await expect(toggle).toHaveText("Sound off");
  expect(await made()).toBe(1);
});

/*
 * Fullscreen used to hide the header, the rail and the bottom band, and the case against that is the one
 * the reader makes: a full screen showing a planet and nothing else is a screensaver. It makes the window
 * bigger and takes nothing away. What is drawn over the globe is now two folds of their own, tested below.
 */
test("fullscreen makes the window bigger and takes nothing away", async ({ page }) => {
  test.setTimeout(120_000);
  await installFeeds(page, { count: 400 });
  await page.goto("/#at=145,12,1&m=2&w=24&s=usgs,emsc&r=thermal");
  await waitForData(page);

  const chrome = (): Promise<Record<string, number | string | boolean>> =>
    page.evaluate(() => {
      const shown = (sel: string): boolean => {
        const el = document.querySelector(sel);
        return el !== null && (el as HTMLElement).checkVisibility();
      };
      return {
        head: shown("#chrome-head"),
        rail: shown("#chrome-rail"),
        hints: shown(".key-hints"),
        key: document.body.innerText.includes("What the marks mean"),
        panels: document.querySelectorAll(".zone-panel").length,
        full: document.fullscreenElement ? document.fullscreenElement.className : "",
      };
    });

  expect((await chrome()).full).toBe("");

  /*
   * `requestFullscreen` needs a gesture; the key is the app's own path in. Clicked well inside the canvas,
   * because it is full-bleed behind the header and 30px down lands on the wordmark. Focus handed back
   * afterwards: `f` is ignored while anything is focused.
   */
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
    force: true,
  });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("f");

  await expect.poll(async () => (await chrome()).full, { timeout: 10_000 }).toContain("frame");
  const during = await chrome();
  expect(during.head, "the bar stays").toBe(true);
  expect(during.rail, "the panel stays").toBe(true);
  expect(during.hints, "the key hints stay").toBe(true);
  expect(during.key, "the marks key stays").toBe(true);

  // Pinned from inside fullscreen, because the detail is the thing the mode used to trade away.
  await page.locator("section[aria-label='Recent earthquakes'] button").first().click();
  await page.waitForTimeout(900);
  const pinned = await chrome();
  expect(pinned.panels, "an event still opens its panel").toBeGreaterThan(0);
  // The key and the panel are the same edge, so the key stands down. That rule is not fullscreen's.
  expect(pinned.key, "the key yields to the panel, as it does everywhere").toBe(false);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(async () => (await chrome()).full, { timeout: 10_000 }).toBe("");
});

/*
 * The two folds that replaced it. Independent, remembered, and each offered only at the width where it
 * buys something - see `useFloatingChrome`. Each is reachable from where it left, too: the control that
 * folds a region goes with the region, so the one that unfolds it has to live somewhere else.
 */
test("the panel folds where it covers the globe, and stays folded", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);

  const chrome = (): Promise<{
    head: boolean;
    rail: boolean;
    resizer: number;
    hintsCentre: number;
    railWidth: number;
  }> =>
    page.evaluate(() => {
      const shown = (sel: string): boolean => {
        const el = document.querySelector(sel);
        return el !== null && (el as HTMLElement).checkVisibility();
      };
      const hints = document.querySelector(".key-hints")!.getBoundingClientRect();
      return {
        head: shown("#chrome-head"),
        rail: shown("#chrome-rail"),
        // The handle is a sibling of the rail rather than a child, so folding the rail leaves it behind:
        // measured once as a one-pixel bright line down a frame whose whole point is that it is empty.
        resizer: document.querySelector('[aria-label="Rail width"]')?.getBoundingClientRect().width ?? -1,
        hintsCentre: Math.round((hints.left + hints.right) / 2),
        railWidth: Math.round(document.querySelector("#chrome-rail")!.getBoundingClientRect().width),
      };
    });

  const open = await chrome();
  expect(open.rail).toBe(true);
  // The bar floats here, transparent, over a canvas that is the full height either way. Nothing to fold.
  await expect(page.getByLabel("Hide the top bar")).toHaveCount(0);

  await page.getByLabel("Hide the panel").click();
  await page.waitForTimeout(400);
  const folded = await chrome();
  expect(folded.rail, "the panel folds").toBe(false);
  expect(folded.head, "and the bar is still there").toBe(true);
  expect(folded.resizer, "the rail's handle goes with the rail").toBe(0);
  // `--rail-w` is what the bottom band is measured from, so the keys recentre on the whole canvas.
  expect(folded.hintsCentre, "the hints recentre").toBeLessThan(open.hintsCentre);

  await page.reload();
  await waitForData(page);
  expect((await chrome()).rail, "the panel is still folded").toBe(false);

  await page.getByLabel("Show the panel").click();
  await page.waitForTimeout(400);
  const back = await chrome();
  expect(back.rail).toBe(true);
  expect(back.hintsCentre).toBe(open.hintsCentre);

  /*
   * The rail comes back the width it was. It did not: the fold shipped storing "1" and "0" under `rail`,
   * which is where the rail's *width* is kept, so folding and unfolding wrote a width of 1 - and the next
   * load restored a 41px column with no handle to grab. Measured after a reload, because that is when the
   * damage showed.
   */
  await page.reload();
  await waitForData(page);
  await page.waitForTimeout(600);
  expect((await chrome()).railWidth, "the rail keeps its width across a fold").toBe(open.railWidth);
});

test("the bar folds where it is a row of its own, and stays folded", async ({ page }) => {
  /* A phone, which is the only width where the bar is a row of its own. From `md` up the chrome floats
     over a full-frame globe, so there is no row to reclaim and no fold offered. */
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);

  const bar = (): Promise<boolean> =>
    page.evaluate(() => {
      const el = document.querySelector("#chrome-head");
      return el !== null && (el as HTMLElement).checkVisibility();
    });

  expect(await bar()).toBe(true);
  // The rail is a sheet under the globe here, not a column over it, so it has no fold of its own.
  await expect(page.getByLabel("Hide the panel")).toHaveCount(0);

  // The fold lives in the overflow menu at this width: as a button of its own it wrapped the header.
  await page.getByRole("button", { name: "more" }).click();
  await page.getByRole("button", { name: "Hide bar" }).click();
  await page.waitForTimeout(400);
  expect(await bar(), "the bar folds").toBe(false);

  await page.reload();
  await waitForData(page);
  expect(await bar(), "and stays folded").toBe(false);

  await page.getByLabel("Show the top bar").click();
  await page.waitForTimeout(400);
  expect(await bar()).toBe(true);
});

/*
 * The fold has to cost the bar nothing to carry. As a button of its own it was the one control that would
 * not fit at 390: it wrapped onto a second line by itself and took the header from 46px to 80px, which is
 * the opposite of what folding the bar is for. It lives in the overflow menu now.
 */
test("the bar's own fold does not make the bar taller", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const head = document.querySelector("#chrome-head") as HTMLElement;
    const tops = new Set<number>();
    for (const child of Array.from(head.querySelectorAll("button, span"))) {
      const box = child.getBoundingClientRect();
      if (box.height > 0) tops.add(Math.round(box.top));
    }
    return { lines: tops.size, height: Math.round(head.getBoundingClientRect().height) };
  });
  // One line of controls. 68px is `py-3` either side of a 44px touch target, and is the height at every
  // width below 1280 whether the fold is drawn in the row or tucked in the menu.
  expect(rows.height, "the bar is one row tall").toBeLessThanOrEqual(68);

  // Reachable all the same, behind `more`, alongside the other three that fold away on a phone.
  await expect(page.getByRole("button", { name: "Hide bar" })).toBeHidden();
  await page.getByRole("button", { name: "more" }).click();
  await expect(page.getByRole("button", { name: "Hide bar" })).toBeVisible();
  await page.getByRole("button", { name: "Hide bar" }).click();
  await page.waitForTimeout(400);
  await expect(page.locator("#chrome-head")).toBeHidden();
});

/* A fold remembered at one width must not strand a viewer at another. The bar has no fold control above
   1280, so a stored "0" carried up there would hide it with nothing to press. */
test("a bar folded on a narrow screen is still there on a wide one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page);
  await page.addInitScript(() => window.localStorage.setItem("eif.head", "0"));
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(600);

  await expect(page.locator("#chrome-head")).toBeVisible();
});

/* The other half of the same defect. The drag handle bounds the width while you drag it; the restore path
   went straight into state and skipped that, so whatever was in storage was believed. */
test("a stored rail width outside the handle's range is brought back inside it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page);
  await page.addInitScript(() => window.localStorage.setItem("eif.rail", "1"));
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(600);

  const width = await page.evaluate(() =>
    Math.round(document.querySelector("#chrome-rail")!.getBoundingClientRect().width),
  );
  // 264 is the handle's own minimum. Anything under it is a column you cannot read or grab.
  expect(width).toBeGreaterThanOrEqual(264);
});

/* Guards two separate bugs that together made earthquakes untappable. See ARCHITECTURE.md#e2einteractionspects. */
test("a finger-width miss still opens the earthquake it was aimed at", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(1_200);

  /*
   * The first tap skips the intro, which otherwise clears the selection the second tap makes.
   * Empty sky, so it selects nothing of its own.
   */
  const tap = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const canvas = document.querySelector("canvas")!;
        for (const type of ["pointerdown", "pointerup"]) {
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: "touch",
              clientX: px,
              clientY: py,
              bubbles: true,
              isPrimary: true,
            }),
          );
        }
      },
      [x, y],
    );
  await tap(30, 90);
  await page.waitForTimeout(600);

  /*
   * A marker with nothing else within a finger of it, found by asking the pointer's own question.
   * Projecting a coordinate does not work here: markers are drawn at their depth, inside the planet, so
   * the surface point is tens of pixels from the thing you can see.
   */
  const aim = await page.evaluate(() => {
    const hit = (
      window as unknown as {
        __hitTest: (x: number, y: number, slopPx?: number) => string | null;
      }
    ).__hitTest;
    for (let y = 100; y < 540; y += 3) {
      for (let x = 24; x < 360; x += 3) {
        const key = hit(x, y);
        // 4 was the slop before this test existed, 18 is a finger's half-width.
        if (key && hit(x + 12, y, 4) === null && hit(x + 12, y, 18) === key) return { x, y, key };
      }
    }
    return null;
  });
  expect(aim, "an earthquake with clear space beside it").not.toBeNull();

  await tap(aim!.x + 12, aim!.y);
  await expect(page.locator(".zone-panel", { hasText: "Pinned event" })).toBeVisible();
});

/* Below 1280 the key has no edge of its own to sit on, so it goes back into the rail. Exactly one copy
   is ever in the tree, or the same paragraph is read out twice. */
test("the marks key is reachable at every width", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  for (const [w, h] of [
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    const shown = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("summary"))
          .filter((s) => /What the marks mean/.test(s.textContent || ""))
          .filter((s) => (s as HTMLElement).checkVisibility()).length,
    );
    expect(shown, `visible copies of the key at ${w}x${h}`).toBe(1);
  }
});

/* Where a pinned event lands on a phone, which is a question with a bar at one end and a sheet at the
   other. See ARCHITECTURE.md#e2einteractionspects. */
for (const [w, h] of [
  [390, 844],
  [360, 640],
  [412, 915],
] as const) {
  test(`a pinned event sits between the bar and the sheet at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await installFeeds(page, { count: 200 });
    await page.goto("/");
    await waitForData(page);
    await page.waitForTimeout(900);

    const row = page.locator("section[aria-label='Recent earthquakes'] button").first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    // Three seconds, because this is an eased flight and the assertion is about where it stops.
    await page.waitForTimeout(3_200);

    const seen = await page.evaluate(() => {
      // The app's own pinned ring, so this measures where the camera actually put the event.
      const pick = document.querySelector(".pick")!.getBoundingClientRect();
      const canvas = document.querySelector("canvas")!.getBoundingClientRect();
      const sheet = document.querySelector(".zone-panel")!.getBoundingClientRect();
      const top = canvas.top;
      const bottom = Math.min(canvas.bottom, sheet.top);
      return {
        marker: pick.top + pick.height / 2,
        top,
        bottom,
        centre: (top + bottom) / 2,
      };
    });

    // Inside the strip nothing covers, with room to spare at both ends.
    expect(seen.marker, "clear of the top bar").toBeGreaterThan(seen.top + 24);
    expect(seen.marker, "clear of the sheet").toBeLessThan(seen.bottom - 24);
    // And centred in it: the lift is arithmetic, not a guess, so this is tight on purpose.
    expect(Math.abs(seen.marker - seen.centre), "centred in the strip").toBeLessThan(8);
  });
}

/*
 * The still reaches the share sheet where there is one. A phone can do nothing useful with `a.download`,
 * which is exactly where this picture is worth having.
 *
 * The gesture has to survive the encode, so the PNG is built synchronously: `toBlob` hands its result back
 * in a later task, and a share refused for lost activation fails silently.
 */
test("Still hands the picture to the share sheet when there is one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFeeds(page, { count: 200 });
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: unknown };
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: { files?: File[] }) => {
        const file = data.files?.[0];
        w.__shared = file
          ? {
              name: file.name,
              type: file.type,
              size: file.size,
              transient: navigator.userActivation?.isActive,
            }
          : null;
        return Promise.resolve();
      },
    });
  });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(1_200);

  await page.getByRole("button", { name: "Still" }).click();
  const shared = await page.evaluate(
    () =>
      (window as unknown as { __shared?: { name: string; type: string; size: number; transient?: boolean } })
        .__shared,
  );

  expect(shared, "the sheet was handed a file").toBeTruthy();
  expect(shared!.type).toBe("image/png");
  expect(shared!.name).toMatch(/^everything-is-fine-.*\.png$/);
  // A real picture, not an empty canvas: the still is 1200 wide and carries its own caption.
  expect(shared!.size, "the PNG has something in it").toBeGreaterThan(20_000);
});

/*
 * The archive's field takes any day that has ended, and nothing about a box reading `YYYY-MM-DD` says so.
 * One sentence, not a second field: the first version of this shipped a duplicate control beside it.
 *
 * The caveat is the honest half. Before about 1970 only large events were recorded anywhere, and two of
 * the notable days offered below are 1960 and 1964.
 */
test("the archive field says what it takes, and warns about the thin years", async ({ page }) => {
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const field = page.getByLabel("Go to a day");
  /* The outermost of the wrappers holding the field, or `.last()` lands on the row holding the input and
     the go button, which is inside the block carrying the caption. */
  const block = page.locator("div", { has: field }).first();
  await expect(block).toContainText("including the one you were born on");

  await field.fill("");
  await field.type("1962");
  await expect(block).toContainText("nobody was listening");

  // And back, because the warning is about the year in the box rather than a state it latches.
  await field.fill("");
  await field.type("2020");
  await expect(block).toContainText("including the one you were born on");
});

test("a first visit saves no preference the visitor never chose", async ({ page }) => {
  /*
   * Every switch and slider persists itself. Saved on mount, a default is written as though it had been
   * chosen, and the day a default changes every existing visitor keeps the old one forever.
   *
   * The other direction, that a real choice is saved, is what the two fold tests above already show by
   * reloading and finding the fold where they left it.
   */
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("eif.")));
  expect(saved, "nothing was touched, so nothing is remembered").toEqual([]);
});
