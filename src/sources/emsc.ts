import type { Reading } from "../data/types";
import {
  backoffMs, type GeoEventSource, type Runtime, type SocketLike, type SourceHandlers, type TimerId,
} from "./types";

/*
 * EMSC, which tells us.
 *
 * The push half of the pair, and the reason the project can claim one polling source and one push
 * source at zero cost. The seismic portal publishes a public WebSocket standing order: no key, no
 * registration, and WebSocket is exempt from CORS by construction, so the browser reaches it
 * directly and the deployment keeps its zero-invocation shape.
 *
 * Nothing about the *data* differs from the polling case in any interesting way. What differs is
 * who decides when, and everything downstream of that is deliberately identical: the same Reading,
 * the same status vocabulary, the same contract suite, unchanged.
 */

export const EMSC_SOCKET = "wss://www.seismicportal.eu/standing_order/websocket";

/**
 * The catalogue, fetched once when the socket opens.
 *
 * A push source has no history: it says what changes from the moment you connect, so on a fresh
 * load EMSC contributed nothing and the rail read `EMSC 0` beside `USGS 227`. That made the
 * project's headline claim invisible, because corroboration only exists where both agencies have
 * reported, and one of them had not reported anything yet.
 *
 * Seeding from FDSN fixes it in one request: 600 events over 24 hours in 327kB, keyless, and it
 * returns `access-control-allow-origin: *`, so it needs no proxy and the deployment stays
 * Worker-free. The socket then takes over for everything after.
 */
export const EMSC_CATALOGUE = "https://www.seismicportal.eu/fdsnws/event/1/query";

/** Matches the USGS daily seed, so the two agencies cover the same window on the first frame. */
const SEED_HOURS = 24;
/*
 * Held at 600 whatever the window, and the coverage report is what makes that honest.
 *
 * A wider window asks FDSN for a wider `start` but not for more rows, so a week or a month comes back
 * truncated to the most recent 600 events. Raising it would be guessing at a limit this endpoint has
 * never stated, and being wrong is a 400 that takes the seed out entirely. `onSeeded` already vouches
 * only as far as its oldest row when a page comes back full, so a truncated month reports itself as a
 * short backlog and the strip marks the rest unobserved rather than drawing it as quiet.
 */
export const SEED_LIMIT = 600;

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;

/**
 * How many identifiers to remember for deduplication.
 *
 * A polling source can replace its whole seen-set each cycle, because the feed restates itself. A
 * socket cannot: it only ever tells you what changed, so anything remembered accumulates for as
 * long as the page is open. That is precisely the leak the four-hour test exists to catch, arriving
 * by a different door, so the map is bounded and evicts oldest-first.
 */
const SEEN_LIMIT = 20_000;

/**
 * EMSC event type codes, spelled out.
 *
 * `ke` is a known earthquake and is the overwhelming majority. The rest are real and are not
 * earthquakes, and the same rule applies as to a USGS quarry blast: keep them, name them. An
 * unrecognised code is passed through verbatim rather than flattened to "earthquake", because
 * inventing a classification is worse than showing one the reader can look up.
 */
const EVENT_TYPES: Record<string, string> = {
  ke: "earthquake",
  se: "suspected explosion",
  ki: "induced earthquake",
  si: "suspected induced event",
  km: "mining event",
  sm: "suspected mining event",
  kr: "rockslide",
  sr: "suspected rockslide",
  kh: "chemical explosion",
  kx: "experimental explosion",
  ls: "landslide",
};

