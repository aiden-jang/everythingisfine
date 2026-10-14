import { describe, expect, it } from "vitest";
import { browserRuntime } from "./types";
import { createEmscSource, EMSC_CATALOGUE, EMSC_SOCKET, SEED_LIMIT } from "./emsc";

/* The second and last test that touches the real internet. Excluded from the default run and CI. See ARCHITECTURE.md#srcsourcesemsclivetestts. */

describe("EMSC, for real", () => {
  it("still accepts an anonymous connection", async () => {
    const source = createEmscSource(browserRuntime, EMSC_SOCKET);
    let live = false;

    await new Promise<void>((resolve, reject) => {
      const giveUp = setTimeout(() => reject(new Error("no connection in 20s")), 20_000);
      source.start({
        onReadings: () => {},
        onSeeded: () => {},
        onStatus: (s) => {
          if (s.kind === "live") {
            live = true;
            clearTimeout(giveUp);
            resolve();
          }
          if (s.kind === "failing") {
            clearTimeout(giveUp);
            reject(new Error(s.reason));
          }
        },
      });
    }).finally(() => source.stop());

    expect(live).toBe(true);
  }, 25_000);

  /* The two facts the coverage claim rests on, argued rather than measured for a long time: a short page is
     a complete catalogue for the span asked for, and a full one is truncated at its oldest row. See ARCHITECTURE.md#srcsourcesemsclivetestts. */
  it("has a row ceiling far above the seed limit, so a short page is a short catalogue", async () => {
    const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString().slice(0, 19);
    const res = await fetch(`${EMSC_CATALOGUE}?limit=${SEED_LIMIT * 4}&format=json&start=${since}`);
    expect(res.ok).toBe(true);
    const payload = (await res.json()) as { features: unknown[] };

    /* Asking for four times the limit has to return more than the limit. Measured at 14,958 events over
       thirty days on 2026-08-19, against a portal ceiling of 20,000. See ARCHITECTURE.md#srcsourcesemsclivetestts. */
    expect(payload.features.length).toBeGreaterThan(SEED_LIMIT);
  }, 60_000);

  it("truncates from the old end, which is what makes a full page's oldest row the edge", async () => {
    const now = Date.now();
    const since = new Date(now - 30 * 24 * 3_600_000).toISOString().slice(0, 19);
    const res = await fetch(`${EMSC_CATALOGUE}?limit=5&format=json&start=${since}`);
    expect(res.ok).toBe(true);
    const payload = (await res.json()) as {
      features: { properties: { time: string } }[];
    };
    expect(payload.features.length).toBe(5);

    /*
     * Five rows out of a month have to be the newest five. Were the order to flip, a truncated page's oldest
     * row would sit back at `start` and the app would vouch for the whole month while holding the five oldest
     * events in it. Three days rather than an hour, because a quiet planet is not a defect in this code.
     */
    const times = payload.features.map((f) => Date.parse(f.properties.time));
    expect(Math.min(...times)).toBeGreaterThan(now - 3 * 24 * 3_600_000);
  }, 60_000);
});
