import { expect, type Page } from "@playwright/test";

/*
 * Both feeds, served from the test.
 *
 * The browser suite used to talk to USGS and EMSC for real, and it was the one thing keeping it out
 * of CI. The cost was not theoretical: across a single afternoon the feeds became unreachable three
 * times and the suite went red with four, then nine, then one failure. None of those tests assert
 * anything about data. They are layout, colour and interaction tests that time out waiting for
 * content, so a quiet network looked exactly like a broken app.
 *
 * Deterministic rather than recorded. A recording pins the *shape* of a response, which is what the
 * source unit tests already do against committed samples. What a browser test needs is a plausible
 * day positioned relative to now: fixed timestamps would age out of the twenty-four hour window
 * within a day of being committed and the suite would rot quietly.
 *
 * The live contract is still checked, by `pnpm test:live`, which is where a test that genuinely needs
 * the real agencies belongs.
 */

/** mulberry32, so a failure reproduces exactly rather than turning up once a week. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Real margins, because the rail groups events into named regions and a uniform sphere would leave
 * that panel empty. Weighted so Indonesia dominates, which is what a real day looks like and what
 * makes the clustering and sequence code do any work.
 */
const BELTS: readonly {
  lon: number; lat: number; place: string; weight: number; spread: readonly [number, number];
}[] = [
  // `spread` is the run of the margin in degrees. Blobs would collapse to one marker each under
  // clustering and leave a fixture planet with eight dots on it, which is not what a day looks like
  // and would mislead anyone who opened the app against these fixtures to look at something.
  { lon: 122, lat: -6, place: "Flores Sea", weight: 40, spread: [22, 6] },
  { lon: -71, lat: -28, place: "Coquimbo, Chile", weight: 13, spread: [5, 22] },
  { lon: -152, lat: 57, place: "Southern Alaska", weight: 12, spread: [26, 7] },
  { lon: 141, lat: 38, place: "Near The East Coast Of Honshu, Japan", weight: 11, spread: [7, 16] },
  { lon: 27, lat: 38, place: "Western Turkey", weight: 8, spread: [16, 5] },
  { lon: -117, lat: 34, place: "Southern California", weight: 6, spread: [6, 8] },
  { lon: 174, lat: -39, place: "Cook Strait, New Zealand", weight: 6, spread: [6, 12] },
  { lon: 125, lat: 8, place: "Mindanao, Philippines", weight: 4, spread: [5, 9] },
];

export interface Quake {
  id: string;
  magnitude: number;
  lon: number;
  lat: number;
  depthKm: number;
  /** Milliseconds before now. */
  ago: number;
  place: string;
  /** Whether EMSC reports it too, with the disagreement two agencies actually show. */
  both: boolean;
}

/**
 * A day of seismicity, newest last.
 *
 * Gutenberg-Richter rather than uniform magnitudes: a day is mostly twos and threes with a handful
 * above five. A uniform draw would put a magnitude 7 on screen every few minutes and quietly make
 * every magnitude filter test meaningless.
 *
 * **The slope here is 0.625, and real catalogues sit between 0.8 and 1.2.** The 1.6 below is one over
 * the b-value, so this fixture is shallower than any real day: it has about 76 magnitude 2s for every
 * 5, where the Earth has around a thousand. That did not show until the rail started drawing the size
 * distribution, which reads this back and quotes "about 5 times as many" on fixture data against the
 * "about 10" a real feed gives. Left alone deliberately - changing it moves the count at every
 * magnitude threshold and half the browser suite asserts on those - but it is wrong and worth knowing.
 */
export function day(seed = 4, count = 240): Quake[] {
  const rand = seeded(seed);
  const total = BELTS.reduce((n, b) => n + b.weight, 0);
  const out: Quake[] = [];

  for (let i = 0; i < count; i += 1) {
    let pick = rand() * total;
    const belt = BELTS.find((b) => (pick -= b.weight) <= 0) ?? BELTS[0]!;
    out.push({
      id: `fx${i.toString(36)}`,
      magnitude: Number((2 + -Math.log10(1 - rand() * 0.985) * 1.6).toFixed(1)),
      lon: belt.lon + (rand() - 0.5) * belt.spread[0],
      lat: belt.lat + (rand() - 0.5) * belt.spread[1],
      depthKm: Number((5 + rand() * rand() * 260).toFixed(1)),
      ago: Math.round(rand() * 23.5 * 3_600_000),
      place: belt.place,
      both: rand() < 0.18,
    });
  }
  return out.sort((a, b) => b.ago - a.ago);
}

