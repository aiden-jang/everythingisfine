import type { Reading } from "../data/types";
import {
  backoffMs, type GeoEventSource, type Runtime, type SocketLike, type SourceHandlers, type TimerId,
} from "./types";

/*
 * EMSC, which tells us.
 *
 * The push half of the pair. The seismic portal publishes a public WebSocket standing order - no key, no
 * registration - and WebSocket is exempt from CORS by construction, so the browser reaches it directly and
 * the deployment keeps its zero-invocation shape.
 *
 * Nothing about the data differs from the polling case. What differs is who decides when, and everything
 * downstream is deliberately identical.
 */

export const EMSC_SOCKET = "wss://www.seismicportal.eu/standing_order/websocket";

/**
 * The catalogue, fetched once when the socket opens.
 *
 * A push source has no history, so on a fresh load EMSC contributed nothing and the rail read `EMSC 0`
 * beside `USGS 227` - which made the project's headline claim invisible, because corroboration only exists
 * where both agencies have reported.
 *
 * FDSN fixes it in one request: 600 events over 24 hours in 327kB, keyless, `access-control-allow-origin: *`.
 */
export const EMSC_CATALOGUE = "https://www.seismicportal.eu/fdsnws/event/1/query";

/** Matches the USGS daily seed, so the two agencies cover the same window on the first frame. */
const SEED_HOURS = 24;
/*
 * Held at 600 whatever the window, and the coverage report is what makes that honest. A wider window asks
 * FDSN for a wider `start` but not for more rows, and raising the cap would be guessing at a limit this
 * endpoint has never stated - where being wrong is a 400 that takes the seed out entirely. `onSeeded`
 * vouches only as far as its oldest row when a page comes back full.
 */
export const SEED_LIMIT = 600;

const BACKOFF_BASE_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;

/**
 * How many identifiers to remember for deduplication. A polling source can replace its whole seen-set each
 * cycle because the feed restates itself; a socket only ever tells you what changed, so anything remembered
 * accumulates for as long as the page is open. Bounded, evicting oldest first.
 */
const SEEN_LIMIT = 20_000;

/**
 * EMSC event type codes, spelled out. `ke` is a known earthquake and is the overwhelming majority; the rest
 * are real and are not earthquakes. An unrecognised code passes through verbatim rather than flattened to
 * "earthquake", because inventing a classification is worse than showing one the reader can look up.
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
 * One socket frame to a reading. Positions come from `properties`, never from `geometry.coordinates`: the
 * geometry's third value is negative for a depth below the surface, so a 15km-deep event reports `-15.0`
 * there and `15.0` in properties. Reading the wrong one puts every earthquake in the sky.
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
       * The authority that computed it, which EMSC relays rather than produces: `BMKG` for Indonesia,
       * `AK` for the Alaska Earthquake Center. USGS carries the same fact under `net`.
       *
       * `source_catalog` is deliberately not read. It is always `EMSC-RTS`, and reading a review state out
       * of a catalogue name is guessing about provenance.
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
    // Nulled before closing, so the close handler this triggers sees no current socket and does not treat
    // our own teardown as a dropped connection worth reconnecting from.
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
   * One catalogue fetch, fired alongside the connection rather than before it. Not awaited: a slow catalogue
   * must never delay the socket, and if it fails nothing is reported as broken, because the feed is
   * genuinely live either way.
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
      // Tracked over the page, not over what was delivered from it. The delivered list is the page minus
      // whatever the socket already pushed, so reading the edge off it would let a single duplicate at the
      // far end of a truncated page move the claim forwards in time.
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
       * How far back this seed actually reaches, which is not always the whole window. The request is capped
       * at SEED_LIMIT, so a full page vouches only as far as its oldest event.
       *
       * A short page vouches for everything it asked for, and that is measured rather than assumed: the
       * portal's own ceiling is 20,000 rows, so `SEED_LIMIT` is always the binding limit. Checked in
       * `emsc.live.test.ts`.
       */
      const full = payload.features.length >= SEED_LIMIT;
      /*
       * A truncated page nothing could be parsed out of vouches for nothing. Falling through to the full span
       * is exactly wrong here: the page was cut short and the app has no idea where, so claiming the whole
       * window claims a month on the strength of zero events.
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
    // Both funnel to the same place. A socket that errors always closes afterwards, and treating them
    // separately double-counts the failure and halves the backoff.
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
