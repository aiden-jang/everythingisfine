import { describe, expect, it } from "vitest";
import { createReplay, REPLAY_SECONDS } from "./replay";

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
