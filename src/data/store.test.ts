import { describe, expect, it } from "vitest";
import { createStore } from "./store";
import { syntheticReadings } from "./fixtures";
import { distanceKm } from "../geo/sphere";
import type { Reading } from "./types";

/*
 * The one Node global this file needs, declared rather than imported. Installing @types/node would put
 * every Node global into a browser-only app's type surface, where `setTimeout` returns a Timeout and a
 * genuine mistake typechecks.
 */
declare const process: { memoryUsage: () => { heapUsed: number } };

const reading = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs",
  id: "a1",
  magnitude: 5.2,
  scale: "Mww",
  lon: 141.3,
  lat: 41.8,
  depthKm: 40,
  time: 1_700_000_000_000,
  place: "40 km E of Hakodate",
  kind: "earthquake",
  receivedAt: 1_700_000_020_000,
  ...over,
});

describe("revisions", () => {
  it("remembers what the agency first said", () => {
    const store = createStore(100);
    store.ingest(reading({ magnitude: 6.1 }));
    const { quake } = store.ingest(reading({ magnitude: 6.4, receivedAt: 1_700_003_600_000 }));

    expect(quake.primary.magnitude).toBe(6.4);
    expect(quake.primary.revision).toEqual({
      fromMagnitude: 6.1,
      fromDepthKm: 40,
      count: 1,
      at: 1_700_003_600_000,
    });
    expect(store.stats().revised).toBe(1);
  });

  it("keeps the first value across a second revision, not the previous one", () => {
    const store = createStore(100);
    store.ingest(reading({ magnitude: 6.1 }));
    store.ingest(reading({ magnitude: 6.2 }));
    const { quake } = store.ingest(reading({ magnitude: 6.4 }));

    // 6.1, not 6.2. What an agency first said is the fact worth keeping; the middle of the trail
    // answers nothing anybody asks.
    expect(quake.primary.revision).toMatchObject({ fromMagnitude: 6.1, count: 2 });
    expect(store.stats().revised).toBe(1);
  });

  it("counts a depth reassessment, which changes what the earthquake is", () => {
    // 40km is inside a descending slab; 10km is the crust, where the damage happens.
    const store = createStore(100);
    store.ingest(reading({ depthKm: 40 }));
    const { quake } = store.ingest(reading({ depthKm: 10 }));

    expect(quake.primary.revision).toMatchObject({ fromDepthKm: 40, fromMagnitude: 5.2, count: 1 });
    expect(store.stats().revised).toBe(1);
  });

  it("does not call a missing depth a revision, however many times it is redelivered", () => {
    // Both feeds spell "no depth given" as NaN, and NaN !== NaN, so the obvious comparison reports a
    // revision on every single poll of an event that never had one.
    const store = createStore(100);
    store.ingest(reading({ depthKm: NaN }));
    for (let i = 0; i < 5; i += 1) store.ingest(reading({ depthKm: NaN }));

    expect(store.stats().revised).toBe(0);
  });

  it("keeps the first depth across a later magnitude-only change", () => {
    const store = createStore(100);
    store.ingest(reading({ magnitude: 6.1, depthKm: 40 }));
    store.ingest(reading({ magnitude: 6.1, depthKm: 12 }));
    const { quake } = store.ingest(reading({ magnitude: 6.4, depthKm: 12 }));

    expect(quake.primary.revision).toMatchObject({ fromMagnitude: 6.1, fromDepthKm: 40, count: 2 });
  });

  it("does not count a re-poll that changed nothing", () => {
    // Both USGS feeds re-serve every event they hold, so the replace branch runs on every poll. Counting
    // arrivals there would have every earthquake claiming twenty revisions by evening.
    const store = createStore(100);
    store.ingest(reading());
    for (let i = 0; i < 20; i += 1) store.ingest(reading({ receivedAt: 1_700_000_020_000 + i }));

    const { quake } = store.ingest(reading());
    expect(quake.primary.revision).toBeUndefined();
    expect(store.stats().revised).toBe(0);
  });

  it("keeps the history when an already-revised reading is redelivered", () => {
    const store = createStore(100);
    store.ingest(reading({ magnitude: 6.1 }));
    store.ingest(reading({ magnitude: 6.4 }));
    const { quake } = store.ingest(reading({ magnitude: 6.4, receivedAt: 1_700_007_200_000 }));

    expect(quake.primary.revision).toMatchObject({ fromMagnitude: 6.1, count: 1 });
    expect(store.stats().revised).toBe(1);
  });

  it("counts each agency's own change once, not the event twice", () => {
    const store = createStore(100);
    store.ingest(reading({ magnitude: 6.1 }));
    store.ingest(
      reading({
        source: "emsc",
        id: "e9",
        magnitude: 5.9,
        scale: "mb",
        lon: 141.44,
        lat: 41.79,
        time: 1_700_000_008_000,
      }),
    );
    store.ingest(reading({ magnitude: 6.4 }));
    store.ingest(
      reading({
        source: "emsc",
        id: "e9",
        magnitude: 6.2,
        scale: "mb",
        lon: 141.44,
        lat: 41.79,
        time: 1_700_000_008_000,
      }),
    );

    // One event, both agencies revised. The stat counts events, so it is 1.
    expect(store.stats().revised).toBe(1);
  });

  it("does not drift upward as revised events churn through eviction", () => {
    // The shape of the bug above: an increment and a refund on different units drifts for as long as the
    // page is open, and one event at a time never shows it.
    const store = createStore(10);
    for (let i = 0; i < 200; i += 1) {
      const base = {
        id: `u${i}`,
        lon: (i % 170) - 85,
        lat: (i % 80) - 40,
        time: 1_700_000_000_000 + i * 60_000,
      };
      store.ingest(reading({ ...base, magnitude: 5.0 }));
      store.ingest(reading({ ...base, magnitude: 5.3 }));
      store.ingest(
        reading({
          ...base,
          source: "emsc",
          id: `e${i}`,
          magnitude: 4.8,
          scale: "mb",
          time: base.time + 5_000,
        }),
      );
      store.ingest(
        reading({
          ...base,
          source: "emsc",
          id: `e${i}`,
          magnitude: 5.1,
          scale: "mb",
          time: base.time + 5_000,
        }),
      );
    }
    expect(store.stats().revised).toBeLessThanOrEqual(store.stats().quakes);
  });

  it("gives the count back when a revised event is evicted", () => {
    const store = createStore(1);
    store.ingest(reading({ magnitude: 6.1 }));
    store.ingest(reading({ magnitude: 6.4 }));
    expect(store.stats().revised).toBe(1);

    store.ingest(reading({ id: "z9", lon: 10, lat: 10, time: 1_600_000_000_000 }));
    expect(store.stats().revised).toBe(0);
  });
});

