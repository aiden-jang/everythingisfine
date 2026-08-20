import { createStore, type Store, type StoreStats } from "../data/store";
import type { Filters, Quake, SourceId } from "../data/types";
import { createEmscSource } from "../sources/emsc";
import { createUsgsSource, usgsSeedFor } from "../sources/usgs";
import { browserRuntime, type GeoEventSource, type SourceStatus } from "../sources/types";

/*
 * The two feeds, the store, and whoever needs to know something changed.
 *
 * Deliberately not a React store. Events arrive continuously and the rail needs a number out of
 * them, but the globe needs fifty thousand positions out of them, and routing that second path
 * through React state would re-render a tree once per earthquake. So this owns the data and
 * announces that it moved; the canvas reads it directly and the interface subscribes for counts.
 */

export interface FeedSnapshot {
  stats: StoreStats;
  statuses: Record<SourceId, SourceStatus>;
  /** Bumped on every ingest, so a subscriber can tell "nothing changed" from "same total". */
  revision: number;
  /**
   * Quakes newly created since the previous announcement, oldest first.
   *
   * Needed because a wavefront belongs to an *arrival*, not to a state. A subscriber handed only
   * totals cannot tell one new magnitude 5 from a revision to an existing one, and would either
   * miss fronts or fire them twice.
   */
  arrived: Quake[];
  /**
   * True for the first announcement that actually carries events: the daily seed.
   *
   * Not "the first announcement". Announcements also fire on status changes, and a source going
   * live always beats its own first batch of data, so the very first one is reliably empty. Keying
   * off it meant `seeding` was spent before any event existed, and then the seed itself arrived
   * looking like ordinary live traffic. That silently gave the seed's 227 events 227 wavefronts
   * instead of one, and it is why the entrance replay never started.
   */
  seeding: boolean;
  /**
   * The timestamp from which this page believes it has complete coverage, or null before the seed.
   *
   * Reported by whichever source actually fetched a backlog, never inferred.
   *
   * Two wrong versions before this one. Reading the earliest *arrival* said "still filling" forever,
   * because both sources seed a whole day at page open so every event in a full buffer arrives at
   * once. Inferring it from the first delivery that carried events then claimed a covered day when
   * the seed requests had failed and two stray socket pushes arrived: "0 events, last 24 hours".
   *
   * Only a source that fetched a backlog knows how far back it goes, and only EMSC's is capped, so
   * only EMSC can be truncated. The earliest of what they report is the honest left edge.
   */
  coveredSince: number | null;
  /**
   * The same fact per agency, because the earliest of the two hides the disagreement.
   *
   * `coveredSince` is a min, which is the right left edge for the strip and the wrong number to show
   * beside two feeds: it takes whichever reached furthest and lets the other stand behind it. EMSC's
   * catalogue returns its most recent page whatever window is asked for, so at a month USGS vouches
   * for thirty days and EMSC for the last eighteen hours, and the header went on printing a "both"
   * count over the whole span with nothing saying where corroboration was even possible.
   *
   * Null for a source that has not reported a backlog, which is not the same as one that reported a
   * short one.
   */
  covered: Record<SourceId, number | null>;
}



/**
 * Which arrivals deserve a wavefront.
 *
 * Extracted from the canvas because it is a rule, not a rendering detail, and because the canvas
 * cannot be asked about it: announcements are coalesced through requestAnimationFrame, which a
 * hidden tab suspends, so observing this on a real cold load is not something a test can do.
 *
 * The seed creates 227 quakes at once and none of them just happened. Firing 227 fronts would be a
 * fireworks display announcing nothing. Replaying exactly one, the most recent, is what makes the
 * first frame after a cold load already moving without claiming the whole day arrived in it.
 */
/**
 * The most fronts one announcement may fire.
 *
 * Live traffic delivers one or two events per announcement, so this changes nothing in normal running.
 * It exists for the resume case: announcements are coalesced through `requestAnimationFrame`, which a
 * backgrounded tab suspends, so arrivals pile up behind one pending callback and land together the
 * moment somebody switches back. Up to sixty-four fronts in one frame is the same fireworks display
 * announcing nothing that the seed rule exists to prevent, arriving through a different door.
 */
