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

/*
 * Budgets in reference units, not milliseconds.
 *
 * Absolute millisecond budgets failed three times on unchanged code: 13.96ms against 7.65ms quiet
 * with browsers resident, and again at 13.11ms on another machine mid-session. Fastest-of-N removes
 * sampling noise and does nothing about sustained load, because forty samples taken under load are
 * forty loaded samples. A gate that cannot tell a regression from a busy laptop is not a gate.
 *
 * So the budget is a ratio against `referenceMs`, measured in the same process moments earlier.
 * Both numbers move together when the machine is busy and the ratio does not, which is the property
 * the absolute version never had. The milliseconds are still printed, because "is this fast enough
 * for a human" is a real question that a ratio cannot answer.
 */
/*
 * Calibrated, not guessed. Quiet measurements are 0.07, 0.71 and 4.10 reference units. Six saturated
 * cores move the ratio to 4.61, a 13% drift, where the milliseconds moved 20% over the same run. So
 * these sit about 45% above quiet: enough to absorb the drift that was actually observed, tight
 * enough that a regression adding half again to the cost fails.
 *
 * The ratio is better than milliseconds and it is not immune. The worst case seen, browsers resident,
 * was +82% in milliseconds, which is memory pressure rather than pure CPU contention, and no
 * same-process reference fully cancels that.
 */
const BUDGET_REF: Record<number, number> = { 1_000: 0.15, 10_000: 1.05, 50_000: 6.0 };

/**
 * A fixed workload shaped like the thing being measured: trigonometry into a typed array.
 *
 * Shape matters. A pure arithmetic loop would be CPU-bound where `sync` is partly memory-bound, and
 * the ratio would then drift with cache pressure rather than hold still. This does what the inner
 * loop of `sync` does, so contention hits both the same way.
 */
function referenceMs(): number {
  const out = new Float32Array(50_000 * 3);
  return fastestMs(() => {
    for (let i = 0; i < 50_000; i += 1) {
      const phi = i * 0.0001;
      const lam = i * 0.0002;
      const c = Math.cos(phi);
      out[i * 3] = c * Math.sin(lam);
      out[i * 3 + 1] = Math.sin(phi);
      out[i * 3 + 2] = c * Math.cos(lam);
    }
  }, 20);
}

/**
 * Zoomed past the clustering threshold, so every event is written individually.
 *
 * This is the expensive case and therefore the one worth budgeting. Clustering only ever writes
 * fewer markers than this, so a run that fits here fits everywhere.
 */
const NO_CLUSTER = 3;

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

/**
 * Fastest of repeated runs, not the median.
 *
 * This was a median, and the median of the same 50,000-event sync measured 14.99ms in one test and
 * 8.89ms in the next test of the same file, for identical work. A gate that reports a 68% swing on
 * unchanged code cannot tell a regression from a busy machine, and it had already been made
 * single-file to remove the obvious source of interference.
 *
 * For a deterministic CPU-bound operation the fastest observed run is the honest estimate of what
 * the code costs: every slower sample is the code plus something else, and the something else is
 * never the thing under test. Every scheduler slice, GC pause and frequency dip can only add. So
 * the minimum is what a regression actually moves, and it is the standard estimator for a
 * microbenchmark for exactly this reason.
 */
