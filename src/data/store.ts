import { choosePrimary, sameEvent, TIME_WINDOW_MS } from "./reconcile";
import type { Quake, Reading, SourceId } from "./types";

/*
 * Holding the events, and letting go of them.
 *
 * The polish doc is right that this is the thing that works for an hour and fails at four, so the
 * shape is chosen for what it does at hour four rather than for what it does on the first frame.
 *
 * Eviction is by **arrival order**, not by origin time. That sounds like the lazy choice and it is
 * the honest one: with no backend the window genuinely starts when the page loads, which is why
 * DESIGN.md section 10 makes the rail say "since 21:40" rather than "last 24 hours". Evicting the
 * oldest arrival is exactly that window, and it is O(1). Evicting by origin time would need a heap
 * to describe a window the app does not actually have.
 *
 * Every index below is deleted from as carefully as it is written to. A Map that only ever grows is
 * how a live view leaks, and it leaks invisibly, because nothing about the picture on screen
 * changes while it happens.
 */

const DEFAULT_CAPACITY = 50_000;

export interface StoreStats {
  /** Distinct earthquakes currently held. */
  quakes: number;
  /** Readings currently held, per source. Sums to more than `quakes` when both feeds saw an event. */
  readings: Record<SourceId, number>;
  /** Earliest arrival still held. The honest left edge of the window. */
  since: number | null;
}

export interface Ingested {
  quake: Quake;
  /** False when this reading joined or revised an earthquake already held. */
  isNew: boolean;
  /** True when this reading came from a source that had not previously reported this earthquake. */
  corroborated: boolean;
}

export interface Store {
  ingest: (reading: Reading) => Ingested;
  get: (key: string) => Quake | undefined;
  /** Every quake, oldest arrival first. */
  forEach: (fn: (quake: Quake) => void) => void;
  /** Up to `n` most recently arrived, newest first. For the recency-ordered accessible feed. */
  latest: (n: number) => Quake[];
  stats: () => StoreStats;
  size: () => number;
  capacity: number;
  /** Internal shape, exposed so tests can assert nothing is quietly growing. */
  debugIndexSizes: () => { byReadingId: number; buckets: number; slotsInUse: number };
}

const bucketOf = (time: number): number => Math.floor(time / TIME_WINDOW_MS);

