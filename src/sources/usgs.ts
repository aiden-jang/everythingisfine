import type { Reading } from "../data/types";
import { backoffMs, type GeoEventSource, type Runtime, type SourceHandlers } from "./types";

/* USGS, asked once a minute. See ARCHITECTURE.md#srcsourcesusgsts. */

const FEED = (window: string): string =>
  `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${window}.geojson`;

export const USGS_HOUR_FEED = FEED("all_hour");

/**
 * The first request asks for a day; every one after asks for an hour. Not the 2.5+ daily feed: the
 * magnitude floor belongs to the viewer's filter, not to the fetch. See ARCHITECTURE.md#srcsourcesusgsts.
 */
const USGS_DAY_FEED = FEED("all_day");

/**
 * Which backlog to ask for, given how far back the viewer wants to see. Measured: the day is 0.23MB, the
 * week 1.5MB, the month 7.4MB. See ARCHITECTURE.md#srcsourcesusgsts.
 */
export const usgsSeedFor = (windowMs: number): string => {
  const days = windowMs / 86_400_000;
  if (days > 7) return FEED("all_month");
  if (days > 1) return FEED("all_week");
  return USGS_DAY_FEED;
};

/** USGS republishes about once a minute, so asking faster only costs bandwidth. */
const INTERVAL_MS = 60_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 5 * 60_000;

export interface ParseResult {
  readings: Reading[];
  /** Features that could not be turned into a reading. Counted rather than silently dropped: USGS publishes
   * events with a null magnitude, which drives both the radius and the ramp position, so they cannot be
   * drawn honestly. Discarding is right; discarding invisibly is not. */
  skipped: number;
}

