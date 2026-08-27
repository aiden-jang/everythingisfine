import { describe, expect, it } from "vitest";
import { findNearby } from "./nearby";
import { createStore } from "../data/store";
import { seeded } from "../data/fixtures";
import type { Filters, Reading } from "../data/types";

/*
 * The panel's cost, measured rather than assumed. `findNearby` walks the whole buffer, and it was written
 * up as a known cost on the argument that memoising would freeze the neighbour list - which is the right
 * trade only if the cost is small, and nobody had checked.
 *
 * Budgeted as a ratio, for the same reason as the event layer: a millisecond threshold cannot tell a
 * regression from a busy machine.
 */

const NOW = 1_700_000_000_000;

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

function fastestMs(run: () => void, samples: number): number {
  let best = Infinity;
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    run();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe("the pinned panel's per-second cost", () => {
  // Building a fifty-thousand-event store and sampling it takes about seven seconds.
  it("stays cheap enough to leave live, at a full buffer inside one swarm", { timeout: 30_000 }, () => {
    const random = seeded(7);
    const store = createStore(50_000);
    // The worst case for this function is not a full buffer, it is a full buffer where everything is
    // a neighbour: every event inside the radius is collected, sorted and mapped.
    for (let i = 0; i < 50_000; i += 1) {
      const reading: Reading = {
        source: "usgs", id: `q${i}`, magnitude: 2 + random() * 3, scale: "mb",
        lon: 120 + (random() - 0.5) * 0.6, lat: -8 + (random() - 0.5) * 0.6,
        depthKm: 10, time: NOW - random() * 3_600_000, place: "Flores Sea",
        kind: "earthquake", receivedAt: NOW,
      };
      store.ingest(reading);
    }
    const filters: Filters = {
      minMagnitude: 0, windowMs: 24 * 3_600_000, sources: new Set(["usgs", "emsc"]),
    };
    const pinned = store.latest(1)[0]!;

    for (let i = 0; i < 3; i += 1) findNearby(store, pinned, filters, NOW);
    const ref = referenceMs();
    const ms = fastestMs(() => findNearby(store, pinned, filters, NOW), 10);
    const units = ms / ref;
    console.info(`[perf] findNearby over 50,000 all-neighbours: ${units.toFixed(2)} ref, ${ms.toFixed(3)}ms`);

    /*
     * Measured at 15.3 after selecting the top four instead of sorting all of them, down from 33.5.
     * Set with the usual headroom over that.
     *
     * It is no longer on a per-second path: the panel memoises on the feed's revision, so this runs
     * when an earthquake arrives rather than when the clock ticks. The budget is here so that stays
     * true of the function itself, since a regression here would land straight back on every arrival.
     */
    expect(units).toBeLessThan(22);
  });
});
