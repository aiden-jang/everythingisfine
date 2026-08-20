import { describe, expect, it } from "vitest";
import { compactSpan, reach, reachFraction, reachNote } from "./format";

/*
 * The reach labels, which exist because two feeds do not cover the same span.
 *
 * The header prints a count per agency and the rail prints one left edge for the pair, so the number
 * nobody could get was how much of the window each agency is actually answering for. Every case here
 * is a sentence somebody would read as a bug if it were wrong.
 */

const HOUR = 3_600_000;
const now = 1_700_000_000_000;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

describe("a window in the space a chip has", () => {
  it("switches to days at the same threshold the strip's axis does", () => {
    expect(compactSpan(24 * HOUR)).toBe("24h");
    expect(compactSpan(47 * HOUR)).toBe("47h");
    expect(compactSpan(7 * DAY)).toBe("7d");
    expect(compactSpan(MONTH)).toBe("30d");
  });
});

describe("how far back one agency reaches", () => {
  it("shows the window when it covers the window, rather than a distance", () => {
    expect(reach(now - DAY, now, DAY)).toBe("24h");
    expect(reach(now - MONTH - HOUR, now, MONTH)).toBe("30d");
  });

  it("shows how much less when it covers less", () => {
    expect(reach(now - 18 * HOUR, now, MONTH)).toBe("18h");
  });

  it("says no backlog rather than showing a zero, which is a different fact", () => {
    expect(reach(null, now, DAY)).toBe("no backlog");
  });
});

describe("the note under the pair", () => {
  it("says nothing while both cover the window, so the caveat is never stale", () => {
    expect(reachNote({ usgs: now - DAY, emsc: now - DAY }, now, DAY)).toBeNull();
  });

  it("says nothing before the first seed, which the rail is already reporting", () => {
    expect(reachNote({ usgs: null, emsc: null }, now, DAY)).toBeNull();
  });

  it("names the truncated agency, its reach, and who covers the rest", () => {
    const note = reachNote({ usgs: now - MONTH, emsc: now - 18 * HOUR }, now, MONTH);
    expect(note).toBe(
      "EMSC returns its most recent page whatever the window, so it reaches only as far back as 18h."
      + " Older events are USGS alone.",
    );
  });

  it("does not blame the cap for a feed that returned nothing at all", () => {
    /*
     * Two different failures. A short page was capped by the endpoint; an absent one failed, and it
     * has its own notice elsewhere. One sentence covering both would explain the wrong thing about
     * the wrong feed.
     */
    const note = reachNote({ usgs: null, emsc: now - 18 * HOUR }, now, MONTH);
    expect(note).toContain("EMSC returns its most recent page");
    expect(note).toContain("USGS has returned no backlog.");
    expect(note).not.toContain("alone");
  });

  it("drops the who-covers-the-rest clause when nobody does", () => {
    const note = reachNote({ usgs: now - 2 * HOUR, emsc: now - 18 * HOUR }, now, MONTH);
    expect(note).toBe(
      "USGS and EMSC return their most recent page whatever the window, so they reach only as far"
      + " back as 18h.",
    );
  });

  it("names the deepest reach of the short ones, not the shallowest", () => {
    // Understating what is held would be the same kind of error in the other direction.
    const note = reachNote({ usgs: now - 2 * HOUR, emsc: now - 18 * HOUR }, now, MONTH);
    expect(note).toContain("18h");
    expect(note).not.toContain("2h");
  });
});

describe("the reach as a fraction of the window", () => {
  it("is the whole axis for a feed that covers the whole window", () => {
    expect(reachFraction(now - DAY, now, DAY)).toBeCloseTo(1, 9);
  });

  it("is the proportion the words cannot give", () => {
    /*
     * The reason the bars exist beside the durations. "6h" against "30d" is a fortieth, and arriving at
     * that from two words is arithmetic the reader should not have to do.
     */
    expect(reachFraction(now - 18 * HOUR, now, MONTH)).toBeCloseTo(0.025, 4);
    expect(reachFraction(now - 18 * HOUR, now, DAY)).toBeCloseTo(0.75, 4);
  });

  it("is nothing for a feed that fetched no backlog", () => {
    // Distinct from a short one, and drawn as nothing rather than as a sliver.
    expect(reachFraction(null, now, DAY)).toBe(0);
  });

  it("never exceeds the axis, however far back a feed vouches", () => {
    expect(reachFraction(now - 10 * MONTH, now, DAY)).toBe(1);
  });

  it("refuses a window with no width rather than dividing by it", () => {
    expect(reachFraction(now - DAY, now, 0)).toBe(0);
  });
});
