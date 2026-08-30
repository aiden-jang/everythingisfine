import { describe, expect, it } from "vitest";
import {
  choosePrimary, DISTANCE_LIMIT_KM, MAGNITUDE_LIMIT, sameEvent, TIME_WINDOW_MS,
} from "./reconcile";
import type { Reading } from "./types";

/* The one decision this whole app is about: whether two agencies are describing one earthquake. See
   ARCHITECTURE.md. */

const at = (over: Partial<Reading> = {}): Reading => ({
  source: "usgs", id: "a1", magnitude: 5.0, scale: "mww", lon: 141.0, lat: 38.0, depthKm: 30,
  time: 1_700_000_000_000, place: "somewhere", kind: "earthquake",
  receivedAt: 1_700_000_000_000, ...over,
});

describe("two agencies on one rupture", () => {
  it("associates the worst genuine disagreement actually observed", () => {
    // 97 measured cross-agency pairs, and the furthest apart in magnitude was 0.40 - a small event,
    // where the scales differ most. Time and distance here are inside the measured p95s too.
    const usgs = at({ magnitude: 5.0, time: 1_700_000_000_000 });
    const emsc = at({
      source: "emsc", id: "e1", magnitude: 5.4, scale: "ml",
      time: 1_700_000_003_000, lon: 141.2, lat: 38.1,
    });
    expect(sameEvent(usgs, emsc)).toBe(true);
  });

  it("associates a great earthquake, where the scales could have diverged and do not", () => {
    // At M6+ both agencies report Mw or Mww: 47 pairs over 120 days agreed to 0.1, M7.8 included.
    const usgs = at({ magnitude: 7.8, scale: "mww" });
    const emsc = at({ source: "emsc", id: "e2", magnitude: 7.8, scale: "mw", time: 1_700_000_001_000 });
    expect(sameEvent(usgs, emsc)).toBe(true);
  });

  it("still associates when one agency has not published a magnitude yet", () => {
    /*
     * A wrong split is worse than a wrong merge here: two markers on one rupture until the revision
     * lands, on a globe where a marker means an earthquake.
     */
    const usgs = at({ magnitude: Number.NaN });
    const emsc = at({ source: "emsc", id: "e3", magnitude: 6.2, time: 1_700_000_002_000 });
    expect(sameEvent(usgs, emsc)).toBe(true);
    expect(sameEvent(emsc, usgs)).toBe(true);
  });
});

describe("a mainshock and its aftershock", () => {
  it("is no longer folded into one event when the sizes are far apart", () => {
    /*
     * The documented false positive. Inside both the time and the distance window - which is exactly why
     * neither of those could separate it - and more than a magnitude unit down, which is where most
     * aftershocks sit.
     */
    const mainshock = at({ magnitude: 6.8 });
    const aftershock = at({
      source: "emsc", id: "e4", magnitude: 5.0, time: 1_700_000_005_000, lon: 141.3, lat: 38.2,
    });
    expect(sameEvent(mainshock, aftershock)).toBe(false);
  });

  it("still merges a doublet, which this cannot separate and does not pretend to", () => {
    const first = at({ magnitude: 6.2 });
    const second = at({ source: "emsc", id: "e5", magnitude: 6.0, time: 1_700_000_004_000 });
    expect(sameEvent(first, second)).toBe(true);
  });

  it("treats the magnitude limit as inclusive", () => {
    const a = at({ magnitude: 6.0 });
    const inside = at({ source: "emsc", id: "e6", magnitude: 6.0 - MAGNITUDE_LIMIT });
    const outside = at({ source: "emsc", id: "e7", magnitude: 6.0 - MAGNITUDE_LIMIT - 0.01 });
    expect(sameEvent(a, inside)).toBe(true);
    expect(sameEvent(a, outside)).toBe(false);
  });
});

describe("the windows that were already there", () => {
  it("refuses a pair outside the time window however well the rest matches", () => {
    const a = at();
    const late = at({ source: "emsc", id: "e8", time: 1_700_000_000_000 + TIME_WINDOW_MS + 1 });
    expect(sameEvent(a, late)).toBe(false);
  });

  it("refuses a pair outside the distance limit", () => {
    const a = at({ lon: 0, lat: 0 });
    // Two degrees of latitude is 222km, comfortably past the limit.
    const far = at({ source: "emsc", id: "e9", lon: 0, lat: 2 });
    expect(DISTANCE_LIMIT_KM).toBe(150);
    expect(sameEvent(a, far)).toBe(false);
  });
});

describe("one agency revising itself", () => {
  it("is an identity, not a guess", () => {
    // Same source and id is a revision of one record, so nothing else is consulted - a corrected
    // magnitude two units off is still the same earthquake.
    const first = at({ magnitude: 5.0 });
    const revised = at({ magnitude: 7.0, time: 1_700_000_900_000, lon: 150, lat: 10 });
    expect(sameEvent(first, revised)).toBe(true);
  });

  it("never merges two different records from the same agency", () => {
    const a = at({ id: "a1" });
    const b = at({ id: "a2" });
    expect(sameEvent(a, b)).toBe(false);
  });
});

describe("which account the marker is drawn from", () => {
  it("is USGS when both agencies reported, whatever order they arrived in", () => {
    const usgs = at();
    const emsc = at({ source: "emsc", id: "e10" });
    expect(choosePrimary([emsc, usgs]).source).toBe("usgs");
    expect(choosePrimary([usgs, emsc]).source).toBe("usgs");
  });

  it("is whatever there is when only one agency reported", () => {
    const emsc = at({ source: "emsc", id: "e11" });
    expect(choosePrimary([emsc]).source).toBe("emsc");
  });
});
