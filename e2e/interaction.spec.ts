import { expect, test, type Page } from "@playwright/test";
import { installFeeds, waitForData } from "./feeds";

/*
 * The claims that only a browser can settle.
 *
 * Each is here because the alternative would have been to assert it in a unit test where the thing
 * under test is absent, or to claim it from reading the code. Deliberately not counted here: it said
 * four for most of the time it has held twenty-odd, which is what a number in a comment does.
 */

/** The rail's event count is the app's own signal that both feeds have answered. */
interface Camera { lon: number; lat: number; zoom: number; morph: number }

/*
 * `morph` is sampled alongside the camera because the projection unwrap is the same kind of thing: a
 * value easing toward a target that a test must not read halfway through. It keeps one helper honest for
 * both, since a screenshot taken mid-unwrap is neither a globe nor a map.
 */
/**
 * Whether this run is against `dist` rather than the dev server.
 *
 * A handful of tests reach for `window.__globe` and `window.__feed`, which `Globe.tsx` exposes only under
 * `import.meta.env.DEV`. That is the right call - a production bundle should not carry a debug surface -
 * and it means those tests cannot run against a build *by construction*, not because anything is broken.
 * Running the whole suite with `EIF_BUILD=1` before this existed failed seven tests with
 * `Cannot read properties of undefined (reading 'store')`, which reads like a bug and is a contract.
 *
 * Skipped rather than silently passed, for the reason the heap test gives for `skipIf` over an early
 * return: a run that did not check something should say so in the summary.
 */
const AGAINST_BUILD = process.env["EIF_BUILD"] === "1";

/** Call at the top of a test that needs the DEV-only hooks. */
function needsDevHooks(): void {
  test.skip(AGAINST_BUILD, "reads window.__globe / __feed, which a production build does not expose");
}

const cameraNow = (page: Page): Promise<Camera> => page.evaluate(() => {
  const globe = (window as unknown as {
    __globe: { state: () => Omit<Camera, "morph">; morph: () => number };
  }).__globe;
  return { ...globe.state(), morph: globe.morph() };
});

/**
 * Waits for the camera to stop moving, and returns where it stopped.
 *
 * Every camera assertion used to be written as "is it at the target yet, within N seconds", which asks
 * two questions at once and answers neither when it fails. The entrance spring is the clearest case: its
 * poll allowed ten seconds, and on a machine busy with other workers the run failed with
 * `Timeout 10000ms exceeded while waiting on the predicate` and `Received: false` - no indication of
 * whether the camera was still travelling, had stopped somewhere wrong, or had never started.
 *
 * So the two questions are separated. This one waits for **motion to stop**, however long the machine
 * takes about it, by sampling until two consecutive readings agree. Then the test asserts where it came
 * to rest, which is the actual claim. A slow machine now makes the suite slower instead of red, and a
 * camera that settles in the wrong place fails with the position it settled at.
 */
async function cameraStill(page: Page): Promise<Camera> {
  let last: Camera | null = null;
  await expect.poll(async () => {
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
  }, { timeout: 60_000, intervals: [250] }).toBeLessThan(1e-4);
  return last!;
}