const usgsFeature = (q: Quake, now: number) => ({
  id: q.id,
  properties: {
    mag: q.magnitude,
    place: q.place,
    time: now - q.ago,
    updated: now - q.ago,
    magType: q.magnitude >= 4.5 ? "mww" : "ml",
    type: "earthquake",
    /*
     * Reviewed once a person has plausibly got to it, which in practice means the older and larger ones.
     *
     * Both values have to appear or the panel row is only ever tested in one state, and the interesting
     * one is "automatic": a number that may still move.
     */
    status: q.ago > 3 * 3_600_000 && q.magnitude >= 4 ? "reviewed" : "automatic",
    /*
     * Felt reports on the larger events only, which is roughly how the real feed behaves.
     *
     * USGS carried a count on two of thirteen events in an M4.5 day sampled while this was written, so
     * a fixture where every event had one would exercise a case the app never sees. Deterministic from
     * the magnitude rather than random, so a screenshot of one run matches the next.
     */
    ...(q.magnitude >= 4.2
      ? { felt: Math.round(q.magnitude * 37) % 900, cdi: Math.min(8, q.magnitude - 0.4) }
      : {}),
    /*
     * A shaking map on fewer events still, and deliberately not equal to `cdi`.
     *
     * The two rows exist to be read against each other, so a fixture where they always agreed would
     * hide the case the wording was written for. Modelled peaks run higher than what people report.
     */
    ...(q.magnitude >= 4.6 ? { mmi: Math.min(9, q.magnitude + 0.8) } : {}),
  },
  geometry: { coordinates: [q.lon, q.lat, q.depthKm] },
});

/*
 * EMSC's own numbers, not a copy of USGS's.
 *
 * A corroborated event is the project's subject, and a fixture where both agencies agree exactly
 * would make the association logic look correct while exercising none of it. Offsets are the size
 * the real feeds show: seconds of origin time, tens of kilometres, a couple of tenths of magnitude.
 */
const emscFeature = (q: Quake, now: number) => ({
  properties: {
    unid: `e${q.id}`,
    lat: q.lat + 0.09,
    lon: q.lon + 0.11,
    depth: q.depthKm,
    mag: Number((q.magnitude - 0.2).toFixed(1)),
    magtype: "mb",
    time: new Date(now - q.ago + 7_000).toISOString(),
    lastupdate: new Date(now - q.ago + 7_000).toISOString(),
    flynn_region: q.place.toUpperCase(),
    evtype: "ke",
  },
});

export interface FeedOptions {
  /** Exact USGS features, for a test that needs one specific event rather than a plausible day. */
  usgs?: unknown[];
  /** A day with nothing in it. The feeds answer; they simply have no events. */
  empty?: boolean;
  /** Requests never resolve, so coverage never arrives. */
  silent?: boolean;
  /** Requests are refused, so the sources report failure. */
  dead?: boolean;
  seed?: number;
  count?: number;
  /**
   * Makes EMSC's catalogue answer a full page, capped, reaching back only this many hours.
   *
   * The default fixture returns fewer rows than the seed limit, so EMSC vouches for the whole window
   * and the truncated branch never runs. That is the common case and not the interesting one: the
   * real endpoint returns its most recent 600 rows whatever `start` asks for, which at a month is
   * about eighteen hours of them.
   */
  emscCappedHours?: number;
}

/** Matches `SEED_LIMIT` in `src/sources/emsc.ts`, which is what decides that a page was truncated. */
const EMSC_SEED_LIMIT = 600;

/**
 * Routes both feeds and stubs the socket. Call before `page.goto`.
 *
 * The socket has to be stubbed rather than routed: EMSC pushes over a WebSocket and `page.route`
 * never sees one, which is how a live earthquake from Salta turned up in a test that had carefully
 * routed both HTTP endpoints to nothing.
 */
