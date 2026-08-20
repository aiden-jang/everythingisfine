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
  /**
   * Events both agencies reported.
   *
   * Counted as it happens rather than derived on demand: deriving means walking every held event
   * on every announcement, which is fifty thousand comparisons a frame to display one number.
   */
  corroborated: number;
  /**
   * Events where at least one agency has changed its own magnitude.
   *
   * Counted as it happens, like `corroborated`, for the same reason: deriving it means walking every
   * held event on every announcement to display one number.
   */
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
  get: (key: string) => Quake | undefined;
  /**
   * The quake an agency's own identifier belongs to.
   *
   * Permalinks need this. Our key is an arrival counter, stable within one page and meaningless
   * across two, so a shared link has to name the event the way the agency does. The index that
   * answers this already exists for revision handling; it just was not reachable.
   */
  findByReading: (source: SourceId, id: string) => Quake | undefined;
  /** Every quake, oldest arrival first. */
  forEach: (fn: (quake: Quake) => void) => void;
  /**
   * Up to `n` most recently *arrived*, in reverse arrival order.
   *
   * Arrival order, which is not time order and is nobody's idea of "recent". A seed delivers a whole
   * window at once in whatever order the agency listed it, and USGS lists newest first, so the last
   * thing to arrive from a month's seed is the oldest event in it. Anything wanting recency wants
   * `newest`.
   */
  latest: (n: number) => Quake[];
  /**
   * Up to `n` newest by origin time, newest first, optionally filtered before selection.
   *
   * The filter is taken rather than applied afterwards because selecting first and filtering second
   * cannot be made correct: it returns however many of the top `n` happen to pass, which is fewer than
   * `n` and sometimes none.
   */
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
   * Quake keys bucketed by origin time.
   *
   * Association only ever looks within TIME_WINDOW_MS, so bucketing at exactly that width means the
   * candidates for any reading live in its own bucket and the two either side. Without this, every
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
      let corroboratedNow = false;
      if (at >= 0) {
        // A revision from an agency that already reported. Replace rather than append, or a busy
        // event that gets updated all afternoon grows an unbounded array inside a bounded store.
        const old = existing.readings[at]!;
        /*
         * A changed magnitude, not merely a redelivered one.
         *
         * USGS's day and hour feeds both re-serve every event they hold, so this branch runs on
         * every poll for every event whether anything moved or not. Counting arrivals here would
         * have every earthquake on screen claiming twenty revisions by evening, which is not a
         * small inaccuracy: it would make the one honest signal in the feature meaningless.
         */
        let stored = reading;
        // NaN is how both feeds spell "no depth given", and NaN !== NaN, so a plain comparison would
        // report a revision on every re-poll of an event that never had one.
        const depthMoved = Number.isFinite(old.depthKm) || Number.isFinite(reading.depthKm)
          ? old.depthKm !== reading.depthKm
          : false;
        if (old.magnitude !== reading.magnitude || depthMoved) {
          /*
           * Once per event, not once per agency, because eviction refunds it once per event.
           *
           * Incrementing per reading and decrementing per event is a slow leak: an earthquake both
           * agencies revised added two and gave one back, so the counter drifted upward for as long
           * as the page stayed open. The unit here is the event, matching "distinct" and "both" in
           * the header beside it.
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
    /*
     * Selection, not a sort, for the reason `nearby.ts` gives about its own four: sorting the buffer to
     * take sixty is O(n log n) for a fixed-size answer, and the buffer is up to fifty thousand events on
     * every revision. One pass with a bounded insert is O(n) and touches sixty objects.
     */
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
