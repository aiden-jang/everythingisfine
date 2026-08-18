import { describe, expect, it } from "vitest";
import { frontsFor } from "./feed";
import type { Quake, Reading } from "../data/types";

/*
 * The gate for PLAN.md step 8, tested as a rule rather than as a screenshot.
 *
 * The requirement is that a cold load always has a front expanding in the first frame. That cannot
 * be observed directly here: announcements are coalesced through requestAnimationFrame, and every
 * headless and backgrounded context suspends it, so any "cold load" a test could stage is one where
 * the handler never runs. What *can* be pinned down is the rule the handler applies, and the rule
 * is the part that would silently rot.
 */

const quake = (id: string, magnitude: number): Quake => {
  const primary: Reading = {
    source: "usgs", id, magnitude, scale: "mb", lon: 140, lat: 35, depthKm: 10,
    time: 1_700_000_000_000, place: "somewhere", kind: "earthquake",
    receivedAt: 1_700_000_020_000,
  };
  return { key: id, readings: [primary], primary };
};

describe("which arrivals get a wavefront", () => {
  it("is not spent by an announcement that carries no events", () => {
    /*
     * A source going live announces before its first batch lands, so the first announcement is
     * reliably empty. If that consumes `seeding`, the actual seed arrives looking like live traffic
     * and every one of its events gets a wavefront.
     */
    expect(frontsFor({ arrived: [], seeding: true })).toHaveLength(0);
  });

  it("replays exactly one front for the daily seed, however large it is", () => {
    const arrived = Array.from({ length: 227 }, (_, i) => quake(`u${i}`, 3));
    const fronts = frontsFor({ arrived, seeding: true });

    // 227 fronts would be a fireworks display announcing nothing: none of them just happened.
    expect(fronts).toHaveLength(1);
    expect(fronts[0]!.key).toBe("u226");
  });

  it("replays the most recent arrival, not the first", () => {
    const fronts = frontsFor({
      arrived: [quake("old", 2), quake("mid", 6), quake("newest", 3)],
      seeding: true,
    });
    // The newest, not the largest. A front means "this just arrived", and picking the biggest
    // instead would be choosing what to show over what is true.
    expect(fronts[0]!.key).toBe("newest");
  });

  it("still produces a front when the seed contains a single event", () => {
    expect(frontsFor({ arrived: [quake("only", 4)], seeding: true })).toHaveLength(1);
  });

  it("produces none when the seed is empty, rather than a phantom", () => {
    expect(frontsFor({ arrived: [], seeding: true })).toHaveLength(0);
  });

  it("gives every live arrival its own front", () => {
    const arrived = [quake("a", 4), quake("b", 5), quake("c", 3)];
    expect(frontsFor({ arrived, seeding: false })).toHaveLength(3);
  });
});
