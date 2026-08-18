import type { Page } from "@playwright/test";

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
}

/**
 * Routes both feeds and stubs the socket. Call before `page.goto`.
 *
 * The socket has to be stubbed rather than routed: EMSC pushes over a WebSocket and `page.route`
 * never sees one, which is how a live earthquake from Salta turned up in a test that had carefully
 * routed both HTTP endpoints to nothing.
 */
export async function installFeeds(page: Page, options: FeedOptions = {}): Promise<void> {
  const { usgs, empty, silent, dead, seed, count } = options;

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

  await page.route(/all_day\.geojson/, (route) => {
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
    route.fulfill({
      json: { features: quakes.filter((q) => q.both).map((q) => emscFeature(q, now)) },
    });
  });
}