export async function installFeeds(page: Page, options: FeedOptions = {}): Promise<void> {
  const { usgs, empty, silent, dead, seed, count, emscCappedHours } = options;

  await installHazards(page);

  await page.addInitScript((isDead: boolean) => {
    class StubSocket {
      private readonly listeners = new Map<string, ((e: unknown) => void)[]>();

      constructor() {
        // A source that reports "live" only once its socket opens, so a stub that never opens leaves
        // the header saying "one feed live" and any test reading that line is testing the stub.
        if (!isDead) setTimeout(() => this.emit("open", {}), 10);
        else setTimeout(() => this.emit("error", {}), 10);
      }

      addEventListener(type: string, fn: (e: unknown) => void): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }

      // The real source sends a subscribe frame on open. Without this the stub threw inside the
      // source's own open handler, which is an uncaught error in the middle of app startup.
      send(): void {}

      close(): void {}

      private emit(type: string, event: unknown): void {
        for (const fn of this.listeners.get(type) ?? []) fn(event);
      }
    }
    (window as unknown as { WebSocket: unknown }).WebSocket = StubSocket;
  }, dead === true);

  if (dead) {
    await page.route(/seismicportal\.eu|\.geojson/, (route) => route.abort());
    return;
  }
  if (silent) {
    await page.route(/seismicportal\.eu|\.geojson/, async () => {});
    return;
  }

  const quakes = empty ? [] : day(seed, count);

  /*
   * Every backlog, not just the daily one.
   *
   * The window control can ask for `all_week` or `all_month`, and a pattern that only caught
   * `all_day` let those two straight out to USGS: a suite that had been made independent of the real
   * agencies quietly started pulling a live week down the moment a test clicked 7d.
   *
   * All three answer with the same fixture day. What the seeding path is being tested on is which URL
   * it asks for and what it does with the reply, and a fixture that grew with the window would only
   * make the counts harder to reason about.
   */
  await page.route(/all_(day|week|month)\.geojson/, (route) => {
    const now = Date.now();
    route.fulfill({
      json: { features: usgs ?? quakes.map((q) => usgsFeature(q, now)) },
    });
  });

  // The hourly poll is a subset of the day, which is what the real feed does and what makes the
  // store treat a re-delivered event as a revision rather than as something new.
  await page.route(/all_hour\.geojson/, (route) => {
    const now = Date.now();
    route.fulfill({
      json: {
        features: usgs ?? quakes
          .filter((q) => q.ago < 3_600_000)
          .map((q) => usgsFeature(q, now)),
      },
    });
  });

  await page.route(/seismicportal\.eu/, (route) => {
    const now = Date.now();
    if (emscCappedHours !== undefined) {
      /*
       * Exactly a full page, spread evenly over the hours asked for.
       *
       * Full is what makes the source vouch for its oldest row rather than for the window, so the
       * count has to be the limit and not merely large. The oldest row is pinned to the far end of
       * the span so the reach the rail prints is the number this test passed in.
       */
      const capped = Array.from({ length: EMSC_SEED_LIMIT }, (_, i) => emscFeature({
        ...quakes[i % Math.max(1, quakes.length)]!,
        id: `cap${i}`,
        ago: Math.round((i / (EMSC_SEED_LIMIT - 1)) * emscCappedHours * 3_600_000),
      }, now));
      route.fulfill({ json: { features: capped } });
      return;
    }
    route.fulfill({
      json: { features: quakes.filter((q) => q.both).map((q) => emscFeature(q, now)) },
    });
  });
  /*
   * The archive, which was reaching the real internet for months without anybody noticing.
   *
   * The routes above catch `all_day.geojson` and `seismicportal.eu`. The archive asks
   * `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=...`, which contains no literal
   * `.geojson`, so **USGS archive requests missed every pattern and went out to the real agency** while
   * the EMSC archive request was caught by the host pattern below. Every archived-day test was therefore
   * running on real events from that day mixed with fixtures dated near now - and the newest fixture sat
   * at the top of the list, which is exactly how a wrong clock read "1h ago" and hid a bug for two turns.
   *
   * The fixtures are dated **inside the requested day** rather than near now, because that is the whole
   * point: an archived day whose events are dated today cannot tell a correct clock from a broken one.
   */
  /*
   * The count method, which is a different method on the same service.
   *
   * The route below matches `query`, so `count` went straight past it to the real agency - the same leak
   * that had archived-day tests running on live events for months. The number is derived from the day so
   * it is stable per date and different between dates, which is what the list is there to show.
   */
  await page.route(/fdsnws\/event\/1\/count/, (route) => {
    const url = new URL(route.request().url());
    const day = (url.searchParams.get("starttime") ?? "").slice(0, 10);
    const year = Number(day.slice(0, 4)) || 2000;
    // Thin in 1960 and busy now, because that contrast is the reading being tested.
    const count = Math.max(4, Math.round((year - 1955) * 9.5));
    route.fulfill({ json: { count, maxAllowed: 20_000 } });
  });

  await page.route(/fdsnws\/event\/1\/query/, async (route) => {
    const url = new URL(route.request().url());
    const start = Date.parse(`${url.searchParams.get("starttime") ?? ""}`);
    const end = Date.parse(`${url.searchParams.get("endtime") ?? ""}`);
    /*
     * Only an archive query, handed back to the routes above otherwise.
     *
     * EMSC's *live* seed uses this same endpoint - `?limit=600&format=json&start=...` - so claiming every
     * `fdsnws` request replaced the capped seed fixtures the reach test depends on, and that test went
     * red. `starttime`/`endtime` are the archive's parameters; the live seed says `start`.
     */
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      await route.fallback();
      return;
    }
    const span = { from: start, to: end };
    // Spread across the day, oldest first, so the newest sits just inside its end.
    const spread = quakes.map((q, i) => ({
      ...q,
      id: `arc${i}`,
      ago: Math.round(((quakes.length - 1 - i) / Math.max(1, quakes.length - 1)) * (span.to - span.from)),
    }));
    const emsc = /seismicportal/.test(url.host);
    route.fulfill({
      json: emsc
        ? { features: spread.map((q) => emscFeature(q, span.to)) }
        : { features: spread.map((q) => usgsFeature(q, span.to)) },
    });
  });

  /*
   * Registered last on purpose: Playwright checks routes in reverse registration order, so the broad
   * `seismicportal.eu` host pattern above would otherwise keep catching the EMSC archive query.
   */

}

