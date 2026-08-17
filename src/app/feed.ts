import { createStore, type Store, type StoreStats } from "../data/store";
import type { Filters, Quake, SourceId } from "../data/types";
import { createEmscSource } from "../sources/emsc";
import { createUsgsSource } from "../sources/usgs";
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
  /** True for the first announcement only: the daily seed, not live arrivals. */
  seeding: boolean;
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
export function frontsFor(snapshot: Pick<FeedSnapshot, "arrived" | "seeding">): Quake[] {
  return snapshot.seeding ? snapshot.arrived.slice(-1) : snapshot.arrived;
}

export interface Feed {
  store: Store;
  start: () => void;
  stop: () => void;
  subscribe: (fn: (snapshot: FeedSnapshot) => void) => () => void;
  snapshot: () => FeedSnapshot;
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
  /*
   * Capped. The daily seed creates 227 quakes in one batch and a large aftershock sequence can
   * deliver dozens; holding them all to hand to a subscriber that only wants the newest would make
   * this array the one unbounded thing in an app built around a bounded store.
   */
  const ARRIVAL_LIMIT = 64;
  let arrived: Quake[] = [];

  const sources: GeoEventSource[] = [
    createUsgsSource(browserRuntime),
    createEmscSource(browserRuntime),
  ];

  const snapshot = (): FeedSnapshot => ({
    stats: store.stats(),
    statuses: { ...statuses },
    revision,
    arrived,
    seeding: !announced,
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
      announced = true;
      arrived = [];
      for (const fn of listeners) fn(s);
    });
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
        });
      }
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