describe("association", () => {
  it("merges two agencies reporting one rupture", () => {
    const store = createStore(100);
    const a = store.ingest(reading());
    // Eight seconds and about 12km apart: the disagreement two agencies actually show.
    const b = store.ingest(
      reading({
        source: "emsc",
        id: "e9",
        magnitude: 4.9,
        scale: "mb",
        lon: 141.44,
        lat: 41.79,
        time: 1_700_000_008_000,
      }),
    );

    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.corroborated).toBe(true);
    expect(store.size()).toBe(1);
    expect(b.quake.readings).toHaveLength(2);
  });

  it("keeps both readings rather than picking a winner", () => {
    const store = createStore(100);
    store.ingest(reading());
    const { quake } = store.ingest(
      reading({
        source: "emsc",
        id: "e9",
        magnitude: 4.9,
        scale: "mb",
        lon: 141.44,
        lat: 41.79,
      }),
    );

    expect(quake.readings.map((r) => r.magnitude).sort()).toEqual([4.9, 5.2]);
    expect(quake.readings.map((r) => r.scale).sort()).toEqual(["Mww", "mb"]);
    // USGS is the catalogue of record, so the marker is drawn from it either way round.
    expect(quake.primary.source).toBe("usgs");
  });

  it("chooses the same primary whichever order the feeds arrive in", () => {
    const emsc = reading({ source: "emsc", id: "e9", magnitude: 4.9, scale: "mb" });
    const first = createStore(10);
    first.ingest(reading());
    first.ingest(emsc);
    const second = createStore(10);
    second.ingest(emsc);
    second.ingest(reading());

    expect(first.latest(1)[0]?.primary.source).toBe("usgs");
    expect(second.latest(1)[0]?.primary.source).toBe("usgs");
  });

  it("keeps separate events apart when only one window is satisfied", () => {
    const store = createStore(100);
    store.ingest(reading());
    // Same place, two minutes later: outside the time window.
    store.ingest(reading({ source: "emsc", id: "e1", time: 1_700_000_120_001 }));
    // Same instant, on another continent: outside the distance window.
    store.ingest(reading({ source: "emsc", id: "e2", lon: -70, lat: -33 }));

    expect(store.size()).toBe(3);
  });

  it("treats a repeat from the same agency as a revision, not a second event", () => {
    const store = createStore(100);
    store.ingest(reading());
    const revised = store.ingest(reading({ magnitude: 5.6 }));

    expect(store.size()).toBe(1);
    expect(revised.corroborated).toBe(false);
    expect(revised.quake.readings).toHaveLength(1);
    expect(revised.quake.primary.magnitude).toBe(5.6);
  });

  it("does not grow a quake that one agency revises repeatedly", () => {
    const store = createStore(100);
    for (let i = 0; i < 500; i += 1) store.ingest(reading({ magnitude: 5 + i / 1000 }));

    expect(store.size()).toBe(1);
    expect(store.latest(1)[0]?.readings).toHaveLength(1);
    expect(store.debugIndexSizes().byReadingId).toBe(1);
  });

  it("associates across the antimeridian", () => {
    const store = createStore(10);
    store.ingest(reading({ lon: 179.9, lat: 0 }));
    store.ingest(reading({ source: "emsc", id: "e1", lon: -179.9, lat: 0 }));

    // 0.2 degrees at the equator is about 22km, and the two are on opposite sides of the date line. A naive
    // subtraction would call it 40,000km apart.
    expect(distanceKm(179.9, 0, -179.9, 0)).toBeLessThan(30);
    expect(store.size()).toBe(1);
  });
});