/**
 * Waits for the rail's counter to leave zero, which is the app's own "data has landed" signal.
 *
 * The rail is asserted first, on a short timeout, because `not.toHaveText` against an element that does
 * not exist spends the full thirty seconds and then reports "element(s) not found" - which is what a page
 * that threw on load looks like, and reads nothing like it. Diagnosing one instance cost a whole suite
 * run. A page that died now fails in a second, saying so.
 */
/*
 * The hazard feeds, stubbed because they were never stubbed and nobody had measured the cost.
 *
 * A fallback spy that only sees requests every `installFeeds` route declined counted **14 to gdacs.org
 * and 2 to services.swpc.noaa.gov on a single test**, plus EONET on any archived day. Across the
 * sixty-two browser tests that is roughly a thousand calls to GDACS per suite run, for data **no test
 * asserts on** - a grep for the layer sentences across both specs returns nothing. Every browser test was
 * therefore depending on two third-party services being up and fast, which is a plausible share of the
 * flakiness and the runtime that has been put down to machine load.
 *
 * Small fixed sets rather than empty responses: the layers still draw, so screenshots taken for visual
 * review keep showing a spiral, a triangle, a flame and waves, and they draw the *same* ones every run.
 */
const hazardEvent = (type: string, id: number, lon: number, lat: number, extra: object = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    eventtype: type, eventid: id, eventname: "", country: "Fixtureland",
    fromdate: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    todate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    iscurrent: "true", alertlevel: "Green", severitydata: { severity: 0 },
    /*
      The reporting agency, which GDACS sends on every real event and the app now shows.

      A plausible one rather than "FIXTURE": these reach a hover label, and a label reading
      "FIXTURE · FIXTURE" would not have caught the day the separator was left dangling.
    */
    source: type === "TC" ? "JTWC" : type === "VO" ? "GVP" : type === "WF" ? "EFFIS" : "DFO",
    ...extra,
  },
});

