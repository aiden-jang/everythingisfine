import { describe, expect, it } from "vitest";
import {
  atFraction, clamp, dragTo, fractionOf, LIVE, PLAY_SECONDS, step, togglePlay,
} from "./scrub";

const HOUR = 3_600_000;
const span = { from: 1_000_000_000_000, to: 1_000_000_000_000 + 24 * HOUR };

describe("where the cursor sits", () => {
  it("reads live as the right hand end without pretending to be a time", () => {
    expect(fractionOf(LIVE, span)).toBe(1);
    expect(LIVE.at).toBeNull();
  });

  it("maps a position to a time and back", () => {
    const at = atFraction(0.25, span);
    expect(at).toBe(span.from + 6 * HOUR);
    expect(fractionOf({ at, playing: false }, span)).toBeCloseTo(0.25, 10);
  });

  it("clamps a position outside the track rather than extrapolating", () => {
    expect(atFraction(-2, span)).toBe(span.from);
    expect(atFraction(9, span)).toBe(span.to);
  });

  it("survives a window with no width, which a cold load has", () => {
    const empty = { from: span.to, to: span.to };
    expect(fractionOf({ at: span.to, playing: false }, empty)).toBe(1);
    expect(step({ at: span.to, playing: true }, empty, 1)).toEqual(LIVE);
  });
});

describe("playing", () => {
  it("crosses the whole window in PLAY_SECONDS", () => {
    let s = togglePlay(LIVE, span);
    expect(s.at).toBe(span.from);
    // One second short, so it is still playing and the next step is the one that finishes.
    s = step(s, span, PLAY_SECONDS - 1);
    expect(s.playing).toBe(true);
    expect(fractionOf(s, span)).toBeCloseTo((PLAY_SECONDS - 1) / PLAY_SECONDS, 6);
    expect(step(s, span, 1.001)).toEqual(LIVE);
  });

  it("hands back to live at the end rather than parking on the present", () => {
    const nearly = { at: span.to - 10, playing: true };
    expect(step(nearly, span, 5)).toEqual(LIVE);
  });

  it("does nothing to a paused cursor", () => {
    const paused = { at: span.from + HOUR, playing: false };
    expect(step(paused, span, 3)).toBe(paused);
  });

  it("starts from the old edge when pressed at live, so the button is never a no-op", () => {
    expect(togglePlay(LIVE, span)).toEqual({ at: span.from, playing: true });
  });

  it("toggles in place when pressed anywhere else", () => {
    const parked = { at: span.from + 3 * HOUR, playing: false };
    expect(togglePlay(parked, span)).toEqual({ at: parked.at, playing: true });
    expect(togglePlay({ ...parked, playing: true }, span)).toEqual({ at: parked.at, playing: false });
  });
});

describe("dragging", () => {
  it("pauses, so the cursor cannot run away from the pointer", () => {
    expect(dragTo(0.5, span)).toEqual({ at: span.from + 12 * HOUR, playing: false });
  });
});

describe("a window that moves under the cursor", () => {
  it("returns to live once the present catches the cursor up", () => {
    const parked = { at: span.from + HOUR, playing: false };
    const later = { from: parked.at + HOUR, to: span.to + 2 * HOUR };
    expect(clamp(parked, later)).toEqual({ at: later.from, playing: false });
  });

  it("goes live rather than sitting past the end", () => {
    expect(clamp({ at: span.to + HOUR, playing: true }, span)).toEqual(LIVE);
  });

  it("leaves a cursor inside the window alone", () => {
    const inside = { at: span.from + 5 * HOUR, playing: true };
    expect(clamp(inside, span)).toBe(inside);
  });

  it("keeps playing while it is pulled forward, so a widening window does not stop it", () => {
    const playing = { at: span.from, playing: true };
    const shifted = { from: span.from + 2 * HOUR, to: span.to };
    expect(clamp(playing, shifted)).toEqual({ at: shifted.from, playing: true });
  });
});