interface EmscFeature {
  id?: unknown;
  properties?: {
    unid?: unknown; lat?: unknown; lon?: unknown; depth?: unknown; mag?: unknown;
    magtype?: unknown; time?: unknown; lastupdate?: unknown; flynn_region?: unknown;
    auth?: unknown;
    evtype?: unknown;
  };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** ISO 8601 to epoch ms. EMSC sends strings where USGS sends numbers. */
const parseTime = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export interface EmscParsed {
  reading: Reading;
  /** `lastupdate`, used for deduplication. EMSC revises an event by resending it. */
  revision: number;
}

/**
 * One socket frame to a reading.
 *
 * Positions come from `properties`, not from `geometry.coordinates`. The two disagree by design:
 * the geometry's third value is negative for a depth below the surface, so a 15km-deep event
 * reports `-15.0` there and `15.0` in properties. Reading the wrong one puts every earthquake in
 * the sky.
 */
export function parseEmscFrame(raw: unknown, receivedAt: number): EmscParsed | null {
  let message: unknown = raw;
  if (typeof raw === "string") {
    try {
      message = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const envelope = message as { action?: unknown; data?: unknown };
  // A frame with no `data` is a keepalive or something new. Neither is an error.
  const feature = (envelope?.data ?? null) as EmscFeature | null;
  if (!feature || typeof feature !== "object") return null;

  const p = feature.properties;
  const id = typeof p?.unid === "string" ? p.unid
    : typeof feature.id === "string" ? feature.id : null;
  const mag = num(p?.mag);
  const lat = num(p?.lat);
  const lon = num(p?.lon);
  const time = parseTime(p?.time);

  if (!id || mag === null || lat === null || lon === null || time === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const evtype = typeof p?.evtype === "string" ? p.evtype : "";
  const depth = num(p?.depth);

  return {
    revision: parseTime(p?.lastupdate) ?? time,
    reading: {
      source: "emsc",
      id,
      magnitude: mag,
      scale: typeof p?.magtype === "string" && p.magtype ? p.magtype : "unknown",
      lon,
      lat,
      depthKm: depth ?? Number.NaN,
      time,
      place: typeof p?.flynn_region === "string" && p.flynn_region ? p.flynn_region
        : "location not given",
      kind: EVENT_TYPES[evtype] ?? (evtype || "earthquake"),
      /*
       * The authority that computed it, which EMSC relays rather than produces.
       *
       * `BMKG` for Indonesia's agency, `AK` for the Alaska Earthquake Center. USGS carries the same fact
       * under `net`, so both feeds can now name who did the work instead of only who passed it on. See
       * `Reading.network`.
       *
       * `source_catalog` is deliberately not read. It is always `EMSC-RTS`, and RTS is their real-time
       * service - suggestive of "automatic", which would give a counterpart to USGS's `status`. Reading a
       * review state out of a catalogue name is guessing about provenance, which is the one thing these
       * fields exist to prevent.
       */
      ...(typeof p?.auth === "string" && p.auth.trim() !== "" ? { network: p.auth.trim() } : {}),
      receivedAt,
    },
  };
}

export interface EmscUrls {
  socket?: string;
  /** Null disables seeding, which is what the contract tests want. */
  catalogue?: string | null;
}

export function createEmscSource(
  runtime: Runtime,
  urls: string | EmscUrls = {},
  /** How far back the seed asks. Defaults to the day the socket's own backlog was written against. */
  seedHours: number = SEED_HOURS,
): GeoEventSource {
  const url = typeof urls === "string" ? urls : urls.socket ?? EMSC_SOCKET;
  const catalogue = typeof urls === "string" ? null : urls.catalogue ?? EMSC_CATALOGUE;
  let handlers: SourceHandlers | null = null;
  let socket: SocketLike | null = null;
  let timer: TimerId | null = null;
  let failures = 0;
  let liveSince: number | null = null;

  /** Insertion-ordered, so the oldest key is simply the first one. */
  const seen = new Map<string, number>();

  const remember = (id: string, revision: number): void => {
    seen.set(id, revision);
    if (seen.size > SEEN_LIMIT) {
      const oldest = seen.keys().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
  };

  const clearTimer = (): void => {
    if (timer !== null) runtime.clearTimer(timer);
    timer = null;
  };

  const teardownSocket = (): void => {
    const doomed = socket;
    // Nulled before closing, so the close handler this triggers sees no current socket and does
    // not treat our own teardown as a dropped connection worth reconnecting from.
    socket = null;
    doomed?.close();
  };

  const scheduleReconnect = (): void => {
    if (!handlers) return;
    failures += 1;
    liveSince = null;
    const wait = backoffMs(failures, BACKOFF_BASE_MS, BACKOFF_CAP_MS);
    handlers.onStatus({
      kind: "failing",
      reason: failures === 1 ? "connection lost" : `reconnecting, attempt ${failures}`,
      retryAt: runtime.now() + wait,
    });
    clearTimer();
    timer = runtime.setTimer(() => {
      timer = null;
      connect();
    }, wait);
  };

  const onMessage = (event: { data?: unknown }): void => {
    if (!handlers) return;
    const parsed = parseEmscFrame(event.data, runtime.now());
    if (!parsed) return;

    const before = seen.get(parsed.reading.id);
    if (before === parsed.revision) return;
    remember(parsed.reading.id, parsed.revision);
    handlers.onReadings([parsed.reading]);
  };

  /*
   * One catalogue fetch, fired alongside the connection rather than before it.
   *
   * Not awaited: a slow or unhappy catalogue must never delay the socket, because the socket is the
   * source's actual job and the seed is a convenience. If it fails, nothing is reported as broken.
   * The feed is genuinely live either way, and telling somebody a working source is failing because
   * an optional extra request did not land would be the wrong kind of honest.
   */
  const seed = async (): Promise<void> => {
    if (!catalogue) return;
    const since = new Date(runtime.now() - seedHours * 3_600_000).toISOString().slice(0, 19);
    const query = `${catalogue}?limit=${SEED_LIMIT}&format=json&start=${since}`;
    try {
      const res = await runtime.fetch(query);
      if (!res.ok || !handlers) return;
      const payload = (await res.json()) as { features?: unknown };
      if (!handlers || !Array.isArray(payload?.features)) return;

      const readings: Reading[] = [];
      /*
       * Tracked over the page, not over what was delivered from it.
       *
       * Coverage is a claim about what the catalogue answered, and the delivered list is that minus
       * whatever the socket had already pushed. Reading the edge off the delivery would let a single
       * duplicate at the far end of a truncated page move the claim forwards in time.
       */
      let oldestOnPage = Infinity;
      for (const feature of payload.features) {
        // Wrapped in the socket's envelope so there is exactly one parser for both transports.
        const parsed = parseEmscFrame({ action: "create", data: feature }, runtime.now());
        if (!parsed) continue;
        oldestOnPage = Math.min(oldestOnPage, parsed.reading.time);
        // Remembered, so the socket does not re-announce an event the seed already delivered.
        if (seen.get(parsed.reading.id) === parsed.revision) continue;
        remember(parsed.reading.id, parsed.revision);
        readings.push(parsed.reading);
      }
      if (readings.length > 0) handlers.onReadings(readings);
      /*
       * How far back this seed actually reaches, which is not always the whole window.
       *
       * The request is capped at SEED_LIMIT results, so on a busy day it returns the most recent 600
       * events and stops. Claiming 24 hours then would be claiming a backlog that was truncated on
       * the way out of the server, so a full page vouches only as far as its oldest event.
       *
       * A short page vouches for everything it asked for, and that is sound for a measured reason
       * rather than an assumed one: the portal's own ceiling is 20,000 rows, so `SEED_LIMIT` is
       * always the binding limit and a page under it is a genuinely short catalogue rather than a
       * quietly truncated one. `emsc.live.test.ts` is where that stays checked.
       */
      const full = payload.features.length >= SEED_LIMIT;
      /*
       * A truncated page nothing could be parsed out of vouches for nothing.
       *
       * It used to fall through to the full span, which is the one combination where that fallback is
       * exactly wrong: the page was cut short *and* the app has no idea where, so claiming the whole
       * window is claiming a month on the strength of zero events. Skipping leaves EMSC with no
       * coverage of its own, which is the true statement, and USGS still reports its own.
       */
      if (full && !Number.isFinite(oldestOnPage)) return;
      handlers.onSeeded(full ? oldestOnPage : runtime.now() - seedHours * 3_600_000);
    } catch {
      // Optional by design. The socket is the source; this was a head start.
    }
  };

  function connect(): void {
    if (!handlers || !runtime.openSocket) return;
    const active = runtime.openSocket(url);
    socket = active;

    active.addEventListener("open", () => {
      if (!handlers || socket !== active) return;
      failures = 0;
      liveSince = runtime.now();
      handlers.onStatus({ kind: "live", since: liveSince });
    });
    active.addEventListener("message", (e) => {
      if (socket !== active) return;
      onMessage(e);
    });
    // Both funnel to the same place. A socket that errors always closes afterwards, and treating
    // them separately double-counts the failure and halves the backoff.
    const dropped = (): void => {
      if (socket !== active) return;
      socket = null;
      scheduleReconnect();
    };
    active.addEventListener("error", dropped);
    active.addEventListener("close", dropped);
  }

  return {
    id: "emsc",
    transport: "push",
    start: (h) => {
      if (handlers) return;
      handlers = h;
      failures = 0;
      liveSince = null;
      seen.clear();
      connect();
      void seed();
    },
    stop: () => {
      handlers = null;
      clearTimer();
      teardownSocket();
      seen.clear();
    },
  };
}
