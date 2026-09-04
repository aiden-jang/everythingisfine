import { createStore, type Store, type StoreStats } from "../data/store";
import type { Filters, Quake, Reading, SourceId } from "../data/types";
import { createEmscSource } from "../sources/emsc";
import { createUsgsSource, usgsSeedFor } from "../sources/usgs";
import { browserRuntime, type GeoEventSource, type SourceStatus } from "../sources/types";

/* The two feeds, the store, and whoever needs to know something changed. See ARCHITECTURE.md. */

export interface FeedSnapshot {
  /** The archived span being shown, or null when live. See ARCHITECTURE.md. */
  archive: { from: number; to: number } | null;
  stats: StoreStats;
  statuses: Record<SourceId, SourceStatus>;
  /** Bumped on every ingest, so a subscriber can tell "nothing changed" from "same total". */
  revision: number;
  /** Quakes newly created since the previous announcement, oldest first. A wavefront belongs to an
   * arrival: totals alone cannot tell a new M5 from a revision to an existing one. */
  arrived: Quake[];
  /**
   * True for the first announcement that actually carries events: the daily seed. Not "the first
   * announcement". Those also fire on status changes, and a source going live beats its own first batch,
   * so the very first one is reliably empty. See ARCHITECTURE.md.
   */
  seeding: boolean;
  /**
   * The timestamp from which this page believes it has complete coverage, or null before the seed. See
   * ARCHITECTURE.md.
   */
  coveredSince: number | null;
  /** The same fact per agency, because the earliest of the two hides the disagreement. See ARCHITECTURE.md. */
  covered: Record<SourceId, number | null>;
}

/** The most fronts one announcement may fire. See ARCHITECTURE.md. */
export const MAX_LIVE_FRONTS = 3;

/** Which arrivals deserve a wavefront. See ARCHITECTURE.md. */
export function frontsFor(snapshot: Pick<FeedSnapshot, "arrived" | "seeding">): Quake[] {
  if (snapshot.seeding) return snapshot.arrived.slice(-1);
  if (snapshot.arrived.length <= MAX_LIVE_FRONTS) return snapshot.arrived;

  // The largest, then back into arrival order: which ones is a question about what is worth announcing,
  // and the order they go out in is a separate question.
  const largest = new Set(
    [...snapshot.arrived].sort((a, b) => b.primary.magnitude - a.primary.magnitude).slice(0, MAX_LIVE_FRONTS),
  );
  return snapshot.arrived.filter((q) => largest.has(q));
}

export interface Feed {
  store: Store;
  start: () => void;
  stop: () => void;
  subscribe: (fn: (snapshot: FeedSnapshot) => void) => () => void;
  snapshot: () => FeedSnapshot;
  /**
   * Asks the sources for a wider backlog, if this window needs one. Widening only: the window filter decides
   * what is drawn, so narrowing needs no request and throwing the extra away means paying for it again.
   */
  setWindow: (windowMs: number) => boolean;
  /** Replaces everything with an archived span, and stops listening to the present. See ARCHITECTURE.md. */
  showArchive: (span: { from: number; to: number }, readings: readonly Reading[]) => void;
  /** Back to now: empties the archive and restarts the sources from scratch. */
  resumeLive: () => void;
}

export const DEFAULT_FILTERS: Filters = {
  minMagnitude: 2,
  /*
   * A week. Hardly any storm, fire or flood starts inside a given day, so a day opens with five layers
   * empty. It costs the 1.5MB `all_week` seed on load, which `usgs.ts` argues against - that was weighed.
   */
  windowMs: 7 * 24 * 3_600_000,
  sources: new Set<SourceId>(["usgs", "emsc"]),
};

