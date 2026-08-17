import { describe, expect, it } from "vitest";
import { browserRuntime } from "./types";
import { createEmscSource, EMSC_SOCKET } from "./emsc";

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
});
