import { describe, expect, it } from "vitest";
import { createEventLayer } from "./events";
import { createStore } from "../data/store";
import { BUCKETS } from "../app/histogram";
import type { Filters, Reading } from "../data/types";

/*
 * Holding a bar on the activity strip lights the events it stands for.
 *
 * It lit the wrong ones at two of the three windows. The layer took the bucket's *index* and multiplied
 * it by a hardcoded hour, which is the same thing as the bucket only while a bucket is an hour, and a
 * bucket is `windowMs / 24`. At 7d it is 7 hours and at 30d it is 30, so every bar on the strip lit the
 * same recent hour whichever one the pointer was on, and the feature was silently dead at any window but
 * the default.
 */

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;
/** Above the clustering threshold, so one marker is one event and `aFocus` is readable per event. */
const NO_CLUSTER = 3;

const filters = (windowMs: number): Filters => ({
  minMagnitude: 0, windowMs, sources: new Set(["usgs", "emsc"]),
});

const reading = (id: string, agoMs: number): Reading => ({
  source: "usgs", id, magnitude: 4, scale: "ml", lon: (Number(id) % 60) - 30, lat: 0,
  depthKm: 10, time: NOW - agoMs, place: "Somewhere", kind: "earthquake", receivedAt: NOW,
});

/** One event per bucket of the window, oldest last, so a bucket index maps to a known event. */
const perBucket = (windowMs: number) => {
  const store = createStore(500);
  const bucketMs = windowMs / BUCKETS;
  for (let b = 0; b < BUCKETS; b += 1) {
    // Mid-bucket, so a rounding slip cannot put it in a neighbour.
    store.ingest(reading(String(b), (b + 0.5) * bucketMs));
  }
  return { store, bucketMs };
};

const focusedTimes = (
  layer: ReturnType<typeof createEventLayer>, drawn: number,
): number[] => {
  const focus = layer.object.geometry.getAttribute("aFocus");
  const lonLat = layer.object.geometry.getAttribute("aLonLat");
  const out: number[] = [];
  for (let i = 0; i < drawn; i += 1) {
    if (focus.array[i] === 1) out.push(lonLat.array[i * 2]!);
  }
  return out;
};

describe("holding a bar lights the events that bar stands for", () => {
  for (const [name, windowMs] of [
    ["24 hours", 24 * HOUR],
    ["7 days", 7 * 24 * HOUR],
    ["30 days", 30 * 24 * HOUR],
  ] as const) {
    it(`picks out one bucket at ${name}`, () => {
      const { store, bucketMs } = perBucket(windowMs);
      const layer = createEventLayer(500);
      const f = filters(windowMs);

      // Bucket 5, expressed the way the strip's own arithmetic expresses it.
      const held = { from: NOW - 6 * bucketMs, to: NOW - 5 * bucketMs };
      const drawn = layer.sync(store, f, NOW, NO_CLUSTER, undefined, held);
      expect(drawn).toBe(BUCKETS);

      // Exactly one event lit, and it is the one sitting in that bucket.
      const lit = focusedTimes(layer, drawn);
      expect(lit).toHaveLength(1);
      expect(lit[0]).toBe((5 % 60) - 30);
      layer.dispose();
    });
  }

  it("lights nothing when nothing is held", () => {
    const { store } = perBucket(24 * HOUR);
    const layer = createEventLayer(500);
    const drawn = layer.sync(store, filters(24 * HOUR), NOW, NO_CLUSTER, undefined, null);
    expect(focusedTimes(layer, drawn)).toEqual([]);
    layer.dispose();
  });

  it("lights a different bucket for a different bar, which was the whole failure", () => {
    /*
     * The old code lit the same recent hour for every bar at a wide window, so this asserts the thing
     * that was broken rather than the thing that happened to work: two bars, two answers.
     */
    const windowMs = 30 * 24 * HOUR;
    const { store, bucketMs } = perBucket(windowMs);
    const layer = createEventLayer(500);
    const f = filters(windowMs);

    const lit = (b: number): number[] => {
      const drawn = layer.sync(store, f, NOW, NO_CLUSTER, undefined, {
        from: NOW - (b + 1) * bucketMs, to: NOW - b * bucketMs,
      });
      return focusedTimes(layer, drawn);
    };
    expect(lit(2)).not.toEqual(lit(19));
    expect(lit(2)).toHaveLength(1);
    expect(lit(19)).toHaveLength(1);
    layer.dispose();
  });
});