test("the first frame is already live", async ({ page }) => {
  await installFeeds(page);
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
  /*
   * Compared as a number, not as a rendered string.
   *
   * This matched `M 2.9` against both, and broke when the list dropped the `M` prefix and kept it
   * only in the panel. The data never changed. A test that asserts formatting when it means to
   * assert identity fails on every redesign and teaches people that redesigns break tests.
   */
  const magnitude = (await panel.innerText()).match(/M (\d+\.\d)/)?.[1];
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
  await page.locator("canvas").evaluate((el) => { el.style.visibility = "hidden"; });
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

/*
 * The one claim that has been written down since step 3 and never observed.
 *
 * The context is built explicitly rather than through `test.use({ reducedMotion })`, because that
 * form silently did not reach the page in this Playwright version: `matchMedia` reported false
 * inside a block named "with reduced motion". The test passed its behavioural assertions anyway,
 * which is the worst possible outcome, so the emulation is asserted before anything else is.
 */
test("with reduced motion, there is no entrance and flying is instant", async ({ browser }) => {
  needsDevHooks();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await installFeeds(page);
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
 * A permalink has to survive leaving the machine that made it.
 *
 * The failure this guards against is subtle and would look like success: the store's key is an
 * arrival counter, so a link carrying `q12` restores *a* twelfth event, just not the same one. This
 * asserts the link names the event the way the agency does, and that a fresh page finds it again.
 */
test("a shared link restores the view on a fresh page", async ({ page }) => {
  /*
   * Twice the budget, because this test does twice the work: it opens a second page with its own
   * fixtures and its own WebGL globe. It exhausted the default 45s on a machine already running another
   * worker, which is the test's own cost rather than a claim about the app.
   */
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
  await expect.poll(async () => page.evaluate(() => window.location.hash), { timeout: 5_000 })
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
  await expect(fresh.getByRole("button", { name: /colourblind ramp/i }))
    .toHaveAttribute("aria-pressed", "true");
  // The same earthquake, not merely some earthquake.
  expect(await fresh.locator(".zone-panel").innerText())
    .toContain(pinnedText.match(/M \d+\.\d/)![0]);

  await fresh.close();
});

test("an hour can be held from the keyboard, and let go", async ({ page }) => {
  /*
   * The pointer half of this is above. This is the half that was on the open-limitations list: hover had
   * no keyboard equivalent, so a keyboard user could not ask which hour an event landed in, and the link
   * between the strip and the globe was an enhancement rather than a feature.
   */
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
  /*
   * The other half of the sequence strip. It could draw three hundred neighbours in time order and there
   * was no way to visit one: you could read the shape of a swarm and not step through it. This asserts
   * the step actually re-pins, which is the whole feature - the strip itself is gated by the perf test.
   */
  await installFeeds(page, { count: 200 });
  await page.goto("/");
  await waitForData(page);

  // Into the densest region, where a pinned event certainly has neighbours either side of it in time.
  await page.getByRole("button", { name: /Indonesia|Flores/ }).first().click();
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
   * Three claims that only exist together in a browser: the window is a control, the control
   * reaches the data, and the headline counts what is on the globe rather than what is in the
   * buffer. The last one is the reason this test exists. The number was the held total, so every
   * filter in the app moved the picture and left the biggest number in the rail sitting still.
   *
   * Widening rather than narrowing, since the window became three named lengths. Narrowing below a
   * day is no longer offered: a slider that picked any of twenty-four hours was also what fixed the
   * strip's bucket at an hour, which is what put a ceiling on the window at a day.
   */
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const headline = page.locator(".zone-rail .text-\\[38px\\]");
  const count = async (): Promise<number> =>
    Number((await headline.innerText()).replace(/[^0-9]/g, ""));

  /*
   * Settle before measuring. The two feeds seed independently and the first assertion read the
   * total mid-batch, so narrowing the window to four hours produced a *larger* number and the
   * test blamed the feature. A baseline taken from a moving total is not a baseline.
   */
  let whole = 0;
  await expect.poll(async () => {
    const seen = await count();
    const stable = seen > 0 && seen === whole;
    whole = seen;
    return stable;
  }, { timeout: 30_000, intervals: [1_500] }).toBe(true);

  /*
   * A week reaches further back than a day, so it can only hold more. The fixture is a day wide, so
   * the count need not grow, but the label and the permalink both have to follow the button.
   */
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(page.getByText("last 7 days")).toBeVisible();
  expect(await count()).toBeGreaterThanOrEqual(whole);

  await expect.poll(async () => page.evaluate(() => window.location.hash), { timeout: 5_000 })
    .toMatch(/&w=168&/);

  // Back to the day. Narrowing refetches nothing, so this is the filter alone doing the work.
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await expect(page.getByText("last 24 hours")).toBeVisible();
  await expect.poll(count, { timeout: 5_000 }).toBeLessThanOrEqual(whole);
});

test("holding a bucket on the strip reads it, and lets go", async ({ page }) => {
  /*
   * The globe knows where and the strip knows when, and neither could answer the other's question.
   * Hovering a bucket dims everything outside it, which only WebGL can show, so what is asserted here
   * is the half that is observable: the strip reports the bucket under the pointer, and stops when the
   * pointer leaves. The veil itself is gated by the perf test and looked at in a screenshot.
   *
   * Hovered on the bar rather than through a slider lying over the bars. The strip used to carry the
   * window control as well, and reading hover off the individual bars then meant the slider swallowing
   * every pointer event meant for them. The window moved to buttons, so the bars own their own hover.
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
  await page.locator(".zone-rail [data-rail=\"headline\"]").hover();
  await expect(readout).toHaveText(/^peak \d+ · /);
});

test("a revised magnitude says what the agency first said", async ({ page }) => {
  /*
   * The one test here that routes a feed instead of waiting on one, because revisions are real and
   * rare: an agency reviewing an automatic magnitude an hour later is not something a test can wait
   * for, and the panel that reports it would otherwise ship having never been looked at.
   *
   * The trick is that USGS's parser reads each feature independently, so one payload carrying the
   * same identifier twice with two magnitudes exercises exactly the ingest path a real revision
   * takes, an hour of waiting compressed into one response.
   */
  const feature = (mag: number, updated: number, depthKm = 24.6) => ({
    id: "ak0219neksb",
    properties: {
      mag, place: "88 km SW of Adak, Alaska", time: Date.now() - 20 * 60_000,
      updated, magType: "mww", type: "earthquake",
    },
    geometry: { coordinates: [-177.3, 51.2, depthKm] },
  });

  await installFeeds(page, { usgs: [feature(6.1, 1), feature(6.4, 2, 41.2)] });

  // Filtered to M6 and above so the routed event is the only thing that can be in the list.
  await page.goto("/#at=-177,51,1&m=6&w=24&s=usgs&r=thermal");

  const row = page.getByRole("region", { name: "Recent earthquakes" })
    .getByRole("button", { name: /Adak/ });
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
  /*
   * This state used to read "Events 0" over "nothing yet · still filling": a number that meant
   * nothing under two disclaimers stacked by two independently reasonable branches. Neither of them
   * was wrong on its own, which is why nobody had read the sentence they composed.
   */
  await installFeeds(page, { silent: true });

  await page.goto("/");
  const rail = page.locator(".zone-rail");
  await expect(rail).toContainText("Asking USGS and EMSC for the last day.");
  await expect(rail).not.toContainText("nothing yet");
  await expect(rail).not.toContainText("still filling");
  // No headline either: an empty count is not a count.
  await expect(rail.locator(".text-\\[38px\\]")).toHaveCount(0);
  // Writing this test turned up two more of the same kind. The strip reported "nothing yet" beside
  // the sentence, and the list blamed the filters for a feed that had not answered yet.
  await expect(rail).toContainText("Waiting for the first events.");
  await expect(rail).not.toContainText("No events match");
  await expect(rail).not.toContainText("not quiet hours");

  /*
   * Both tracks on screen from the first frame, empty, and saying which state they are in.
   *
   * The sentence above says the app is asking two agencies. These say which of them has replied, which
   * is the same architecture legible in the first second rather than a moment later, and it is the one
   * thing that state could not previously show.
   */
  const activity = page.locator('[data-rail="activity"]');
  await expect(activity).toContainText("USGS");
  await expect(activity).toContainText("EMSC");
  // "waiting", not "no backlog": a feed still being waited for resolves itself and a refused one does
  // not, and this fixture never answers rather than refusing.
  expect(await activity.locator("text=waiting").count()).toBe(2);
  await expect(activity).not.toContainText("no answer");
  // Nothing drawn on either track until a feed vouches for something.
  const filled = await page.evaluate(() => Array
    .from(document.querySelectorAll('[data-rail="activity"] .relative > span'))
    .filter((el) => el.getBoundingClientRect().width > 0.5).length);
  expect(filled).toBe(0);
});

test("the sequence says whether the big one has already happened", async ({ page }) => {
  /*
   * The question anybody actually has when they click an earthquake in a swarm, and the one the panel
   * could not answer: it said how many neighbours and how far, never when. An M4 with a larger event
   * three hours behind it is an aftershock; the same M4 with smaller ones after it is a mainshock.
   *
   * Routed rather than waited on, for the same reason as the revision test: real sequences exist and
   * cannot be scheduled.
   */
  const at = (mag: number, minutesAgo: number, id: string, dLat = 0) => ({
    id,
    properties: {
      mag, place: `${id} near Ruteng, Indonesia`, time: Date.now() - minutesAgo * 60_000,
      updated: 1, magType: "mww", type: "earthquake",
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

  const row = page.getByRole("region", { name: "Recent earthquakes" })
    .getByRole("button", { name: /pinned/ });
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const panel = page.locator(".zone-panel");
  // Three neighbours, all earlier than the pinned event.
  await expect(panel).toContainText("3 before · 0 after");
  await expect(panel).toContainText("The largest nearby was M 6.0, 2.5h before this one.");
  // One tick per neighbour plus the chrome marker for the pinned event.
  await expect(panel.locator("[data-ramp] > div.relative > span")).toHaveCount(4);
});

test("notches compound off where the camera is heading", async ({ page }) => {
  needsDevHooks();
  /*
   * Wheel zoom used to assign `zoom` straight onto the camera: one notch moved 14% in a single frame
   * while every `flyTo` in the app went through a spring. It now sets a target instead.
   *
   * What is asserted here is the part a test can settle. Two notches in quick succession must land on
   * two notches, which is only true if each one compounds off the *pending* target rather than off the
   * animated value it can see. Compounding off the current zoom is the natural way to write it and it
   * silently undershoots, because the second notch is measured against a camera still in flight.
   *
   * The smoothness itself is not asserted. Frame counting cannot tell the two apart, because Playwright
   * dispatches one notch as about eight wheel events and each wakes the loop for a frame either way.
   * The ramp was measured directly instead and the numbers are in ARCHITECTURE.md.
   */
  await installFeeds(page, { silent: true });
  await page.goto("/#at=140,20,1&m=2&w=24&s=usgs&r=thermal");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
  // The entrance has to finish before the wheel means anything: a notch delivered mid-flight is added
  // to a camera that is still moving, and the resting zoom is then whatever the two happened to sum to.
  // This replaces a flat two-second wait, which was the same assumption with no way to be sure of it.
  await cameraStill(page);

  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);

  await cameraStill(page);
  // exp(0.264) twice is 1.696, and zoom is written to two places.
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
    .toMatch(/,1\.7&/);
});

test("the globe is operable from the keyboard, and the keys are written down", async ({ page }) => {
  /*
   * The canvas is aria-hidden and unfocusable on purpose, because the accessible feed is the interface
   * for a screen reader. A sighted person with no mouse is a different user and could not move the
   * globe at all: no orbit, no zoom, no reset, and nothing on screen naming a single key.
   */
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
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 15_000 })
    .toMatch(/^#at=140,20,1&/);

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
    .toMatch(/^#at=148,20,1&/);

  await page.keyboard.press("Equal");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
    .toMatch(/,1\.25&/);

  await page.keyboard.press("Digit0");
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
    .toMatch(/^#at=145,12,1&/);

  // A focused control keeps its own arrows. One global handler that fired regardless of focus would
  // break every slider it sits next to.
  await page.locator("#mag").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".zones")).toContainText("Magnitude 2.1 and above");
  expect(await page.evaluate(() => window.location.hash)).toMatch(/^#at=145,12,1&/);
});

test("a dead feed says so, and does not claim a covered day", async ({ page }) => {
  /*
   * Two bugs in one state. DESIGN.md section 6 specifies a hairline notice naming the source and the
   * retry, and `SourceStatus` has carried both since the first source was written; nothing ever read
   * them, so the header said "one feed live" whether the other was connecting or refused.
   *
   * Worse, coverage was inferred from the first delivery that carried events. With the seed requests
   * dead and two stray socket pushes arriving, the rail read "0 events, last 24 hours": a complete day
   * claimed on the strength of two events it happened to be handed.
   */
  await installFeeds(page, { dead: true });
  await page.goto("/");

  const rail = page.locator(".zone-rail");
  await expect(rail).toContainText("USGS is not answering", { timeout: 25_000 });
  await expect(rail).toContainText("Retrying at");
  await expect(rail).toContainText("The globe keeps what it has.");

  // Nothing was fetched, so nothing is covered.
  await expect(rail).not.toContainText("last 24 hours");
  await expect(rail).toContainText("Asking USGS and EMSC for the last day.");
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("one finger orbits and two fingers zoom the globe", async ({ page }) => {
    needsDevHooks();
    /*
     * Touch had no coverage at all. The drag worked; the pinch was zooming the *document*, because
     * the canvas was `touch-action: auto` and the browser claims a two-finger gesture before the
     * pointer events reach the pinch handler that has been in controls.ts from the first version.
     */
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
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
      .not.toMatch(/^#at=140,/);

    await page.evaluate(([x, y]) => {
      const canvas = document.querySelector("canvas")!;
      const send = (type: string, points: [number, number][]): void => {
        points.forEach((p, i) => canvas.dispatchEvent(new PointerEvent(type, {
          pointerId: i + 1, pointerType: "touch", clientX: p[0], clientY: p[1],
          bubbles: true, isPrimary: i === 0,
        })));
      };
      send("pointerdown", [[x - 40, y], [x + 40, y]]);
      for (let k = 1; k <= 6; k += 1) send("pointermove", [[x - 40 - k * 12, y], [x + 40 + k * 12, y]]);
      send("pointerup", [[x - 112, y], [x + 112, y]]);
    }, [cx, cy]);

    // Spread fingers, so the globe comes closer rather than the page getting bigger.
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
      .toMatch(/,2\.\d&/);
  });

  test("the key hints are not offered to a device with no keys", async ({ page }) => {
    /*
     * Every entry names something touch cannot do: no arrow keys, no `+`, no `0`, no shift to hold and
     * no escape to press. The row's own rule is that it describes what works in the current view, so
     * on a phone the honest version of the list is empty rather than two wrapped lines of it.
     *
     * The desktop test above asserts the opposite, which is the pair that matters: hidden here has to
     * mean "no keyboard", not "narrow".
     */
    await installFeeds(page, { silent: true });
    await page.goto("/#at=140,20,1&m=2&w=24&s=usgs&r=thermal");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
    await expect(page.locator(".key-hints")).toBeHidden();
  });
});

test("a pinned event the filters exclude says so", async ({ page }) => {
  /*
   * Raising the magnitude slider above a pinned event left the panel describing it in full, with its
   * depth, its neighbours and its whole sequence, beside a headline reading 0 and a globe with nothing
   * on it. The same inconsistency the headline count was fixed for, one panel over.
   */
  const at = (mag: number, id: string) => ({
    id,
    properties: {
      mag, place: `${id} near Ruteng, Indonesia`, time: Date.now() - 30 * 60_000,
      updated: 1, magType: "mww", type: "earthquake",
    },
    geometry: { coordinates: [120.5, -8.6, 20] },
  });

  await installFeeds(page, { usgs: [at(2.7, "small")] });

  await page.goto("/#at=120,-8,1&m=2&w=24&s=usgs&r=thermal");
  const row = page.getByRole("region", { name: "Recent earthquakes" })
    .getByRole("button", { name: /small/ });
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
  await expect(page.locator(".zone-rail .text-\\[38px\\]")).toHaveText("0");

  await page.locator("#mag").fill("2");
  await expect(panel).not.toContainText("Outside the current filters");
});

test("the rail names the largest event and flies to it", async ({ page }) => {
  /*
   * The list is newest first, so a magnitude 6 from eight hours ago sits forty rows down while forty
   * magnitude 2s sit above it. The one fact a person actually wants was the hardest thing in the rail
   * to find.
   */
  const at = (mag: number, id: string, agoMinutes: number, lon: number) => ({
    id,
    properties: {
      mag, place: `${id} region`, time: Date.now() - agoMinutes * 60_000,
      updated: 1, magType: "mww", type: "earthquake",
    },
    geometry: { coordinates: [lon, -8.6, 20] },
  });

  await installFeeds(page, {
    usgs: [
      at(6.3, "mainshock", 480, 120),
      at(2.4, "newer", 5, -70),
      at(2.9, "newest", 2, -71),
    ],
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
  await expect
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 10_000 })
    .toMatch(/^#at=120,-8\.6,1\.9&/);
});

test("the globe unwraps into a map and back", async ({ page }) => {
  needsDevHooks();
  /*
   * Double the budget, because this test costs about a full one.
   *
   * It was failing with the projection toggle reading `""`, which looks like a broken header and was the
   * test being killed mid-assertion: a passing run measures **45.5s** against the default 45s, so it sat
   * exactly on its own ceiling and flipped with the weather. Nothing was erroring - `pageerror` and
   * `console` were both silent through a passing run, and the same sequence driven by hand in a browser
   * goes Map, Globe, Map with the projection stored correctly each time.
   *
   * The cost is real rather than wasteful: an entrance to wait out, two 2.5s morphs, and **two WebGL
   * canvas screenshots**, which are the expensive part. Same call as the two-page shared-link test - when
   * a test legitimately does twice the work, the budget is what should move, not the assertions.
   */
  test.setTimeout(90_000);
  /*
   * One geometry, projected in the vertex shader. Two scenes cross-faded would double every buffer and
   * every place a layer can be forgotten, and the switch would be a dissolve, which says nothing. A
   * planet unwrapping says what a projection *is*, which is the thing a flat map of earthquakes most
   * needs its viewer to understand.
   */
  await installFeeds(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Recent earthquakes" }).getByRole("button").first())
    .toBeVisible({ timeout: 25_000 });
  await cameraStill(page);

  const toggle = page.getByRole("button", { name: /^(Map|Globe)$/ });
  await expect(toggle).toHaveText("Map");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const globe = await page.locator("canvas").screenshot();
  await toggle.click();
  await expect(toggle).toHaveText("Globe");
  /*
   * A flat wait here, deliberately, where the camera assertions use `cameraStill`.
   *
   * The morph is an exponential ease, so its per-sample delta creeps toward zero and a stillness
   * threshold tight enough to mean "finished" is reached many time constants after the projection has
   * visibly changed. `cameraStill` is the right tool for "the camera arrived somewhere and I want to
   * assert where"; it is the wrong tool for "the picture has changed enough to screenshot". This test
   * only needs the second, and 2.5s against a 1.1s morph is twice over.
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
  /*
   * Regression. The entrance named the default framing as its destination and runs after the
   * permalink has already aimed the camera, so every shared link arrived at the default view.
   * Nothing threw and the entrance looked correct, which is exactly why the older test above,
   * checking the ramp and the pinned event, never noticed the third thing a link carries.
   */
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
 * Both edges of the rail are draggable, and both answer a keyboard.
 *
 * The width splitter shipped without coverage and the height one is new, and the failure they share
 * is silent: a splitter whose pointer handler works and whose keys do nothing looks finished and is
 * a control a keyboard user can see and cannot use. The width case also has to survive a reload,
 * since the whole argument for it is that the app should stop guessing.
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

  // Arrow keys, not just a pointer. Shift is the coarse step.
  await height.focus();
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
  await page.reload();
  await waitForData(page);
  expect(Number(await page.getByRole("separator", { name: "Rail width" })
    .getAttribute("aria-valuenow"))).toBe(wide + 16);
  expect(Number(await page.getByRole("separator", { name: "Regions height" })
    .getAttribute("aria-valuenow"))).toBe(keyed + 32);
});

/*
 * Shift-drag on the map draws a cross-section.
 *
 * The gesture is the risk here, not the geometry, which has its own unit tests. It has to take the
 * drag away from the camera without leaving a mode behind, and it has to read the same direction as
 * the panel it opens: a line dragged east to west put the map's right-hand end at the panel's zero and
 * nothing on screen said so.
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
  const band = page.locator(".zone-canvas").getByText(/km long/);
  await expect(band).toContainText(/km either side/);
  // The camera did not move, which is the whole reason this listens in the capture phase. Compared on
  // the camera's own field, since the link has legitimately gained the section by now.
  const at = (url: string): string => new URLSearchParams(url.split("#")[1]).get("at")!;
  expect(at(page.url())).toBe(at(before));

  /*
   * The same line dragged the other way reads the same way.
   *
   * Measured on where the marks land, not on the stated length, which is the same either way round
   * and made the first version of this a tautology that survived deleting the normalisation.
   */
  const centroid = async (): Promise<number> => {
    const xs = await page.locator(".zone-canvas svg circle[fill]").evaluateAll(
      (nodes) => nodes.map((n) => Number(n.getAttribute("cx"))),
    );
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
  expect(page.url()).not.toContain("x=");
});

/*
 * A section survives being sent to somebody.
 *
 * It carries its own view, which no other field does: a section has nowhere to be drawn except the map,
 * so a link holding one has to arrive on the map even though the projection is deliberately kept out
 * of the permalink. Opened on the globe the panel would describe a slice with no line anywhere.
 *
 * Started from a fresh context with the map turned off in storage, since the interesting case is a
 * recipient whose own preference disagrees with the link.
 */
test("a link carrying a section opens on the map with the line drawn", async ({ browser }) => {
  needsDevHooks();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  try {
    await installFeeds(page, { count: 400 });
    await page.goto("http://localhost:31600");
    await page.evaluate(() => localStorage.setItem("eif.flat", "0"));

    await page.goto(
      "http://localhost:31600/#at=140,36,2.6&m=2&w=24&x=134.2,31.5,146.1,41.2",
    );
    await waitForData(page);

    await expect(page.getByText("Cross-section", { exact: true })).toBeVisible();
    // On the map, not on the globe: the toggle offers the way back rather than the way there.
    await expect(page.getByRole("button", { name: "Globe" })).toBeVisible();
    // And the line itself is on the canvas, not just the panel below it.
    const drawn = page.locator(".zone-canvas svg line[stroke-dasharray]");
    await expect(drawn).toHaveCount(1);
    expect(Number(await drawn.getAttribute("x2"))).toBeGreaterThan(
      Number(await drawn.getAttribute("x1")),
    );

    // Closing it takes it out of the link, so the next copy is not a section somebody dismissed.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cross-section", { exact: true })).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain("x=");
  } finally {
    await context.close();
  }
});

/*
 * A mark in the section is an event, not a dot.
 *
 * The section shipped read-only for a version: it would put a magnitude 5 at 400km on screen and offer
 * no way to find out what it was, while the same event was one click away in the list beside it. The
 * other thing this covers is the layout consequence, since the panel it opens sits over the band the
 * section is in, and the band ran the full width.
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

  const marks = band.locator("svg circle[fill]");
  await expect(marks.first()).toBeVisible();

  // Hovering names it in the header, in place of the section's own geometry.
  await marks.nth(3).hover();
  await expect(band).toContainText(/M \d\.\d · \d+ km/);

  await marks.nth(3).click();
  const panel = page.locator(".zone-panel");
  await expect(panel).toBeVisible();
  const pinned = (await panel.locator(".font-mono").first().textContent())!;

  /*
   * The band stops where the panel starts.
   *
   * It ran to the right edge, so opening an event from the section hid a fifth of the section behind
   * it, and the key hints had been truncated the same way since before the section existed.
   */
  const bandBox = (await band.locator("svg").last().boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(bandBox.x + bandBox.width).toBeLessThanOrEqual(panelBox.x + 1);

  // Clicking the same mark again unpins, so the mark is a toggle like the rows in the list.
  await marks.nth(3).click();
  await expect(panel).not.toBeVisible();
  expect(pinned).toMatch(/m[bl]|M[wc]/i);
});

/*
 * The cursor, which only a browser can settle: the reveal limit reaches the event layer through a
 * ref the frame loop reads, and a unit test has neither the loop nor the layer.
 */
test("holding the cursor part way through draws part of the window", async ({ page }) => {
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  const live = await waitForData(page);
  // Past the entrance, which drives the same reveal and would be the thing under test otherwise.
  await page.waitForTimeout(4000);

  await page.getByRole("slider", { name: "Time in the window" }).fill("400");
  await page.waitForTimeout(700);

  const held = Number(
    (await page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first().innerText())
      .replace(/,/g, ""),
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
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);
  await page.waitForTimeout(4000);

  await page.getByRole("button", { name: "Play the window through" }).click();
  await page.waitForTimeout(800);
  const early = Number(
    (await page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first().innerText())
      .replace(/,/g, ""),
  );
  await page.waitForTimeout(2200);
  const later = Number(
    (await page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first().innerText())
      .replace(/,/g, ""),
  );

  /*
   * Two readings, not one, because the first version of this stepped by the interval it asked for
   * rather than by the time that passed. Every tick drags a render and a re-sync behind it, so the
   * timer fired late and a twelve second window took over fourteen. A single reading would have
   * passed that.
   */
  expect(later).toBeGreaterThan(early);
});

test("the transport has a keyboard path, and the keys are written down", async ({ page }) => {
  /*
   * The cursor and its play control shipped reachable by pointer only, which is the rule in
   * DESIGN.md that the camera keys were added to satisfy and that this half of the interface then
   * broke. Tab reaches both, but tabbing to a clock to move it one bar is not a path anybody uses.
   */
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

  /*
   * A bar per press, and this is the assertion that says so.
   *
   * The track is 0 to 1000 so a drag is smooth, which made the native arrow step a thousandth of the
   * window: three presses would read 997 here instead of 875. Neither of those thousandths
   * corresponds to anything drawn on the strip above it.
   */
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
   * EMSC's catalogue returns its most recent page whatever `start` asks for, so widening the window
   * buys nothing from it: at a month USGS vouches for thirty days and EMSC for the last eighteen
   * hours. The header went on printing a count per feed and a "both" count over the whole span, and
   * nothing anywhere said where corroboration was even possible.
   *
   * Not scoped to the rail. The source toggles ride with the magnitude control, which floats onto the
   * map at xl, so the assertion is on the fact rather than on where the fact currently sits.
   */
  await installFeeds(page, { count: 400, emscCappedHours: 6 });
  await page.goto("/");
  await waitForData(page);

  /*
   * On the activity strip, against its own axis, rather than on the source toggles.
   *
   * The buttons carried the durations first and the strip now carries them with the axis they have to
   * be read against, which is the same span measured twice if both stay. So the toggles are toggles.
   */
  const activity = page.locator('[data-rail="activity"]');
  // USGS has no result cap, so a successful fetch of a feed vouches for the whole of it.
  await expect(activity).toContainText("24h");
  // Six hours of a twenty-four hour window, which is the fixture's cap and not the window.
  await expect(activity).toContainText(/[56]h/);
  await expect(activity).toContainText("returns its most recent page whatever the window");
  await expect(activity).toContainText("Older events are USGS alone");

  /*
   * The bar has to be a fraction of the axis, not merely present. Widening the window widens USGS's
   * bar and leaves EMSC's where it was, because the catalogue returns its most recent page whatever it
   * is asked for, and that difference in width is the whole point of drawing them.
   */
  const emscWidth = async (): Promise<number> => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-rail="activity"] .relative'));
    const row = rows.find((el) => el.parentElement?.textContent?.startsWith("EMSC"));
    const fill = row?.firstElementChild as HTMLElement | undefined;
    const track = row?.getBoundingClientRect().width ?? 1;
    return (fill?.getBoundingClientRect().width ?? 0) / track;
  });
  const atDay = await emscWidth();
  expect(atDay).toBeGreaterThan(0.15);

  await page.locator(".zone-rail").getByRole("button", { name: "30d", exact: true }).click();
  await expect(activity).toContainText("30d");
  // A thirtieth of the axis it was, or thereabouts: the stub is the fact being stated loudly.
  await expect.poll(emscWidth, { timeout: 8_000 }).toBeLessThan(atDay / 3);
});

test("with both agencies covering the window, nothing is caveated", async ({ page }) => {
  // The note has to be absent when the thing it explains is absent, or it stops being read.
  await installFeeds(page, { count: 400 });
  await page.goto("/");
  await waitForData(page);

  const activity = page.locator('[data-rail="activity"]');
  // Both bars full, and no caveat, because there is no asymmetry to caveat.
  await expect(activity).toContainText("USGS");
  await expect(activity).toContainText("EMSC");
  await expect(page.locator(".zones")).not.toContainText("most recent page");
});

test("the rail can be searched, and says what it cannot search", async ({ page }) => {
  /*
   * Four region rows were the entire navigation, so somebody who wanted Japan had to find it among
   * whichever four were showing or drag the globe until it appeared.
   *
   * There is no gazetteer behind this and there cannot be one under the no-key constraint, so the
   * half of this test that matters most is the empty state: a real place with no seismicity looks
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
   * The globe implies scale by being a globe and the flat map gave nothing to read a distance
   * against. The interesting half is that on equirectangular a horizontal bar is only true where it
   * is drawn: meridians are evenly spaced, so the same pixels cover half the ground at sixty degrees
   * as at the equator. A bar labelled "2,000 km" with no latitude on it would be wrong nearly
   * everywhere.
   */
  await installFeeds(page, { count: 200, silent: false });
  await page.goto("/#at=140,0,0.9&m=6");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(4000);

  const scale = page.locator("[data-scale]");
  /*
   * Asserted on opacity, not on visibility. The bar fades rather than unmounting, so it keeps its box
   * and Playwright rightly calls an `opacity: 0` element visible; the opacity is the mechanism.
   */
  const shown = () => page.evaluate(() => getComputedStyle(
    document.querySelector("[data-scale]")!,
  ).opacity);
  // Nothing on the globe: a ball carries its own size and nobody reads a distance off one.
  expect(await shown()).toBe("0");

  await page.getByRole("button", { name: "Map" }).click();
  await expect.poll(shown, { timeout: 10_000 }).toBe("1");
  await expect(scale).toContainText(/^[\d,]+ km at 0°$/);
  // The rule, by its own hook. Matching on the text instead found the Globe's root div, whose text
  // contains the label too, and measured the selection ring inside it: equal every time, for nothing.
  const ruleWidth = () => page.evaluate(() => document
    .querySelector("[data-scale] > div")?.getBoundingClientRect().width ?? 0);
  const atEquator = await ruleWidth();
  expect(atEquator).toBeGreaterThan(20);

  /*
   * North, and the bar has to change. The camera keys only fire while nothing has focus, which the
   * Map button still had, so the blur is the part that makes this test test anything.
   */
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(1200);

  await expect(scale).toContainText(/km at \d+°N$/);
  const atLatitude = await ruleWidth();
  /*
   * Longer, for the same round number of kilometres: north of the equator this projection stretches
   * east-west, so a fixed distance takes more pixels. If this ever comes back equal, the `cos` has
   * been dropped and the bar is quoting an equatorial measurement over Alaska.
   */
  expect(atLatitude).toBeGreaterThan(atEquator + 5);
});

test("the legend says what a ring is, since nothing else did", async ({ page }) => {
  /*
   * The rings are the signature of the design and were the one mark with no explanation anywhere.
   * Every other encoding belongs to a dot somebody can stare at; a ring appears when an event lands,
   * expands for fifteen seconds and is gone, so a first time viewer gets exactly one look at it.
   *
   * The multiplier is part of the claim rather than a footnote to it: a front moving at twenty times
   * real speed with nothing saying so would be the only dishonest mark on screen.
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
   * The "first motion is a seismogram term" sentence used to be asserted here and is gone on purpose.
   * It existed to explain the app's own name while the app was called First Motion; the rename to
   * Everything Is Fine removed the name, so the sentence explained nothing and went with it. That
   * commit updated other strings in this file and missed this one, and the suite was not being run, so
   * a stale expectation sat here green-until-executed. See ARCHITECTURE.md, "The contract was already
   * written, and asleep".
   */

  /*
   * Once, not twice. The header carried a bare "wavefront ×20" that the sentence now states in the
   * one place it means something, and two identical figures in one viewport with only one of them
   * explained is the trap the activity axis already fell into.
   */
  expect(await zones.evaluate((el) => (el.textContent ?? "").split("×20").length - 1)).toBe(1);
});

test("the largest event is a way in, in time as well as in space", async ({ page }) => {
  /*
   * The app opens on the present, which at a wide window is the least interesting moment it holds:
   * whatever is happening this minute is an M2 somewhere, and the one worth looking at was hours or
   * days ago. The rail already named it and flew to it, and left the cursor live, so arriving showed
   * the end state of the whole window with the event buried in it.
   *
   * Built from exact features rather than the plausible day, because the whole point is an event old
   * enough that going to it moves the clock. A fixture whose strongest event happened four minutes
   * ago would pass every assertion below while testing nothing.
   */
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
    /*
     * Aftershocks, inside the 150km the panel calls a neighbourhood and after the main shock.
     *
     * The first version of this fixture put the big one alone in the Flores Sea with everything else
     * off Honshu, and the panel correctly answered "on its own, so far". An event with no sequence
     * cannot demonstrate arriving at one.
     */
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
    (await page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first().innerText())
      .replace(/,/g, ""),
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
  /*
   * And the globe is drawing that moment, not the end state. Twenty hours back of this fixture is the
   * big one and nothing else, against forty-one events live, so a count that had not moved would mean
   * the cursor was decoration.
   */
  const held = Number(
    (await page.locator(".zone-rail div").filter({ hasText: /^\d[\d,]*$/ }).first().innerText())
      .replace(/,/g, ""),
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
  /*
   * `CrossSection` was reachable by shift-dragging the map and by nothing else. That is
   * undiscoverable with a mouse, since nothing but one line of the hint strip mentions it, and
   * outright impossible on a touch screen, where there is no shift to hold. The panel's own note
   * about the permalink already says a feature nobody can find is not shipped, and this was the same
   * fault in the one view that shows the dimension a map cannot.
   */
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
    .poll(async () => page.evaluate(() => window.location.hash), { timeout: 8_000 })
    .toMatch(/[&#]x=/);
});

test("the key folds away and the controls do not go with it", async ({ page }) => {
  /*
   * Five layers made the legend seven paragraphs, and over the map that is a wall in front of the thing
   * it describes. The risk in folding it is folding the wrong half: the slider and the source buttons are
   * how you change what is on the globe, and they have to survive the fold.
   */
  await installFeeds(page);
  await page.goto("/");
  await waitForData(page);

  const key = page.getByText("What the marks mean").first();
  const explanation = page.getByText("size shows it too").first();
  const slider = page.locator("#mag");
  const usgs = page.getByRole("button", { name: "USGS" }).first();

  // Open by default: the app's argument is that no layer ships without the sentence explaining it, so
  // shipping it shut would hide that from anyone who never finds the toggle.
  await expect(explanation).toBeVisible();

  await key.click();
  await expect(explanation).toBeHidden();
  await expect(slider).toBeVisible();
  await expect(usgs).toBeVisible();

  // Remembered, because a panel somebody folded away is a preference.
  await page.reload();
  await waitForData(page);
  await expect(page.getByText("size shows it too").first()).toBeHidden();
  await expect(page.locator("#mag")).toBeVisible();

  await page.getByText("What the marks mean").first().click();
  await expect(page.getByText("size shows it too").first()).toBeVisible();
});