export function createFeed(capacity = 50_000): Feed {
  const store = createStore(capacity);
  const listeners = new Set<(snapshot: FeedSnapshot) => void>();
  const statuses: Record<SourceId, SourceStatus> = {
    usgs: { kind: "idle" },
    emsc: { kind: "idle" },
  };
  let revision = 0;
  let running = false;
  let announced = false;
  let coveredSince: number | null = null;
  const covered: Record<SourceId, number | null> = { usgs: null, emsc: null };
  // Capped. The daily seed creates 227 quakes in one batch, and holding them all to hand to a subscriber
  // that wants the newest would make this the one unbounded thing in an app built around a bounded store.
  const ARRIVAL_LIMIT = 64;
  let arrived: Quake[] = [];

  // How far back the current pair was built to fetch. Compared against, never inferred: a quiet week and a
  // truncated week hold the same number of events, and `coveredSince` answers a different question.
  let seededMs = DEFAULT_FILTERS.windowMs;
  const build = (windowMs: number): GeoEventSource[] => [
    createUsgsSource(browserRuntime, { seed: usgsSeedFor(windowMs) }),
    createEmscSource(browserRuntime, {}, windowMs / 3_600_000),
  ];
  let sources: GeoEventSource[] = build(seededMs);
  let archive: { from: number; to: number } | null = null;

  const snapshot = (): FeedSnapshot => ({
    archive,
    stats: store.stats(),
    statuses: { ...statuses },
    revision,
    arrived,
    seeding: !announced,
    coveredSince,
    covered: { ...covered },
  });

  /*
   * Announcements are coalesced to one per frame. A USGS poll delivers its whole first hour at once, and
   * notifying per batch would drive one React render and one full buffer rewrite per arrival.
   */
  let pending = 0;
  /*
   * Delivered now, not on the next frame. A mode change happens once, because somebody pressed something,
   * and deferring it to the frame clock made it depend on the page being painted: a hidden tab never fires
   * rAF, so an archived day loaded and no subscriber heard.
   */
  const announceNow = (): void => {
    const s = snapshot();
    if (s.arrived.length > 0) announced = true;
    arrived = [];
    for (const fn of listeners) fn(s);
  };
  const announce = (): void => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const s = snapshot();
      // Only a delivery counts as having seeded. An empty status announcement leaves it unspent.
      if (s.arrived.length > 0) announced = true;
      arrived = [];
      for (const fn of listeners) fn(s);
    });
  };

  // Extracted because a window change swaps the sources under a running feed, and the wiring is the one
  // thing that must be identical across that swap. Inline, the re-seed path would be a second copy.
  const wire = (): void => {
    for (const source of sources) {
      source.start({
        onReadings: (batch) => {
          // Stopping a source cannot recall a request already in flight. Its answer landed in the
          // archived day, dated later than the day's end, and every event clamped into the newest bucket.
          if (archive !== null) return;
          for (const reading of batch) {
            const result = store.ingest(reading);
            if (result.isNew && arrived.length < ARRIVAL_LIMIT) arrived.push(result.quake);
          }
          revision += 1;
          announce();
        },
        onStatus: (status) => {
          statuses[source.id] = status;
          announce();
        },
        // Only ever wider. A second seed reaching further back widens it; one reaching less far does not
        // narrow what the first already fetched.
        onSeeded: (from) => {
          // Same race. An archived day's coverage is the span it asked for.
          if (archive !== null) return;
          coveredSince = coveredSince === null ? from : Math.min(coveredSince, from);
          const held = covered[source.id];
          covered[source.id] = held === null ? from : Math.min(held, from);
          announce();
        },
      });
    }
  };

  return {
    store,
    snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start: () => {
      if (running) return;
      running = true;
      wire();
    },
    setWindow: (windowMs) => {
      // Only ever wider. See the note on the interface.
      if (windowMs <= seededMs) return false;
      seededMs = windowMs;
      const next = build(windowMs);
      if (running) {
        for (const source of sources) source.stop();
        sources = next;
        /*
         * Spent again, so the wider backlog counts as a seed. A re-seed looks exactly like live traffic from
         * here, and left unspent, choosing a wider window let off three fronts for fortnight-old earthquakes.
         */
        announced = false;
        wire();
      } else sources = next;
      return true;
    },
    showArchive: (span, readings) => {
      // The present is switched off first, so nothing can arrive between the clear and the load.
      for (const source of sources) source.stop();
      running = false;
      store.clear();
      arrived = [];
      /*
       * Unspent, so this counts as a seed. Same reasoning as the re-seed in `setWindow`: a day of archived
       * events would otherwise let off wavefronts and announce itself to a screen reader as news.
       */
      announced = false;
      archive = span;
      for (const reading of readings) store.ingest(reading);
      /*
       * Coverage is the span requested, not the earliest row returned. The live path has to infer it,
       * because a truncated page must not claim a whole day; here the request names both ends, and whether
       * the answer was truncated is reported separately beside the counts.
       */
      coveredSince = span.from;
      covered.usgs = span.from;
      covered.emsc = span.from;
      revision += 1;
      announceNow();
    },
    resumeLive: () => {
      archive = null;
      store.clear();
      arrived = [];
      announced = false;
      coveredSince = null;
      covered.usgs = null;
      covered.emsc = null;
      revision += 1;
      // Rebuilt rather than restarted: a stopped source has spent its seed, and the live view needs a
      // fresh backlog rather than only whatever arrives next.
      sources = build(seededMs);
      running = true;
      wire();
      announceNow();
    },
    stop: () => {
      running = false;
      for (const source of sources) source.stop();
      if (pending) cancelAnimationFrame(pending);
      pending = 0;
      announced = false;
      arrived = [];
      listeners.clear();
    },
  };
}