export function createStore(capacity: number = DEFAULT_CAPACITY): Store {
  // Fixed-length ring. Allocated once, never resized, so the backing array cannot be the thing
  // that grows over four hours.
  const slots: (string | null)[] = new Array<string | null>(capacity).fill(null);
  let head = 0;
  let count = 0;

  const byKey = new Map<string, Quake>();
  /** "source:id" to quake key. Makes a revision an O(1) lookup rather than a search. */
  const byReadingId = new Map<string, string>();
  /**
   * Quake keys bucketed by origin time.
   *
   * Association only ever looks within TIME_WINDOW_MS, so bucketing at exactly that width means the
   * candidates for any reading live in its own bucket and the two either side. Without this, every
   * arriving reading would be compared against all fifty thousand held events.
   */
  const buckets = new Map<number, Set<string>>();

  const readingCounts: Record<SourceId, number> = { usgs: 0, emsc: 0 };
  let arrivals = 0;

  const readingKey = (r: Reading): string => `${r.source}:${r.id}`;

  const indexBuckets = (quake: Quake): void => {
    for (const r of quake.readings) {
      const b = bucketOf(r.time);
      let set = buckets.get(b);
      if (!set) {
        set = new Set();
        buckets.set(b, set);
      }
      set.add(quake.key);
    }
  };

  const evict = (): void => {
    const key = slots[head];
    slots[head] = null;
    head = (head + 1) % capacity;
    count -= 1;
    if (!key) return;

    const quake = byKey.get(key);
    byKey.delete(key);
    if (!quake) return;

    for (const r of quake.readings) {
      byReadingId.delete(readingKey(r));
      readingCounts[r.source] -= 1;
      const b = bucketOf(r.time);
      const set = buckets.get(b);
      if (!set) continue;
      set.delete(key);
      // Deleting the empty Set is the whole point. Leaving it behind is a slow leak that looks
      // like nothing on screen and is the exact failure the four-hour test exists to catch.
      if (set.size === 0) buckets.delete(b);
    }
  };

  /** The quake this reading belongs to, if we already hold it. */
  const findExisting = (reading: Reading): Quake | undefined => {
    const revised = byReadingId.get(readingKey(reading));
    if (revised) return byKey.get(revised);

    const b = bucketOf(reading.time);
    for (let d = -1; d <= 1; d += 1) {
      const set = buckets.get(b + d);
      if (!set) continue;
      for (const key of set) {
        const candidate = byKey.get(key);
        if (!candidate) continue;
        if (candidate.readings.some((r) => sameEvent(r, reading))) return candidate;
      }
    }
    return undefined;
  };

  const ingest = (reading: Reading): Ingested => {
    const existing = findExisting(reading);

    if (existing) {
      const at = existing.readings.findIndex((r) => r.source === reading.source);
      let corroborated = false;
      if (at >= 0) {
        // A revision from an agency that already reported. Replace rather than append, or a busy
        // event that gets updated all afternoon grows an unbounded array inside a bounded store.
        const old = existing.readings[at]!;
        byReadingId.delete(readingKey(old));
        const oldBucket = bucketOf(old.time);
        if (oldBucket !== bucketOf(reading.time)) {
          const set = buckets.get(oldBucket);
          if (set) {
            set.delete(existing.key);
            if (set.size === 0) buckets.delete(oldBucket);
          }
        }
        existing.readings[at] = reading;
      } else {
        existing.readings.push(reading);
        readingCounts[reading.source] += 1;
        corroborated = true;
      }
      byReadingId.set(readingKey(reading), existing.key);
      indexBuckets(existing);
      existing.primary = choosePrimary(existing.readings);
      return { quake: existing, isNew: false, corroborated };
    }

    if (count === capacity) evict();

    arrivals += 1;
    const quake: Quake = {
      // Ours, and independent of any agency's numbering, so a source swap later cannot collide.
      key: `q${arrivals.toString(36)}`,
      readings: [reading],
      primary: reading,
    };
    byKey.set(quake.key, quake);
    byReadingId.set(readingKey(reading), quake.key);
    readingCounts[reading.source] += 1;
    indexBuckets(quake);

    const tail = (head + count) % capacity;
    slots[tail] = quake.key;
    count += 1;
    return { quake, isNew: true, corroborated: false };
  };

  const forEach = (fn: (quake: Quake) => void): void => {
    for (let i = 0; i < count; i += 1) {
      const key = slots[(head + i) % capacity];
      if (!key) continue;
      const q = byKey.get(key);
      if (q) fn(q);
    }
  };

  return {
    ingest,
    forEach,
    capacity,
    get: (key) => byKey.get(key),
    size: () => count,
    latest: (n) => {
      const out: Quake[] = [];
      for (let i = count - 1; i >= 0 && out.length < n; i -= 1) {
        const key = slots[(head + i) % capacity];
        if (!key) continue;
        const q = byKey.get(key);
        if (q) out.push(q);
      }
      return out;
    },
    stats: () => {
      let since: number | null = null;
      for (let i = 0; i < count; i += 1) {
        const key = slots[(head + i) % capacity];
        const q = key ? byKey.get(key) : undefined;
        if (q) {
          since = Math.min(...q.readings.map((r) => r.receivedAt));
          break;
        }
      }
      return { quakes: count, readings: { ...readingCounts }, since };
    },
    debugIndexSizes: () => ({
      byReadingId: byReadingId.size,
      buckets: buckets.size,
      slotsInUse: slots.reduce<number>((n, s) => n + (s === null ? 0 : 1), 0),
    }),
  };
}