describe("ring buffer", () => {
  it("never exceeds capacity and drops the oldest arrival", () => {
    const store = createStore(50);
    for (let i = 0; i < 500; i += 1) {
      store.ingest(reading({ id: `u${i}`, time: 1_700_000_000_000 + i * 600_000 }));
    }

    expect(store.size()).toBe(50);
    const held: number[] = [];
    store.forEach((q) => held.push(q.primary.time));
    expect(held).toHaveLength(50);
    expect(held[0]).toBe(1_700_000_000_000 + 450 * 600_000);
    expect(held.at(-1)).toBe(1_700_000_000_000 + 499 * 600_000);
  });

  it("hands back the newest arrivals first", () => {
    const store = createStore(20);
    for (let i = 0; i < 30; i += 1) {
      store.ingest(reading({ id: `u${i}`, time: 1_700_000_000_000 + i * 600_000 }));
    }
    const newest = store.latest(3).map((q) => q.primary.id);
    expect(newest).toEqual(["u29", "u28", "u27"]);
  });

  it("reports the honest left edge of the window", () => {
    const store = createStore(5);
    expect(store.stats().since).toBeNull();
    for (let i = 0; i < 9; i += 1) {
      store.ingest(
        reading({
          id: `u${i}`,
          time: 1_700_000_000_000 + i * 600_000,
          receivedAt: 1_700_000_030_000 + i * 600_000,
        }),
      );
    }
    // Four have been evicted, so the earliest arrival still held is the fifth.
    expect(store.stats().since).toBe(1_700_000_030_000 + 4 * 600_000);
  });
});

