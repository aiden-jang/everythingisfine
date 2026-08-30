import { describe, expect, it } from "vitest";
import { findNearby } from "./nearby";
import { createStore } from "../data/store";
import { seeded } from "../data/fixtures";
import type { Filters, Reading } from "../data/types";

/* The panel's cost, measured rather than assumed. See ARCHITECTURE.md. */

/*
 * The one Node global this file needs, declared rather than imported, exactly as `store.test.ts` does it.
 * Installing @types/node would put every Node global into a browser-only app's type surface.
 */
declare const process: { env: Record<string, string | undefined> };

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

    /* Two budgets, because this is the one ratio here that does not cancel across machines. Measured,
       before settling for a second number: reshaping the reference to walk an object graph tightens the
       quiet spread from 10% to 2.6% and cuts worst-case drift under load from +27% to +19%. See
       ARCHITECTURE.md. */
    expect(units).toBeLessThan(process.env["CI"] ? 32 : 22);
  });
});