interface UsgsFeature {
  id?: unknown;
  properties?: {
    mag?: unknown;
    place?: unknown;
    time?: unknown;
    updated?: unknown;
    magType?: unknown;
    type?: unknown;
    felt?: unknown;
    cdi?: unknown;
    status?: unknown;
    mmi?: unknown;
    net?: unknown;
  };
  geometry?: { coordinates?: unknown };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * GeoJSON to readings. Written defensively on purpose: this is the one place the app touches something it
 * does not control, and every field below has been null in a real USGS response at some point.
 */
export function parseUsgs(payload: unknown, receivedAt: number): ParseResult {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return { readings: [], skipped: 0 };

  const readings: Reading[] = [];
  let skipped = 0;

  for (const raw of features as UsgsFeature[]) {
    const p = raw?.properties;
    const coords = raw?.geometry?.coordinates;
    const id = typeof raw?.id === "string" ? raw.id : null;
    const mag = num(p?.mag);
    const time = num(p?.time);
    const lon = Array.isArray(coords) ? num(coords[0]) : null;
    const lat = Array.isArray(coords) ? num(coords[1]) : null;

    if (!id || mag === null || time === null || lon === null || lat === null) {
      skipped += 1;
      continue;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skipped += 1;
      continue;
    }

    readings.push({
      source: "usgs",
      id,
      magnitude: mag,
      // Absent magType has happened. Naming it "unknown" is honest; defaulting to a real scale like Mww
      // would put a specific false claim on screen.
      scale: typeof p?.magType === "string" && p.magType ? p.magType : "unknown",
      lon,
      lat,
      // Depth is the third coordinate and is genuinely optional. Zero is a real seabed value, so a missing
      // depth becomes NaN rather than a plausible-looking zero.
      depthKm: (Array.isArray(coords) ? num(coords[2]) : null) ?? Number.NaN,
      time,
      place: typeof p?.place === "string" && p.place ? p.place : "location not given",
      // Felt reports, when there are any. Both fields are routinely null - two of thirteen events carried a
      // count in the M4.5 day sampled while writing this - so absent is the normal case and must read as
      // absent rather than as a zero.
      // Only the two review words that mean something. USGS also sends "deleted", and a third value could
      // arrive at any time: absent reads as "the agency did not say", which is true of anything else.
      ...(p?.status === "automatic" || p?.status === "reviewed" ? { review: p.status } : {}),
      // Who computed it, which is not always USGS themselves. See `Reading.network`.
      ...(typeof p?.net === "string" && p.net.trim() !== "" ? { network: p.net.trim() } : {}),
      // The modelled peak, when they have built a map. Absent far more often than present.
      ...(typeof p?.mmi === "number" && p.mmi > 0 ? { shaking: p.mmi } : {}),
      ...(typeof p?.felt === "number" && p.felt > 0
        ? {
            felt: {
              reports: Math.round(p.felt),
              ...(typeof p?.cdi === "number" && p.cdi > 0 ? { intensity: p.cdi } : {}),
            },
          }
        : {}),
      kind: typeof p?.type === "string" && p.type ? p.type : "earthquake",
      receivedAt,
    });
  }

  return { readings, skipped };
}

/** The `updated` stamp USGS revises when it re-solves an event. Falls back to origin time. */
function revisionOf(feature: UsgsFeature): number {
  return num(feature?.properties?.updated) ?? num(feature?.properties?.time) ?? 0;
}

export interface UsgsUrls {
  /** Fetched once on start. */
  seed?: string;
  /** Fetched every interval after that. */
  poll?: string;
}

export function createUsgsSource(runtime: Runtime, urls: string | UsgsUrls = {}): GeoEventSource {
  // A bare string means "poll this and do not seed", which is what every test wants.
  const pollUrl = typeof urls === "string" ? urls : (urls.poll ?? USGS_HOUR_FEED);
  const seedUrl = typeof urls === "string" ? null : (urls.seed ?? USGS_DAY_FEED);
  /** How far back the chosen seed reaches, read off the feed's own name so the two cannot drift. */
  const seedMs = (seedUrl?.includes("all_month") ? 30 : seedUrl?.includes("all_week") ? 7 : 1) * 86_400_000;
  let seeded = false;
  let handlers: SourceHandlers | null = null;
  let timer: number | null = null;
  let abort: AbortController | null = null;
  let failures = 0;
  let liveSince: number | null = null;

  /* What we have already told the store about. Replaced wholesale each poll rather than accumulated: both
     feeds are rolling windows that restate themselves, so keeping every id ever seen grows forever. See ARCHITECTURE.md#srcsourcesusgsts. */
  let seen = new Map<string, number>();

  const emit = (payload: unknown): void => {
    const now = runtime.now();
    const { readings, skipped } = parseUsgs(payload, now);
    const features = ((payload as { features?: unknown })?.features ?? []) as UsgsFeature[];

    const revisions = new Map<string, number>();
    for (const f of features) {
      if (typeof f?.id === "string") revisions.set(f.id, revisionOf(f));
    }

    const fresh = readings.filter((r) => {
      const before = seen.get(r.id);
      return before === undefined || before !== revisions.get(r.id);
    });

    seen = revisions;
    if (import.meta.env?.DEV && skipped > 0) {
      console.info(`[usgs] skipped ${skipped} unusable feature(s)`);
    }
    if (fresh.length > 0) handlers?.onReadings(fresh);
  };

  const schedule = (ms: number): void => {
    // Cleared first, always. Two timers on one source is the orphaned-listener bug in a different hat:
    // nothing throws, the feed just arrives twice as often forever.
    if (timer !== null) runtime.clearTimer(timer);
    timer = runtime.setTimer(() => {
      timer = null;
      void poll();
    }, ms);
  };

  /* One poll. The try block contains the transport and nothing else. See ARCHITECTURE.md#srcsourcesusgsts. */
  const poll = async (): Promise<void> => {
    if (!handlers) return;
    abort?.abort();
    abort = new AbortController();

    let payload: unknown;
    let failure: string | null = null;
    const target = !seeded && seedUrl ? seedUrl : pollUrl;
    try {
      const res = await runtime.fetch(target, { signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } catch (err) {
      failure = err instanceof Error ? err.message : "request failed";
    }

    if (!handlers) return; // stopped while the request was in flight

    if (failure === null) {
      // The day feed has no result cap, so a successful fetch of it vouches for the whole day.
      // The span the seed asked for, not a day. Hardcoded at a day, choosing a month left the app drawing a
      // month while vouching for the last twenty-four hours of it.
      if (!seeded && target === seedUrl) handlers.onSeeded(runtime.now() - seedMs);
      seeded = true;
      emit(payload);
      if (!handlers) return;
      failures = 0;
      liveSince ??= runtime.now();
      handlers.onStatus({ kind: "live", since: liveSince });
      schedule(INTERVAL_MS);
      return;
    }

    failures += 1;
    liveSince = null;
    const wait = backoffMs(failures, BACKOFF_BASE_MS, BACKOFF_CAP_MS);
    handlers.onStatus({ kind: "failing", reason: failure, retryAt: runtime.now() + wait });
    schedule(wait);
  };

  return {
    id: "usgs",
    transport: "poll",
    start: (h) => {
      if (handlers) return;
      handlers = h;
      failures = 0;
      liveSince = null;
      seeded = false;
      seen = new Map();
      // Immediately, not after the first interval. A minute of empty globe on load would fail DESIGN.md 8.
      void poll();
    },
    stop: () => {
      // Nulled first, so anything already in flight sees it and returns without calling back.
      handlers = null;
      if (timer !== null) runtime.clearTimer(timer);
      timer = null;
      abort?.abort();
      abort = null;
      seeded = false;
      seen = new Map();
    },
  };
}
