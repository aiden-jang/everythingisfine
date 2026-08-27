import { choosePrimary, sameEvent, TIME_WINDOW_MS } from "./reconcile";
import type { Quake, Reading, SourceId } from "./types";

/*
 * Holds the events and lets go of them.
 *
 * Evict by arrival order, never by origin time. With no backend the window really does start when the page
 * loads, which is why the rail says "since 21:40". Arrival order is exactly that window and it is O(1);
 * origin time would need a heap to describe a window the app does not have.
 *
 * Delete from every index as carefully as you write to it. A Map that only grows is how a live view leaks,
 * and nothing on screen changes while it happens.
 */

const DEFAULT_CAPACITY = 50_000;

export interface StoreStats {
  /** Distinct earthquakes currently held. */
  quakes: number;
  /** Readings currently held, per source. Sums to more than `quakes` when both feeds saw an event. */
  readings: Record<SourceId, number>;
  /** Events both agencies reported. Counted as it happens rather than derived: deriving means walking
   * fifty thousand events on every announcement to display one number. */
  corroborated: number;
  /** Events where at least one agency has changed its own magnitude. Counted as it happens, like
   * `corroborated`, for the same reason. */
  revised: number;
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
  /**
   * Empties it, keeping the allocation. For switching between live and an archived day, which must never
   * mix: an archive plus whatever the socket pushed while you read it is a day that never happened. The
   * ring is reused rather than reallocated, because the capacity is what the four-hour heap test is about.
   */
  clear: () => void;
  get: (key: string) => Quake | undefined;
  /** The quake an agency's own identifier belongs to. Permalinks need it: our key is an arrival counter,
   * stable within one page and meaningless across two. */
  findByReading: (source: SourceId, id: string) => Quake | undefined;
  /** Every quake, oldest arrival first. */
  forEach: (fn: (quake: Quake) => void) => void;
  /**
   * Up to `n` most recently arrived, in reverse arrival order. Which is not time order and is nobody's idea
   * of "recent": a seed delivers a whole window at once, and USGS lists newest first, so the last thing to
   * arrive from a month's seed is the oldest event in it. Anything wanting recency wants `newest`.
   */
  latest: (n: number) => Quake[];
  /** Up to `n` newest by origin time, filtered before selection. The filter is taken rather than applied
   * afterwards because selecting first cannot be made correct: it returns however many of the top `n`
   * happen to pass, which is fewer than `n` and sometimes none. */
  newest: (n: number, keep?: (quake: Quake) => boolean) => Quake[];
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
   * Quake keys bucketed by origin time. Association only looks within TIME_WINDOW_MS, so bucketing at
   * exactly that width puts every candidate in its own bucket and the two either side. Without it, every
   * arriving reading would be compared against all fifty thousand held events.
   */
  const buckets = new Map<number, Set<string>>();

  const readingCounts: Record<SourceId, number> = { usgs: 0, emsc: 0 };
  let corroborated = 0;
  let revised = 0;
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
    if (quake.readings.length > 1) corroborated -= 1;
    if (quake.readings.some((r) => r.revision)) revised -= 1;