/* The failure that only shows up in a demo left running for hours. See ARCHITECTURE.md#srcdatastoretestts. */
describe("the long session", () => {
  it("stays flat across four simulated hours", () => {
    const capacity = 1_000;
    const store = createStore(capacity);
    const start = 1_700_000_000_000;

    let ingested = 0;
    let created = 0;
    const samples: { at: number; byReadingId: number; buckets: number; slots: number }[] = [];

    for (const r of syntheticReadings({
      start,
      durationMs: 4 * 60 * 60 * 1000,
      everySeconds: 4,
      corroboration: 0.55,
      seed: 7,
    })) {
      if (store.ingest(r).isNew) created += 1;
      ingested += 1;
      if (ingested % 500 === 0) {
        const d = store.debugIndexSizes();
        samples.push({ at: ingested, byReadingId: d.byReadingId, buckets: d.buckets, slots: d.slotsInUse });
      }
    }

    // The buffer has to have turned over completely more than once, or this measures a warm-up rather than
    // a steady state. Counted in evictions, which is the thing that has to be correct.
    const evictions = created - capacity;
    expect(evictions).toBeGreaterThan(capacity);
    expect(store.size()).toBe(capacity);

    const settled = samples.slice(Math.ceil(samples.length / 2));
    expect(settled.length).toBeGreaterThan(3);

    for (const s of settled) {
      // Occupied slots exactly equal the capacity: no key left behind, none lost.
      expect(s.slots).toBe(capacity);
      // At most one reading per source per quake, so this is bounded by capacity times sources.
      expect(s.byReadingId).toBeLessThanOrEqual(capacity * 2);
      // The bucket index is the one that leaks silently: an emptied Set that is never deleted costs nothing
      // visible and accumulates one entry per minute of wall clock forever.
      expect(s.buckets).toBeLessThan(capacity);
    }

    // Flatness, not just boundedness. The last sample must not be meaningfully larger than the first
    // settled one, which is what separates a leak from a warm-up.
    const first = settled[0]!;
    const last = settled.at(-1)!;
    expect(last.byReadingId).toBeLessThanOrEqual(first.byReadingId * 1.05);
    expect(last.buckets).toBeLessThanOrEqual(first.buckets * 1.05);
  });

  /*
   * `skipIf` rather than an early return. Returning early with a console note reported green whether or not
   * it had measured anything, because the default reporter swallows stdout for passing tests.
   */
  /* The warm-up has to fill the ring, or this measures the ring filling rather than the ring holding.
     Checked by making it fail: one retained three-field object per ingest costs 2.302MB, 4.6x over. See ARCHITECTURE.md#srcdatastoretestts. */
  it.skipIf(!(globalThis as { gc?: () => void }).gc)("holds heap flat once the ring is full", () => {
    const gc = (globalThis as { gc?: () => void }).gc!;
    const store = createStore(2_000);
    const start = 1_700_000_000_000;
    const push = (durationMs: number, seed: number): void => {
      for (const r of syntheticReadings({
        start,
        durationMs,
        everySeconds: 4,
        corroboration: 0.55,
        seed,
      }))
        store.ingest(r);
    };

    push(4 * 60 * 60 * 1000, 3);
    // The precondition, asserted. A warm-up that stops filling the ring makes the rest of this a measurement
    // of something else, which is exactly how it went wrong before.
    expect(store.size()).toBe(store.capacity);

    gc();
    const before = process.memoryUsage().heapUsed;
    push(4 * 60 * 60 * 1000, 11);
    push(4 * 60 * 60 * 1000, 23);
    push(4 * 60 * 60 * 1000, 31);
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthMb = (after - before) / 1024 / 1024;
    // Printed rather than merely asserted: a threshold that passes tells you nothing about how much headroom
    // it passed by, and that margin is the number worth watching.
    console.info(`[heap] twelve hours past capacity grew ${growthMb.toFixed(3)}MB`);
    expect(growthMb).toBeLessThan(0.5);
  });
});

describe("newest by origin, which arrival order is not", () => {
  /*
   * The recent list used to pool the 400 most recently arrived and sort those. USGS lists a feed newest
   * first, so the last four hundred to arrive from a month's seed are its four hundred oldest: measured
   * against the live month feed, the sixty rows on screen spanned 28.8 to 28.9 days old.
   */
  const seed = (store: ReturnType<typeof createStore>, count: number, now: number): void => {
    // Newest first, exactly as the agency lists it and therefore as the app ingests it.
    for (let i = 0; i < count; i += 1) {
      store.ingest(reading({ id: `u${i}`, time: now - i * 60_000 }));
    }
  };

  it("returns the newest by origin, not the last to arrive", () => {
    const now = 1_700_000_000_000;
    const store = createStore(5000);
    seed(store, 1000, now);

    const got = store.newest(5).map((q) => q.primary.time);
    expect(got).toEqual([now, now - 60_000, now - 120_000, now - 180_000, now - 240_000]);
    // And the old answer, kept here so the difference is on the record rather than in a comment.
    expect(store.latest(5)[0]!.primary.time).toBe(now - 999 * 60_000);
  });

  it("hands them back newest first", () => {
    const now = 1_700_000_000_000;
    const store = createStore(500);
    seed(store, 200, now);
    const times = store.newest(20).map((q) => q.primary.time);
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeLessThan(times[i - 1]!);
  });

  it("filters before selecting, because doing it after cannot be made correct", () => {
    // Selecting sixty and then filtering returns however many of those sixty happen to pass, which is fewer
    // than sixty and sometimes none. Here every recent event is excluded.
    const now = 1_700_000_000_000;
    const store = createStore(500);
    for (let i = 0; i < 100; i += 1) {
      store.ingest(reading({ id: `u${i}`, time: now - i * 60_000, magnitude: i < 50 ? 2 : 6 }));
    }
    const big = store.newest(10, (q) => q.primary.magnitude >= 5);
    expect(big).toHaveLength(10);
    expect(big.every((q) => q.primary.magnitude >= 5)).toBe(true);
    // The newest passing event is the 51st, an hour older than the newest event overall.
    expect(big[0]!.primary.time).toBe(now - 50 * 60_000);
  });

  it("asks for none and gets none, rather than everything", () => {
    const store = createStore(100);
    seed(store, 10, 1_700_000_000_000);
    expect(store.newest(0)).toEqual([]);
  });

  it("returns what it has when asked for more than it holds", () => {
    const store = createStore(100);
    seed(store, 7, 1_700_000_000_000);
    expect(store.newest(60)).toHaveLength(7);
  });

  it("prefers the newer of two events at the same instant, and keeps both", () => {
    // Ties must not drop one: a busy second is ordinary and two events can share a timestamp.
    const now = 1_700_000_000_000;
    const store = createStore(100);
    store.ingest(reading({ id: "a", time: now }));
    store.ingest(reading({ id: "b", time: now }));
    expect(store.newest(2)).toHaveLength(2);
  });
});

