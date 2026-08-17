import type { Reading } from "../data/types";
import { backoffMs, type GeoEventSource, type Runtime, type SourceHandlers } from "./types";

/*
 * USGS, asked once a minute.
 *
 * The polling half of the pair. No key, permissive CORS, and it is why DESIGN.md can promise that
 * the first frame is never empty: this feed answers immediately to anyone who clones the repo.
 */

export const USGS_HOUR_FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

/** USGS republishes about once a minute, so asking faster only costs bandwidth. */
const INTERVAL_MS = 60_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 5 * 60_000;

export interface ParseResult {
  readings: Reading[];
  /**
   * Features that could not be turned into a reading.
   *
   * Counted rather than silently dropped. USGS publishes events with a null magnitude, and a
   * magnitude is not optional here: it drives both the radius and the ramp position, so an event
   * without one cannot be drawn honestly. Discarding is right; discarding invisibly is not.
   */
  skipped: number;
}

interface UsgsFeature {
  id?: unknown;
  properties?: {
    mag?: unknown; place?: unknown; time?: unknown; updated?: unknown;
    magType?: unknown; type?: unknown;
  };
  geometry?: { coordinates?: unknown };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * GeoJSON to readings.
 *
 * Written defensively on purpose. This is the one place the app touches something it does not
 * control, and every field below has been null in a real USGS response at some point. A parser
 * that trusts the shape turns a bad afternoon at an agency into a blank globe.
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
      // Absent magType has happened. Naming it "unknown" is honest; defaulting it to a real scale
      // like Mww would put a specific false claim on screen.
      scale: typeof p?.magType === "string" && p.magType ? p.magType : "unknown",
      lon,
      lat,
      // Depth is the third coordinate and is genuinely optional. Zero is a real seabed value, so
      // a missing depth becomes NaN rather than a plausible-looking zero.
      depthKm: (Array.isArray(coords) ? num(coords[2]) : null) ?? Number.NaN,
      time,
      place: typeof p?.place === "string" && p.place ? p.place : "location not given",
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

export function createUsgsSource(runtime: Runtime, url: string = USGS_HOUR_FEED): GeoEventSource {
  let handlers: SourceHandlers | null = null;
  let timer: number | null = null;
  let abort: AbortController | null = null;
  let failures = 0;
  let liveSince: number | null = null;

  /*
   * What we have already told the store about.
   *
   * Replaced wholesale each poll rather than accumulated. The feed is a rolling hour, so keeping
   * every id ever seen would grow forever for no benefit; keeping only the current response bounds
   * it to the feed's own size. An event that ages out and reappears is re-emitted, which is
   * harmless: the store treats a repeat from the same agency as a revision, not a second event.
   */
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
    // Cleared first, always. Two timers on one source is the orphaned-listener bug wearing a
    // different hat: nothing throws, the feed just arrives twice as often forever.
    if (timer !== null) runtime.clearTimer(timer);
    timer = runtime.setTimer(() => {
      timer = null;
      void poll();
    }, ms);
  };

  /*
   * One poll.
   *
   * The try block contains the transport and nothing else. Scheduling, status and parsing all sit
   * outside it, and that separation is not tidiness: the first version scheduled inside the try,
   * so when `browserRuntime` turned out to use `window.setTimeout` and threw under Node, the catch
   * dutifully reported it as `failing` with an HTTP-shaped reason. The feed was perfectly healthy.
   *
   * A source that blames the network for its own bugs is worse than one that crashes, because the
   * status it shows is a lie and the retry it schedules will never help. Our own faults now
   * propagate as unhandled rejections, which is loud and correct.
   */
  const poll = async (): Promise<void> => {
    if (!handlers) return;
    abort?.abort();
    abort = new AbortController();

    let payload: unknown;
    let failure: string | null = null;
    try {
      const res = await runtime.fetch(url, { signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } catch (err) {
      failure = err instanceof Error ? err.message : "request failed";
    }

    if (!handlers) return; // stopped while the request was in flight

    if (failure === null) {
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
      seen = new Map();
      // Immediately, not after the first interval. A minute of empty globe on load would fail
      // DESIGN.md section 8 outright.
      void poll();
    },
    stop: () => {
      // Nulled first, so anything already in flight sees it and returns without calling back.
      handlers = null;
      if (timer !== null) runtime.clearTimer(timer);
      timer = null;
      abort?.abort();
      abort = null;
      seen = new Map();
    },
  };
}
