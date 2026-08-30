import { describe, expect, it } from "vitest";
import { createReplay, REPLAY_SECONDS, replayFrom, REPLAY_SPAN_MS } from "./replay";

const FROM = 1_700_000_000_000;
const TO = FROM + 24 * 3_600_000;

describe("the entrance replay", () => {
  it("runs from the oldest event to the present and stops", () => {
    const replay = createReplay({ from: FROM, to: TO });
    expect(replay.at()).toBe(FROM);

    for (let i = 0; i < 1000 && !replay.done(); i += 1) replay.step(1 / 60);

    expect(replay.done()).toBe(true);
    // Ends exactly at the present, never past it: the clock must not show a future.
    expect(replay.at()).toBeNull();
  });

  it("takes about the stated number of seconds", () => {
    const replay = createReplay({ from: FROM, to: TO });
    let ticks = 0;
    while (!replay.done() && ticks < 10_000) { replay.step(1 / 60); ticks += 1; }
    expect(ticks / 60).toBeCloseTo(REPLAY_SECONDS, 0);
  });

  it("only ever moves forward", () => {
    const replay = createReplay({ from: FROM, to: TO });
    let last = FROM;
    while (!replay.done()) {
      const window = replay.step(1 / 60);
      if (!window) break;
      // Each step reports the span it crossed, and the spans have to tile without gaps or overlap
      // or events are drawn twice, or never.
      expect(window.from).toBe(last);
      expect(window.to).toBeGreaterThanOrEqual(window.from);
      last = window.to;
    }
    expect(last).toBe(TO);
  });

  it("front-loads, so the globe fills before it settles", () => {
    const replay = createReplay({ from: FROM, to: TO });
    for (let i = 0; i < Math.round(60 * REPLAY_SECONDS * 0.5); i += 1) replay.step(1 / 60);
    const half = (replay.at()! - FROM) / (TO - FROM);
    // Half the wall clock covers well past half the day: a linear sweep would crawl through the
    // quiet hours and then blur through the interesting part.
    expect(half).toBeGreaterThan(0.65);
  });

  it("skips straight to the present", () => {
    const replay = createReplay({ from: FROM, to: TO });
    replay.step(1);
    replay.skip();
    expect(replay.done()).toBe(true);
    expect(replay.step(1)).toBeNull();
  });

  it("is already over when there is nothing to replay", () => {
    const replay = createReplay({ from: TO, to: TO });
    expect(replay.done()).toBe(true);
    expect(replay.at()).toBeNull();
  });
});

describe("how far back the entrance reaches", () => {
  const now = 1_700_000_000_000;
  const HOUR = 3_600_000;

  it("plays the whole buffer when the buffer is under a day", () => {
    // The ordinary case, and the one that must not change: a day's window seeds about a day.
    expect(replayFrom(now - 20 * HOUR, now)).toBe(now - 20 * HOUR);
    expect(replayFrom(now - HOUR, now)).toBe(now - HOUR);
  });

  it("plays a day and no more when a month is held", () => {
    /* It played from the oldest event held, which was the same thing as a day while a day was the only
       window. See ARCHITECTURE.md. */
    expect(replayFrom(now - 30 * 24 * HOUR, now)).toBe(now - REPLAY_SPAN_MS);
    expect(replayFrom(now - 7 * 24 * HOUR, now)).toBe(now - REPLAY_SPAN_MS);
  });

  it("reaches back exactly a day, which is what the rail says while it runs", () => {
    expect(REPLAY_SPAN_MS).toBe(24 * HOUR);
  });

  it("keeps the front rate inside the tempo it was tuned for, at any window", () => {
    /*
     * The property rather than the instance. A day yields about a dozen events at M5+, so the rate holds
     * wherever the buffer starts, and the clamp is what makes that true of a month as well.
     */
    const perSecond = (spanMs: number): number => {
      const played = now - replayFrom(now - spanMs, now);
      // Twelve M5+ events a day, measured, spread evenly for the purposes of a rate.
      return (12 * (played / (24 * HOUR))) / 2.8;
    };
    for (const days of [1, 7, 30]) {
      expect(perSecond(days * 24 * HOUR)).toBeLessThan(6);
    }
  });
});