async function installHazards(page: Page): Promise<void> {
  await page.route(/gdacsapi\/api\/events\/geteventlist/, (route) => {
    const type = new URL(route.request().url()).searchParams.get("eventlist") ?? "";
    const rows: Record<string, unknown[]> = {
      TC: [hazardEvent("TC", 9001, 132, 14, {
        eventname: "FIXTURE", severitydata: { severity: 185 },
      })],
      VO: [hazardEvent("VO", 9002, 15.0, 37.7, { eventname: "Fixture Volcano" })],
      WF: [hazardEvent("WF", 9003, 121.5, -8.2, { severitydata: { severity: 4200 } })],
      FL: [hazardEvent("FL", 9004, 100.5, 13.7)],
    };
    route.fulfill({ json: { type: "FeatureCollection", features: rows[type] ?? [] } });
  });

  // The storm track, which is a separate call per storm. One short line, so a spiral gets a tail.
  await page.route(/gdacsapi\/api\/polygons\/getgeometry/, (route) => {
    route.fulfill({
      json: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { Class: "Line" },
          geometry: { type: "LineString", coordinates: [[128, 11], [130, 12], [132, 14]] },
        }],
      },
    });
  });

  /*
   * The whole grid, because `parseOvation` refuses anything else.
   *
   * It checks `rows.length === AURORA_LON * AURORA_LAT` and returns null on a mismatch, so a sparse
   * patch parses to nothing and the aurora silently disappears - which is what the first version of this
   * fixture did. The key is `Forecast Time`, not `Observation Time`; the wrong one falls back to the
   * fetch clock rather than failing, which is exactly the kind of quiet pass worth not writing.
   */
  await page.route(/ovation_aurora_latest\.json/, (route) => {
    const coordinates: [number, number, number][] = [];
    for (let lat = -90; lat <= 90; lat += 1) {
      for (let lon = 0; lon < 360; lon += 1) {
        // A band over the auroral oval in both hemispheres, and nothing anywhere else.
        const band = Math.abs(Math.abs(lat) - 68) <= 3;
        coordinates.push([lon, lat, band ? 30 : 0]);
      }
    }
    route.fulfill({ json: { "Forecast Time": new Date().toISOString(), coordinates } });
  });

  /*
   * EONET, for archived days. Dated inside the requested range for the reason the earthquake archive is:
   * a past day whose events are stamped today cannot tell a correct clock from a broken one.
   */
  await page.route(/eonet\.gsfc\.nasa\.gov/, (route) => {
    const url = new URL(route.request().url());
    const start = Date.parse(`${url.searchParams.get("start") ?? ""}T00:00:00Z`);
    const at = new Date(Number.isFinite(start) ? start + 43_200_000 : Date.now()).toISOString();
    const point = (lon: number, lat: number, value?: number, unit?: string): unknown => ({
      date: at, type: "Point", coordinates: [lon, lat],
      ...(value === undefined ? {} : { magnitudeValue: value, magnitudeUnit: unit }),
    });
    route.fulfill({
      json: {
        events: [
          { id: "EONET_F1", title: "Tropical Storm Fixture", closed: at,
            categories: [{ id: "severeStorms" }],
            geometry: [point(130, 12, 40, "kts"), point(132, 14, 55, "kts")] },
          { id: "EONET_F2", title: "FIXTURE Wildfire, Owyhee, Idaho", closed: at,
            categories: [{ id: "wildfires" }], geometry: [point(-116, 43, 1200, "acres")] },
          { id: "EONET_F3", title: "Flood in Fixtureland 9", closed: at,
            categories: [{ id: "floods" }], geometry: [point(100, 14)] },
          /*
           * Volcanoes were the category this fixture left out, and the only one whose note does date
           * arithmetic - "the newest ended N days ago". So the archived volcano line was the one
           * reading that no browser test could see, and it was measuring N from today.
           */
          { id: "EONET_F4", title: "Fixture Volcano", closed: at,
            categories: [{ id: "volcanoes" }], geometry: [point(-155, 19)] },
        ],
      },
    });
  });
}

export async function waitForData(page: Page): Promise<number> {
  const rail = page.locator(".zone-rail");
  await expect(rail, "the rail never rendered: the page probably threw on load")
    .toBeAttached({ timeout: 10_000 });
  const counter = rail.locator("div").filter({ hasText: /^\d[\d,]*$/ }).first();
  await expect(counter, "the rail's counter never left zero: no data arrived")
    .not.toHaveText("0", { timeout: 30_000 });
  return Number((await counter.innerText()).replace(/,/g, ""));
}
