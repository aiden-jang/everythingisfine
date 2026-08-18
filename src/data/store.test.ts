import { describe, expect, it } from "vitest";
import { createStore } from "./store";
import { syntheticReadings } from "./fixtures";
import { distanceKm } from "../geo/sphere";
import type { Reading } from "./types";

/*
 * The one Node global this file needs, declared rather than imported.
 *
 * Installing @types/node would put every Node global into a browser-only app's type surface, where
 * `setTimeout` starts returning a Timeout, `Buffer` becomes available in application code, and a
 * genuine mistake typechecks. One narrow declaration in the one file that needs it costs nothing.
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
      fromMagnitude: 6.1, fromDepthKm: 40, count: 1, at: 1_700_003_600_000,
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
    /*
     * The case that decides whether the feature means anything. Both USGS feeds re-serve every
     * event they hold, so the replace branch runs on every poll; counting arrivals there would have
     * every earthquake claiming twenty revisions by evening.
     */
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
    store.ingest(reading({
      source: "emsc", id: "e9", magnitude: 5.9, scale: "mb",
      lon: 141.44, lat: 41.79, time: 1_700_000_008_000,
    }));
    store.ingest(reading({ magnitude: 6.4 }));
    store.ingest(reading({
      source: "emsc", id: "e9", magnitude: 6.2, scale: "mb",
      lon: 141.44, lat: 41.79, time: 1_700_000_008_000,
    }));

    // One event, both agencies revised. The stat counts events, so it is 1.
    expect(store.stats().revised).toBe(1);
  });

  it("does not drift upward as revised events churn through eviction", () => {
    // The shape of the bug the test above found: an increment and a refund on different units drifts
    // for as long as the page is open, and one event at a time never shows it.
    const store = createStore(10);
    for (let i = 0; i < 200; i += 1) {
      const base = { id: `u${i}`, lon: (i % 170) - 85, lat: (i % 80) - 40, time: 1_700_000_000_000 + i * 60_000 };
      store.ingest(reading({ ...base, magnitude: 5.0 }));
      store.ingest(reading({ ...base, magnitude: 5.3 }));
      store.ingest(reading({
        ...base, source: "emsc", id: `e${i}`, magnitude: 4.8, scale: "mb", time: base.time + 5_000,
      }));
      store.ingest(reading({
        ...base, source: "emsc", id: `e${i}`, magnitude: 5.1, scale: "mb", time: base.time + 5_000,
      }));
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
    const b = store.ingest(reading({
      source: "emsc", id: "e9", magnitude: 4.9, scale: "mb",
      lon: 141.44, lat: 41.79, time: 1_700_000_008_000,
    }));

    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.corroborated).toBe(true);
    expect(store.size()).toBe(1);
    expect(b.quake.readings).toHaveLength(2);
  });

  it("keeps both readings rather than picking a winner", () => {
    const store = createStore(100);
    store.ingest(reading());
    const { quake } = store.ingest(reading({
      source: "emsc", id: "e9", magnitude: 4.9, scale: "mb", lon: 141.44, lat: 41.79,
    }));

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

    // 0.2 degrees at the equator is about 22km, well inside the limit, and the two are on
    // opposite sides of the date line. A naive subtraction would call it 40,000km apart.
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
      store.ingest(reading({ id: `u${i}`, time: 1_700_000_000_000 + i * 600_000,
        receivedAt: 1_700_000_030_000 + i * 600_000 }));
    }
    // Four have been evicted, so the earliest arrival still held is the fifth.
    expect(store.stats().since).toBe(1_700_000_030_000 + 4 * 600_000);
  });
});

/*
 * The gate for PLAN.md step 4.
 *
 * The polish doc is right that this is the failure that only shows up in the demo left running
 * during an interview. Four hours of events are pushed through a store far too small to hold them,
 * so eviction runs tens of thousands of times, and every internal index is then checked for growth.
 *
 * Structural assertions rather than a heap reading, because they are deterministic and they name
 * the actual failure. A leak here is not "memory crept up", it is "an index kept a key after its
 * quake was evicted", and that is directly observable. The heap check runs too when the runner was
 * started with --expose-gc, but it is the corroboration, not the gate.
 */
describe("the long session", () => {
  it("stays flat across four simulated hours", () => {
    const capacity = 1_000;
    const store = createStore(capacity);
    const start = 1_700_000_000_000;

    let ingested = 0;
    let created = 0;
    const samples: { at: number; byReadingId: number; buckets: number; slots: number }[] = [];

    for (const r of syntheticReadings({
      start, durationMs: 4 * 60 * 60 * 1000, everySeconds: 4, corroboration: 0.55, seed: 7,
    })) {
      if (store.ingest(r).isNew) created += 1;
      ingested += 1;
      if (ingested % 500 === 0) {
        const d = store.debugIndexSizes();
        samples.push({ at: ingested, byReadingId: d.byReadingId, buckets: d.buckets, slots: d.slotsInUse });
      }
    }

    // The buffer has to have turned over completely more than once, or this measures a warm-up
    // rather than a steady state. Counted in evictions, which is the thing that has to be correct,
    // rather than in readings, which is only loosely related to it.
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
      // The bucket index is the one that leaks silently: an emptied Set that is never deleted
      // costs nothing visible and accumulates one entry per minute of wall clock forever.
      expect(s.buckets).toBeLessThan(capacity);
    }

    // Flatness, not just boundedness. The last sample must not be meaningfully larger than the
    // first settled one, which is what separates a leak from a warm-up.
    const first = settled[0]!;
    const last = settled.at(-1)!;
    expect(last.byReadingId).toBeLessThanOrEqual(first.byReadingId * 1.05);
    expect(last.buckets).toBeLessThanOrEqual(first.buckets * 1.05);
  });

  /*
   * `skipIf` rather than an early return.
   *
   * The first version returned early with a console note when gc was unavailable, and the default
   * reporter swallows stdout for passing tests, so it reported as green whether or not it had
   * measured anything. That is the polish doc's "unenforced benchmark is quietly false within a
   * month" in miniature. Skipping puts it in the summary, where a run that did not measure says so.
   */
  it.skipIf(!(globalThis as { gc?: () => void }).gc)("holds heap flat", () => {
    const gc = (globalThis as { gc?: () => void }).gc!;
    const store = createStore(2_000);
    const start = 1_700_000_000_000;
    const push = (durationMs: number, seed: number): void => {
      for (const r of syntheticReadings({
        start, durationMs, everySeconds: 4, corroboration: 0.55, seed,
      })) store.ingest(r);
    };

    push(30 * 60 * 1000, 3); // warm up past capacity first
    gc();
    const before = process.memoryUsage().heapUsed;
    push(4 * 60 * 60 * 1000, 11);
    gc();
    const after = process.memoryUsage().heapUsed;

    const growthMb = (after - before) / 1024 / 1024;
    // Printed rather than merely asserted: a threshold that passes tells you nothing about how
    // much headroom it passed by, and that margin is the number worth watching over time.
    console.info(`[heap] four hours grew ${growthMb.toFixed(2)}MB`);
    expect(growthMb).toBeLessThan(5);
  });
});
