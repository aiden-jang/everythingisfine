import { describe, expect, it } from "vitest";
import { createEventLayer } from "./events";
import { createStore } from "../data/store";
import type { Filters, Reading } from "../data/types";

/*
 * The gate for PLAN.md step 7, and a correction to the source doc.
 *
 * The polish doc says "frame time at 1k, 10k and 50k events, fail the build past budget". You
 * cannot gate CI on frame time. A shared runner has no GPU and falls back to software rendering,
 * so a number measured there is noise wearing a unit, and a threshold set loose enough for it to
 * pass is loose enough to never fail.
 *
 * What actually regresses in code is the per-frame CPU work: filter predicates, projection maths,
 * buffer writes. That is deterministic, it needs no GPU, and it is what an accidental allocation
 * or an accidental O(n^2) shows up in. So CI gates on that, and GPU frame time is measured by hand
 * in a browser and recorded in ARCHITECTURE.md with the machine named.
 *
 * The budgets are DESIGN.md section 11. They are deliberately not generous: the point of a budget
 * that cannot fail is that it is not a budget.
 */

const BUDGET_MS: Record<number, number> = { 1_000: 1.0, 10_000: 4.0, 50_000: 12.0 };

/** Spread over real seismic longitudes so the trigonometry sees the same spread it will in life. */
function fill(count: number): ReturnType<typeof createStore> {
  const store = createStore(count);
  const start = 1_700_000_000_000;
  for (let i = 0; i < count; i += 1) {
    const reading: Reading = {
      source: "usgs",
      id: `u${i}`,
      magnitude: 1 + ((i * 37) % 65) / 10,
      scale: "mb",
      lon: -180 + ((i * 97) % 360),
      lat: -80 + ((i * 53) % 160),
      depthKm: 10,
      time: start - i * 1_000,
      place: "somewhere",
      kind: "earthquake",
      receivedAt: start - i * 1_000 + 20_000,
    };
    store.ingest(reading);
  }
  return store;
}

const filters = (over: Partial<Filters> = {}): Filters => ({
  minMagnitude: 0,
  windowMs: 365 * 24 * 3_600_000,
  sources: new Set(["usgs", "emsc"]),
  ...over,
});

/** Median of repeated runs. A mean lets one scheduling hiccup set the number. */
function medianMs(run: () => void, samples: number): number {
  const times: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

describe("update cost", () => {
  for (const count of [1_000, 10_000, 50_000]) {
    it(`writes ${count.toLocaleString("en-GB")} events within ${BUDGET_MS[count]}ms`, () => {
      const store = fill(count);
      const layer = createEventLayer(count);
      const f = filters();
      const now = 1_700_000_000_000;

      // Warm up, so the first measured sample is not paying for JIT.
      for (let i = 0; i < 5; i += 1) layer.sync(store, f, now);

      const ms = medianMs(() => layer.sync(store, f, now), 25);
      console.info(`[perf] sync ${count} events: ${ms.toFixed(3)}ms (budget ${BUDGET_MS[count]}ms)`);

      expect(layer.sync(store, f, now)).toBe(count);
      expect(ms).toBeLessThan(BUDGET_MS[count]!);
      layer.dispose();
    });
  }

  it("costs less when the filter excludes most events, not more", () => {
    const store = fill(50_000);
    const layer = createEventLayer(50_000);
    const now = 1_700_000_000_000;

    const all = medianMs(() => layer.sync(store, filters(), now), 15);
    const few = medianMs(() => layer.sync(store, filters({ minMagnitude: 7 }), now), 15);
    const drawn = layer.sync(store, filters({ minMagnitude: 7 }), now);

    console.info(`[perf] filtered to ${drawn} of 50,000: ${few.toFixed(3)}ms vs ${all.toFixed(3)}ms`);
    // A tenth, expressed as a fraction rather than a magic number. The synthetic magnitudes here
    // are uniform rather than Gutenberg-Richter, so far more of them clear M7 than would in life;
    // that makes this a harsher test of the reject path, not a weaker one.
    expect(drawn).toBeLessThan(50_000 / 10);
    // The filter still walks every event, so this can never be free. It must at least not be
    // *worse*, which is what a per-event allocation on the reject path would make it.
    expect(few).toBeLessThanOrEqual(all);
    layer.dispose();
  });

  it("allocates nothing per sync once it is warm", () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (!gc) return;

    const store = fill(50_000);
    const layer = createEventLayer(50_000);
    const f = filters();
    const now = 1_700_000_000_000;
    for (let i = 0; i < 10; i += 1) layer.sync(store, f, now);

    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 200; i += 1) layer.sync(store, f, now);
    gc();
    const growthMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;

    // Two hundred syncs is over three seconds of continuous slider dragging at 60fps. If the hot
    // loop allocates even one small array per event, this is tens of megabytes.
    console.info(`[perf] 200 syncs of 50,000 events grew the heap by ${growthMb.toFixed(2)}MB`);
    expect(growthMb).toBeLessThan(2);
    layer.dispose();
  });
});

declare const process: { memoryUsage: () => { heapUsed: number } };
