import { describe, expect, it } from "vitest";
import { newsIn, NEWS_WINDOW_MS } from "./announce";
import type { Quake, Reading } from "../data/types";

const now = 1_700_000_000_000;

const quake = (id: string, magnitude: number, agoMs: number): Quake => {
  const primary: Reading = {
    source: "usgs",
    id,
    magnitude,
    scale: "mww",
    lon: 141,
    lat: 38,
    depthKm: 20,
    time: now - agoMs,
    place: "Somewhere",
    kind: "earthquake",
    receivedAt: now,
  };
  return { key: id, readings: [primary], primary };
};

const MINUTE = 60_000;

describe("what the live region is allowed to call new", () => {
  it("announces a genuine arrival", () => {
    const fresh = newsIn([quake("a", 5.1, 2 * MINUTE)], new Set(), 4.5, now);
    expect(fresh.map((q) => q.key)).toEqual(["a"]);
  });

  it("says nothing about a backlog on a cold load", () => {
    /*
     * The bug. On a cold load the list goes from empty to sixty at once, every one unseen, so a screen
     * reader was told "3 new earthquakes above magnitude 4.5" about events hours old. The canvas has a
     * named guard against exactly this for wavefronts; the interface that speaks had none.
     */
    const seed = [
      quake("a", 5.4, 3 * 3_600_000),
      quake("b", 4.9, 7 * 3_600_000),
      quake("c", 6.1, 20 * 3_600_000),
    ];
    expect(newsIn(seed, new Set(), 4.5, now)).toEqual([]);
  });

  it("says nothing when the magnitude filter is lowered over old events", () => {
    /*
     * The second false-news case, and the reason the clock is the test rather than a one-off flag for the
     * first delivery. Lowering the threshold admits events that were always held and never listed, and
     * they arrive looking exactly as unseen as an arrival does.
     */
    const held = [quake("a", 3.2, 5 * 3_600_000), quake("b", 3.4, 9 * 3_600_000)];
    expect(newsIn(held, new Set(), 3, now)).toEqual([]);
  });

  it("keeps quiet about anything under the threshold, however new", () => {
    expect(newsIn([quake("a", 2.1, MINUTE)], new Set(), 4.5, now)).toEqual([]);
  });

  it("does not repeat itself when the list re-renders", () => {
    // The seen set still earns its place: a render is not an event.
    const q = quake("a", 5.1, MINUTE);
    expect(newsIn([q], new Set(["a"]), 4.5, now)).toEqual([]);
  });

  it("draws the line where the publishing delay ends, not where it starts", () => {
    /*
     * Agencies take minutes to publish, and up to fifteen or so for smaller events, so the window has to
     * be wider than that delay or real arrivals go unannounced. The trade is stated: an event published
     * unusually late passes in silence, which is the recoverable direction.
     */
    expect(NEWS_WINDOW_MS).toBeGreaterThan(15 * MINUTE);
    expect(newsIn([quake("a", 5, NEWS_WINDOW_MS - MINUTE)], new Set(), 4.5, now)).toHaveLength(1);
    expect(newsIn([quake("a", 5, NEWS_WINDOW_MS + MINUTE)], new Set(), 4.5, now)).toHaveLength(0);
  });

  it("is far short of a seed, which is the thing it has to exclude", () => {
    // A day's seed reaches back 24 hours and a month's 30 days. The window must not be near either.
    expect(NEWS_WINDOW_MS).toBeLessThan(3_600_000);
  });

  it("puts the newest first, so a multi-event announcement leads with the latest", () => {
    const fresh = newsIn(
      [quake("old", 5, 10 * MINUTE), quake("new", 5, MINUTE), quake("mid", 5, 5 * MINUTE)],
      new Set(),
      4.5,
      now,
    );
    expect(fresh.map((q) => q.key)).toEqual(["new", "mid", "old"]);
  });

  it("tolerates an origin time slightly ahead of the clock", () => {
    // Agencies and browsers disagree by a second or two, and the window filter already accepts this.
    expect(newsIn([quake("a", 5, -2000)], new Set(), 4.5, now)).toHaveLength(1);
  });
});