export const MAX_LIVE_FRONTS = 3;

export function frontsFor(snapshot: Pick<FeedSnapshot, "arrived" | "seeding">): Quake[] {
  if (snapshot.seeding) return snapshot.arrived.slice(-1);
  if (snapshot.arrived.length <= MAX_LIVE_FRONTS) return snapshot.arrived;

  // The largest, then back into arrival order: which ones is a question about what is worth
  // announcing, and the order they go out in is a separate question with an obvious answer.
  const largest = new Set(
    [...snapshot.arrived]
      .sort((a, b) => b.primary.magnitude - a.primary.magnitude)
      .slice(0, MAX_LIVE_FRONTS),
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
   * Asks the sources for a wider backlog, if this window needs one.
   *
   * Widening only. The store holds what it has fetched and the window filter decides what is drawn, so
   * narrowing needs no request and throwing the extra away would mean paying for it again on the way
   * back out. Returns whether anything was actually refetched, which is what a caller shows a
   * loading state for.
   */
  setWindow: (windowMs: number) => boolean;
}

export const DEFAULT_FILTERS: Filters = {
  minMagnitude: 2,
  windowMs: 24 * 3_600_000,
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
  /*
   * Capped. The daily seed creates 227 quakes in one batch and a large aftershock sequence can
   * deliver dozens; holding them all to hand to a subscriber that only wants the newest would make
   * this array the one unbounded thing in an app built around a bounded store.
   */
  const ARRIVAL_LIMIT = 64;
  let arrived: Quake[] = [];

  /*
   * How far back the current pair was built to fetch. Compared against, never inferred from data.
   *
   * The store's contents cannot answer this: a quiet week and a truncated week hold the same number of
   * events, and `coveredSince` already means something else, namely how far back a source will vouch
   * for rather than how far back it was asked.
   */
  let seededMs = DEFAULT_FILTERS.windowMs;
  const build = (windowMs: number): GeoEventSource[] => [
    createUsgsSource(browserRuntime, { seed: usgsSeedFor(windowMs) }),
    createEmscSource(browserRuntime, {}, windowMs / 3_600_000),
  ];
  let sources: GeoEventSource[] = build(seededMs);

  const snapshot = (): FeedSnapshot => ({
    stats: store.stats(),
    statuses: { ...statuses },
    revision,
    arrived,
    seeding: !announced,
    coveredSince,
    covered: { ...covered },
  });

  /*
   * Announcements are coalesced to one per frame.
   *
   * A USGS poll delivers its whole first hour at once, and EMSC can deliver a burst after an
   * aftershock sequence. Notifying per batch would drive one React render and one full buffer
   * rewrite per arrival; at the load the store is built for that is the difference between a
   * readout and a stutter.
   */
  let pending = 0;
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

  /*
   * Hands the current pair of sources the same three handlers.
   *
   * Extracted because a window change swaps the sources under a running feed and the wiring is the
   * only thing that has to be identical across that swap. Inline in `start`, the re-seed path would
   * have been a second copy of it, which is the shape a divergence starts in.
   */
  const wire = (): void => {
    for (const source of sources) {
      source.start({
        onReadings: (batch) => {
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
        // The earliest any source can vouch for. A second seed reaching further back widens it;
        // one reaching less far does not narrow what the first already fetched. Per source on the
        // same rule, so a window change that re-seeds cannot make an agency's reach go backwards.
        onSeeded: (from) => {
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
         * Spent again, so the wider backlog counts as a seed.
         *
         * `frontsFor` fires one wavefront for a seed and up to three for live traffic, and a re-seed
         * looks exactly like live traffic from here: a batch of events the store has never seen. Left
         * unspent, choosing a wider window let off three fronts for earthquakes that happened a
         * fortnight ago.
         */
        announced = false;
        wire();
      }
      else sources = next;
      return true;
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