describe("clearing the store, which archive mode leans on entirely", () => {
  /*
   * `showArchive` calls this and then loads a past day, so anything it forgets is stale state a viewer reads
   * as that day's data. Asserted through the public surface: a field this misses is only a bug if something
   * can still see it.
   */
  const fill = (store: ReturnType<typeof createStore>, start: number): void => {
    for (const r of syntheticReadings({
      start,
      durationMs: 3 * 3_600_000,
      everySeconds: 600,
      corroboration: 0.5,
      seed: 7,
    }))
      store.ingest(r);
  };
  const filled = (): ReturnType<typeof createStore> => {
    const store = createStore(64);
    fill(store, 1_700_000_000_000);
    store.ingest(reading({ source: "usgs", id: "a1" }));
    return store;
  };

  it("empties everything a reader can reach", () => {
    const store = filled();
    expect(store.size()).toBeGreaterThan(0);
    const before = store.stats();
    expect(before.readings.usgs).toBeGreaterThan(0);

    store.clear();

    expect(store.size()).toBe(0);
    expect(store.newest(10)).toEqual([]);
    expect(store.latest(10)).toEqual([]);
    const seen: unknown[] = [];
    store.forEach((q) => seen.push(q));
    expect(seen).toEqual([]);
    const after = store.stats();
    expect(after.readings).toEqual({ usgs: 0, emsc: 0 });
    expect(after.quakes).toBe(0);
    expect(after.corroborated).toBe(0);
    expect(after.revised).toBe(0);
  });

  it("forgets the identifiers, so a repeat arrival is new rather than a revision", () => {
    const store = filled();
    store.clear();
    expect(store.findByReading("usgs", "a1")).toBeUndefined();
    // `isNew` is the observable: a store that still held the identifier would join, not create.
    const again = store.ingest(reading({ source: "usgs", id: "a1" }));
    expect(again.isNew).toBe(true);
    expect(store.size()).toBe(1);
  });

  it("reports no coverage once empty, because it is holding nothing to vouch for", () => {
    // `since` is the honest left edge of the window, and an empty store has no edge.
    const store = filled();
    expect(store.stats().since).not.toBeNull();
    store.clear();
    expect(store.stats().since).toBeNull();
  });

  it("leaves a cleared store usable, not merely empty", () => {
    const store = filled();
    store.clear();
    fill(store, 1_700_100_000_000);
    expect(store.size()).toBeGreaterThan(0);
    expect(store.newest(5).length).toBeGreaterThan(0);
    // The ring must start from a clean head, not from wherever the previous fill left it.
    expect(store.newest(50).length).toBe(store.size());
  });
});

it("visits retained arrivals once with only the quake argument after revisions and eviction", () => {
  const store = createStore(2);
  const first = store.ingest(reading({ id: "first", time: 1_700_000_000_000 })).quake;
  const second = store.ingest(reading({ id: "second", time: 1_700_000_600_000 })).quake;
  store.ingest(reading({ id: "first", time: first.primary.time, magnitude: 6 }));
  const third = store.ingest(reading({ id: "third", time: 1_700_001_200_000 })).quake;
  const seen: unknown[][] = [];
  store.forEach((...args) => seen.push(args));
  expect(seen).toEqual([[second], [third]]);
});
