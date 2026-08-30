import { describe, expect, it } from "vitest";
import { browserRuntime } from "./types";
import { createUsgsSource, USGS_HOUR_FEED } from "./usgs";

/* The one test that touches the real internet. Excluded from the default run and from CI. See
   ARCHITECTURE.md. */

describe("USGS, for real", () => {
  it("still answers, still allows a browser, and still parses", async () => {
    const source = createUsgsSource(browserRuntime, USGS_HOUR_FEED);
    const readings: unknown[] = [];
    let status = "";

    await new Promise<void>((resolve, reject) => {
      const done = setTimeout(() => reject(new Error("no response in 15s")), 15_000);
      source.start({
        onReadings: (batch) => readings.push(...batch),
        onSeeded: () => {},
        onStatus: (s) => {
          status = s.kind;
          if (s.kind !== "idle") {
            clearTimeout(done);
            resolve();
          }
        },
      });
    }).finally(() => source.stop());

    expect(status).toBe("live");
  }, 20_000);

  it("still sends the CORS header the whole no-backend design rests on", async () => {
    const res = await fetch(USGS_HOUR_FEED, { method: "GET" });
    // If this ever fails, the app needs a proxy Worker, which ends the zero-invocation deployment.
    // Better to find out from a deliberate test than from a blank globe in someone's browser.
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  }, 20_000);
});