    for (const r of quake.readings) {
      byReadingId.delete(readingKey(r));
      readingCounts[r.source] -= 1;
      const b = bucketOf(r.time);
      const set = buckets.get(b);
      if (!set) continue;
      set.delete(key);
      // Deleting the empty Set is the whole point. Leaving it behind is a slow leak that looks like nothing
      // on screen, which is the exact failure the four-hour test exists to catch.
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
      let corroboratedNow = false;
      if (at >= 0) {
        // A revision from an agency that already reported. Replace rather than append, or a busy event
        // updated all afternoon grows an unbounded array inside a bounded store.
        const old = existing.readings[at]!;
        /*
         * A changed magnitude, not merely a redelivered one. USGS's day and hour feeds both re-serve every
         * event they hold, so this branch runs on every poll whether anything moved or not: counting
         * arrivals here would have every earthquake claiming twenty revisions by evening.
         */
        let stored = reading;
        // NaN is how both feeds spell "no depth given", and NaN !== NaN, so a plain comparison reports a
        // revision on every re-poll of an event that never had one.
        const depthMoved = Number.isFinite(old.depthKm) || Number.isFinite(reading.depthKm)
          ? old.depthKm !== reading.depthKm
          : false;
        if (old.magnitude !== reading.magnitude || depthMoved) {
          /*
           * Once per event, not once per agency, because eviction refunds it once per event. Incrementing
           * per reading and decrementing per event is a slow leak: an earthquake both agencies revised
           * added two and gave one back.
           */
          if (!existing.readings.some((r) => r.revision)) revised += 1;
          stored = {
            ...reading,
            revision: {
              fromMagnitude: old.revision?.fromMagnitude ?? old.magnitude,
              fromDepthKm: old.revision?.fromDepthKm
                ?? (Number.isFinite(old.depthKm) ? old.depthKm : null),
              count: (old.revision?.count ?? 0) + 1,
              at: reading.receivedAt,
            },
          };
        } else if (old.revision) {
          // A redelivery of an already-revised reading keeps the history rather than dropping it.
          stored = { ...reading, revision: old.revision };
        }
        byReadingId.delete(readingKey(old));
        const oldBucket = bucketOf(old.time);
        if (oldBucket !== bucketOf(reading.time)) {
          const set = buckets.get(oldBucket);
          if (set) {
            set.delete(existing.key);
            if (set.size === 0) buckets.delete(oldBucket);
          }
        }
        existing.readings[at] = stored;
      } else {
        existing.readings.push(reading);
        readingCounts[reading.source] += 1;
        // Only the first time a second agency joins, not on every later revision of either.
        if (existing.readings.length === 2) corroborated += 1;
        corroboratedNow = true;
      }
      byReadingId.set(readingKey(reading), existing.key);
      indexBuckets(existing);
      existing.primary = choosePrimary(existing.readings);
      return { quake: existing, isNew: false, corroborated: corroboratedNow };
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

  const clear = (): void => {
    slots.fill(null);
    head = 0;
    count = 0;
    byKey.clear();
    byReadingId.clear();
    buckets.clear();
    readingCounts.usgs = 0;
    readingCounts.emsc = 0;
    corroborated = 0;
    revised = 0;
    // `arrivals` deliberately keeps counting: it is how many events this page has ever seen arrive, which
    // is a fact about the session rather than about the current contents.
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
    clear,
    forEach,
    capacity,
    get: (key) => byKey.get(key),
    findByReading: (source, id) => {
      const key = byReadingId.get(`${source}:${id}`);
      return key ? byKey.get(key) : undefined;
    },
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
    // Selection, not a sort: sorting the buffer to take sixty is O(n log n) for a fixed-size answer, on up
    // to fifty thousand events on every revision. One pass with a bounded insert is O(n).
    newest: (n, keep) => {
      const out: Quake[] = [];
      if (n <= 0) return out;
      for (let i = 0; i < count; i += 1) {
        const key = slots[(head + i) % capacity];
        if (!key) continue;
        const q = byKey.get(key);
        if (!q) continue;
        if (keep && !keep(q)) continue;
        const t = q.primary.time;
        // Full and older than the worst kept: the common case once the list is warm.
        if (out.length === n && t <= out[out.length - 1]!.primary.time) continue;
        let at = out.findIndex((o) => t > o.primary.time);
        if (at === -1) at = out.length;
        out.splice(at, 0, q);
        if (out.length > n) out.pop();
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
      return { quakes: count, readings: { ...readingCounts }, corroborated, revised, since };
    },
    debugIndexSizes: () => ({
      byReadingId: byReadingId.size,
      buckets: buckets.size,
      slotsInUse: slots.reduce<number>((n, s) => n + (s === null ? 0 : 1), 0),
    }),
  };
}