function fastestMs(run: () => void, samples: number): number {
  let best = Infinity;
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    run();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe("update cost", () => {
  for (const count of [1_000, 10_000, 50_000]) {
    it(`writes ${count.toLocaleString("en-GB")} events within ${BUDGET_REF[count]} reference units`, () => {
      const store = fill(count);
      const layer = createEventLayer(count);
      const f = filters();
      const now = 1_700_000_000_000;

      // Warm up, so the first measured sample is not paying for JIT.
      for (let i = 0; i < 5; i += 1) layer.sync(store, f, now, NO_CLUSTER);

      const ref = referenceMs();
      const ms = fastestMs(() => layer.sync(store, f, now, NO_CLUSTER), 40);
      const units = ms / ref;
      console.info(
        `[perf] sync ${count} events: ${units.toFixed(2)} ref (budget ${BUDGET_REF[count]}), `
        + `${ms.toFixed(3)}ms at ${ref.toFixed(3)}ms/ref`,
      );

      expect(layer.sync(store, f, now, NO_CLUSTER)).toBe(count);
      expect(units).toBeLessThan(BUDGET_REF[count]!);
      layer.dispose();
    });
  }

  it("holding an hour stays inside the same budget", () => {
    /*
     * The hover link resolves per marker on the CPU, because a clustered marker stands for events
     * from several hours and only this loop can still see them. That puts two comparisons and a
     * buffer write on the hot path, so it gets gated rather than assumed: an interaction that
     * fires once per bar crossed cannot cost more than the filter it sits beside.
     */
    const store = fill(50_000);
    const layer = createEventLayer(50_000);
    const f = filters();
    const now = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) layer.sync(store, f, now, NO_CLUSTER, undefined, 5);

    const ref = referenceMs();
    const units = fastestMs(() => layer.sync(store, f, now, NO_CLUSTER, undefined, 5), 40) / ref;
    console.info(`[perf] sync 50000 events, hour held: ${units.toFixed(2)} ref (budget ${BUDGET_REF[50_000]})`);
    expect(units).toBeLessThan(BUDGET_REF[50_000]!);
    layer.dispose();
  });

  it("costs less when the filter excludes most events, not more", () => {
    const store = fill(50_000);
    const layer = createEventLayer(50_000);
    const now = 1_700_000_000_000;

    const all = fastestMs(() => layer.sync(store, filters(), now, NO_CLUSTER), 15);
    const few = fastestMs(() => layer.sync(store, filters({ minMagnitude: 7 }), now, NO_CLUSTER), 15);
    const drawn = layer.sync(store, filters({ minMagnitude: 7 }), now, NO_CLUSTER);

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
    for (let i = 0; i < 10; i += 1) layer.sync(store, f, now, NO_CLUSTER);

    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 200; i += 1) layer.sync(store, f, now, NO_CLUSTER);
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

/*
 * Clustering changes the render path, so DESIGN.md section 11 requires the budget re-measured
 * rather than assumed to still hold. It has its own cost: a Map lookup and possibly an insert per
 * event, on top of the filter and the projection.
 */
describe("update cost with clustering on", () => {
  it("stays inside the same budget it does without", () => {
    const store = fill(50_000);
    const layer = createEventLayer(50_000);
    const f = filters();
    const now = 1_700_000_000_000;
    const CLUSTERED = 1;

    for (let i = 0; i < 5; i += 1) layer.sync(store, f, now, CLUSTERED);
    const ref = referenceMs();
    const clustered = fastestMs(() => layer.sync(store, f, now, CLUSTERED), 25);
    const plain = fastestMs(() => layer.sync(store, f, now, NO_CLUSTER), 25);
    const drawn = layer.sync(store, f, now, CLUSTERED);

    console.info(
      `[perf] clustered 50,000 into ${drawn} markers: ${clustered.toFixed(3)}ms `
      + `(unclustered ${plain.toFixed(3)}ms, ${(clustered / ref).toFixed(2)} ref)`,
    );

    // The point of clustering is fewer markers, so this failing would mean the grid is not binning.
    expect(drawn).toBeLessThan(50_000 / 2);
    expect(clustered / ref).toBeLessThan(BUDGET_REF[50_000]!);
    layer.dispose();
  });

  it("keeps the largest event in each cell, never the first", () => {
    const store = createStore(10);
    const base = {
      source: "usgs" as const, scale: "mb", depthKm: 10, place: "x", kind: "earthquake",
      time: 1_700_000_000_000, receivedAt: 1_700_000_020_000,
    };
    // Three events inside one cell, largest arriving in the middle.
    store.ingest({ ...base, id: "a", magnitude: 2, lon: 120, lat: -8 });
    store.ingest({ ...base, id: "b", magnitude: 6.2, lon: 120.4, lat: -8.1 });
    store.ingest({ ...base, id: "c", magnitude: 3, lon: 120.2, lat: -8.3 });

    const layer = createEventLayer(10);
    const drawn = layer.sync(store, filters(), 1_700_000_000_000, 1);
    expect(drawn).toBe(1);

    // Understating a cluster would hide the event a viewer most needs to see.
    const mags = layer.object.geometry.getAttribute("aMag");
    expect(mags.getX(0)).toBeCloseTo(6.2, 5);
    // And it is marked as collapsed, so the interface can say it stands for several.
    expect(layer.object.geometry.getAttribute("aCluster").getX(0)).toBe(1);
    layer.dispose();
  });
});
