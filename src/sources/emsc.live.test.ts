import { describe, expect, it } from "vitest";
import { browserRuntime } from "./types";
import { createEmscSource, EMSC_CATALOGUE, EMSC_SOCKET, SEED_LIMIT } from "./emsc";

/*
 * The second and last test that touches the real internet. Excluded from the default run and CI.
 *
 * It asserts that the socket still accepts an anonymous connection, and nothing at all about what
 * comes down it. Global seismicity above the reporting threshold arrives every few minutes, so a
 * test that waited for an event would fail on a quiet planet, which is not a defect in this code.
 *
 * That connection is the entire basis for the push half of the design and for the zero-invocation
 * deployment: if EMSC ever starts requiring a key, the project needs a Worker to hold it and the
 * "no configuration, first frame is already live" promise in DESIGN.md is over. Better to learn
 * that from a deliberate test than from a globe that quietly only ever shows one source.
 */

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

  /*
   * The two facts the coverage claim rests on, which were argued rather than measured for a long time.
   *
   * A short page is read as a complete catalogue for the span asked for, and a full one as a page
   * truncated at its oldest row. Both readings are only sound while the portal's own ceiling sits far
   * above `SEED_LIMIT` and while it truncates from the old end. Neither is documented, so neither is
   * promised, and if either changes the app starts claiming coverage it does not have while looking
   * exactly as it does now. That is the failure worth a deliberate test.
   */
  it("has a row ceiling far above the seed limit, so a short page is a short catalogue", async () => {
    const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString().slice(0, 19);
    const res = await fetch(
      `${EMSC_CATALOGUE}?limit=${SEED_LIMIT * 4}&format=json&start=${since}`,
    );
    expect(res.ok).toBe(true);
    const payload = (await res.json()) as { features: unknown[] };

    /*
     * Asking for four times the limit has to return more than the limit. If it ever comes back at or
     * under `SEED_LIMIT`, ours has stopped being the binding limit and a page under it could be a
     * silently truncated one, at which point vouching for the whole span is a guess.
     *
     * Measured at 14,958 events over thirty days on 2026-08-19, against a portal ceiling of 20,000,
     * so there is a wide margin here rather than a coincidence.
     */
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
     * Five rows out of a month have to be the newest five. Were the order ever to flip, a truncated
     * page's oldest row would sit back at `start` and the app would vouch for the whole month while
     * holding the five oldest events in it: the same code, the opposite of honest.
     *
     * Three days rather than an hour, because the assertion is about which end is kept and a quiet
     * planet is not a defect in this code.
     */
    const times = payload.features.map((f) => Date.parse(f.properties.time));
    expect(Math.min(...times)).toBeGreaterThan(now - 3 * 24 * 3_600_000);
  }, 60_000);
});
