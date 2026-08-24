import { describe, expect, it } from "vitest";
import {
  compactSpan, corroborationNote, floodNote, reach, reachFraction, reachNote, reachWords,
  boundaryNote, depthNote, farSideNote, motionNote, quietNote, soundNote, theOf,
  wildfireNote, quietParts, cycloneNote, volcanoNote, windowLabel,
} from "./format";

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

describe("what a feed's bar says while it is still arriving", () => {
  it("gives the reach once the feed has answered", () => {
    expect(reachWords(now - 18 * HOUR, false, now, DAY)).toBe("18h");
    expect(reachWords(now - DAY, false, now, DAY)).toBe("24h");
  });

  it("distinguishes not yet from refused, which resolve differently", () => {
    /*
     * `reach` alone answers "no backlog" for both, which describes a feed that failed as one that
     * happened to have nothing. The first fixes itself and the second does not, and the point of two
     * bars is seeing which feed is carrying the window.
     */
    expect(reachWords(null, false, now, DAY)).toBe("waiting");
    expect(reachWords(null, true, now, DAY)).toBe("no answer");
  });

  it("prefers a reach it has over a failure it also has", () => {
    // A feed can seed and then lose its socket. The backlog it delivered is still real.
    expect(reachWords(now - 6 * HOUR, true, now, DAY)).toBe("6h");
  });
});

describe("stating the corroboration rate where it is true", () => {
  const overlap = { events: 202, both: 100 };

  it("gives the rate against the span both feeds cover, not the window", () => {
    /*
     * The number this exists for, measured against the live feeds. A `both` count of about a hundred
     * reads as 0.9 percent of a 30-day window and is 49.5 percent of the 21 hours EMSC actually reaches.
     * The project's subject is two agencies reporting one earthquake and its own headline was
     * understating it fifty-five fold.
     */
    const note = corroborationNote(overlap, now - 21 * HOUR, now, MONTH)!;
    expect(note).toContain("21h");
    expect(note).toContain("100 of 202");
    expect(note).toContain("50%");
  });

  it("says nothing when the overlap is the whole window", () => {
    // Then the header's bare count already has the right denominator beside it, and this would be the
    // same fact printed twice.
    expect(corroborationNote(overlap, now - DAY, now, DAY)).toBeNull();
    // Within a whisker counts as the whole thing: a feed seeding a second late is not an asymmetry.
    expect(corroborationNote(overlap, now - DAY * 0.99, now, DAY)).toBeNull();
  });

  it("says nothing when there is no overlap to report", () => {
    // Distinct from a rate of zero, which would be a claim about two feeds that did overlap.
    expect(corroborationNote(null, null, now, MONTH)).toBeNull();
    expect(corroborationNote(overlap, null, now, MONTH)).toBeNull();
  });

  it("says nothing about an overlap holding no events", () => {
    expect(corroborationNote({ events: 0, both: 0 }, now - HOUR, now, MONTH)).toBeNull();
  });

  it("reports an honest zero when the feeds overlap and never agree", () => {
    // Worth saying: two agencies looking at the same hours and matching nothing is the interesting
    // failure, not an absence of data.
    const note = corroborationNote({ events: 40, both: 0 }, now - 3 * HOUR, now, MONTH)!;
    expect(note).toContain("0 of 40");
    expect(note).toContain("0%");
  });

  it("separates thousands, because these counts get large at a month", () => {
    const note = corroborationNote({ events: 2400, both: 1100 }, now - 12 * HOUR, now, MONTH)!;
    expect(note).toContain("1,100 of 2,400");
  });
});

describe("the fire sentence, which has to admit its own count is a floor", () => {
  it("says the count, the area and how long it has been burning", () => {
    const note = wildfireNote({ count: 42, km2: 16203, medianDays: 9, leader: "Angola" }, 100)!;
    expect(note).toContain("42 of them");
    expect(note).toContain("16,203 square kilometres");
    expect(note).toContain("9 days at the median");
  });

  it("adds the caveat only when the cap is actually in play", () => {
    const under = wildfireNote({ count: 42, km2: 100, medianDays: 9, leader: "Angola" }, 100)!;
    expect(under).not.toContain("floor");
    const at = wildfireNote({ count: 100, km2: 100, medianDays: 9, leader: "Angola" }, 100)!;
    expect(at).toContain("stops at 100");
    expect(at).toContain("Angola alone has more");
    expect(at).toContain("floor");
  });

  it("names the country by burned area, since the mark count is the truncated thing", () => {
    const note = wildfireNote({ count: 100, km2: 1, medianDays: 1, leader: "Australia" }, 100)!;
    expect(note).toContain("Australia alone");
  });

  it("says nothing at all when nothing is burning", () => {
    expect(wildfireNote({ count: 0, km2: 0, medianDays: null, leader: null }, 100)).toBeNull();
  });

  it("drops the duration rather than printing a null day count", () => {
    const note = wildfireNote({ count: 3, km2: 9, medianDays: null, leader: "Brazil" }, 100)!;
    expect(note).not.toContain("median");
    expect(note).toContain("3 of them");
  });
});

describe("the flood sentence, which declines to rate anything", () => {
  it("says how many and where, and that there is no severity to give", () => {
    const note = floodNote(19, 19)!;
    expect(note).toContain("19 of them");
    expect(note).toContain("across 19 countries");
    expect(note).toContain("magnitude zero");
  });

  it("does not say across one country", () => {
    expect(floodNote(1, 1)!).not.toContain("across");
  });

  it("says nothing when nothing is flooded", () => {
    expect(floodNote(0, 0)).toBeNull();
  });
});

describe("the article a country name needs", () => {
  it("leaves a proper-noun name alone", () => {
    expect(theOf("Angola")).toBe("Angola");
    expect(theOf("Brazil")).toBe("Brazil");
    expect(theOf("Australia")).toBe("Australia");
  });

  it("gives one to a name headed by a common noun", () => {
    expect(theOf("Russian Federation")).toBe("the Russian Federation");
    expect(theOf("United States")).toBe("the United States");
    expect(theOf("Philippines")).toBe("the Philippines");
  });

  it("does not double one GDACS already wrote", () => {
    expect(theOf("The Democratic Republic of Congo")).toBe("The Democratic Republic of Congo");
  });

  it("reads the head of a composite name, not the whole of it", () => {
    // A Republic appears in this one, and Zambia is what heads it.
    expect(theOf("Zambia, The Democratic Republic of Congo"))
      .toBe("Zambia, The Democratic Republic of Congo");
    expect(theOf("The Democratic Republic of Congo, Angola"))
      .toBe("The Democratic Republic of Congo, Angola");
  });
});

describe("the far-side sentence", () => {
  const len = (arc: number): number => 2 * Math.PI * 6371 * Math.abs(Math.sin((arc * Math.PI) / 180));

  it("states the widest front and names the pair that proves it is closing", () => {
    const note = farSideNote([30, 60, 90, 120, 150], len, { lon: -40, lat: -38 });
    expect(note).toContain("40,030 km of front");
    expect(note).toContain("the 150-degree arc is the same length as the 30");
  });

  it("names where the front closes, in hemispheres rather than signs", () => {
    expect(farSideNote([30, 150], len, { lon: -40, lat: -38 })).toContain("38.00 S 40.00 W");
  });

  it("refuses to put a time on it, and says why in the same breath", () => {
    /*
     * The one claim this figure must not make. Minutes on these arcs would be the teleseismic path
     * through the mantle that arrival.ts already declined by capping at 700km.
     */
    const note = farSideNote([30, 60, 90, 120, 150], len, { lon: 0, lat: 0 });
    expect(note).toContain("No time is drawn");
    expect(note).not.toMatch(/\d+\s*(min|minute|second|s\b)/);
  });

  it("reads the widest off the arcs it was given rather than assuming 90 is among them", () => {
    const note = farSideNote([30, 60], len, { lon: 0, lat: 0 });
    expect(note).toContain(`${Math.round(len(60)).toLocaleString("en")} km of front`);
  });
});

describe("the plate-motion sentence", () => {
  it("says the word that stops the arrows meaning something else", () => {
    // Read as absolute motion over the mantle these would be wrong everywhere, and an arrow cannot
    // carry the word "relative" by itself.
    expect(motionNote({ arrows: 231, fastest: 227.2, converging: 90 }))
      .toContain("one side relative to the other");
  });

  it("gives the angle its reading, since nobody would look for it", () => {
    const note = motionNote({ arrows: 231, fastest: 227.2, converging: 90 });
    expect(note).toContain("Across a line is opening, into it is closing, along it is sliding");
  });

  it("states the counts and puts the fastest rate in human terms", () => {
    const note = motionNote({ arrows: 231, fastest: 227.2, converging: 90 });
    expect(note).toContain("90 of the 231 are closing");
    expect(note).toContain("227 mm a year");
    expect(note).toContain("a metre every four years");
  });
});

describe("where an event sits relative to the plate edges", () => {
  it("says so plainly when it is on one, rather than printing a round zero", () => {
    expect(boundaryNote(0)).toBe("on it");
    expect(boundaryNote(24)).toBe("on it");
  });

  it("gives a distance once it is off the line", () => {
    expect(boundaryNote(93)).toBe("93 km away");
  });

  it("groups the thousands, because the interesting ones are four digits", () => {
    // Pahala, Hawaii, the day this was measured.
    expect(boundaryNote(3557)).toBe("3,557 km away");
  });

  it("says nothing at all until the boundary file has loaded", () => {
    expect(boundaryNote(null)).toBeNull();
  });
});

describe("the negative-space sentence", () => {
  it("states the band, the surface share, and the concentration as a floor", () => {
    const note = quietNote(41, 81, 100, 0.094)!;
    expect(note).toContain("That 100 km band");
    expect(note).toContain("9.4% of the surface");
    expect(note).toContain("at least 5.4 times");
  });

  it("leaves the percentage to the title block, which is where it is now read", () => {
    // Split deliberately: the value goes in a framed cell, the argument stays in the notes row. The
    // sentence must not carry the number as well, or the rail states it twice.
    const parts = quietParts(41, 81, 0.094)!;
    expect(parts.percent).toBe(51);
    expect(parts.times).toBeCloseTo(5.38, 2);
    expect(quietNote(41, 81, 100, 0.094)!).not.toContain("51%");
  });

  it("has nothing to say about an empty window", () => {
    expect(quietParts(0, 0, 0.094)).toBeNull();
    expect(quietNote(0, 0, 100, 0.094)).toBeNull();
  });

  it("leaves the flourish to the still, which is the only place it earns its words", () => {
    // "the rest of the planet had the day off" is eight words of voice in a rail that already prints the
    // band and the percentage in framed cells. The poster carries the deadpan now.
    expect(quietNote(41, 81, 100, 0.094)!).not.toMatch(/day off/);
    expect(quietNote(41, 81, 100, 0.094)!.split(/\s+/).length).toBeLessThan(20);
  });

  it("says at least, because the catalogue over-counts the interiors", () => {
    /*
     * Not hedging. A dense network finds M2 under Oklahoma and nobody is listening mid-Pacific, so the
     * intraplate count is inflated and this ratio is pushed down. The truth is above whatever it prints.
     */
    expect(quietNote(41, 81, 100, 0.094)!).toContain("at least");
  });

  it("has nothing to say about an empty window", () => {
    expect(quietNote(0, 0, 100, 0.094)).toBeNull();
  });
});

describe("the depth sentence, which counts instead of promising", () => {
  it("says how many are in each band", () => {
    const note = depthNote({ shallow: 70, intermediate: 8, deep: 1, unknown: 0, total: 79 })!;
    expect(note).toContain("70 above 70 km");
    expect(note).toContain("8 between 70 and 300");
    expect(note).toContain("1 below 300");
  });

  it("always states the deep count, even when it is zero", () => {
    /*
     * The whole point of the row. The encoding's payoff is a margin resolving into rings, and on a
     * typical day one event of seventy-nine is deep enough to be one, so "0 below 300" is the useful
     * reading rather than an omission.
     */
    expect(depthNote({ shallow: 40, intermediate: 0, deep: 0, unknown: 0, total: 40 })!)
      .toContain("0 below 300");
  });

  it("drops the intermediate clause when there are none, rather than printing a zero for it", () => {
    const note = depthNote({ shallow: 40, intermediate: 0, deep: 2, unknown: 0, total: 42 })!;
    expect(note).not.toContain("between 70 and 300");
  });

  it("reports a missing depth rather than folding it into shallow", () => {
    expect(depthNote({ shallow: 4, intermediate: 0, deep: 0, unknown: 3, total: 7 })!)
      .toContain("3 with no depth given");
  });

  it("says nothing for an empty window", () => {
    expect(depthNote({ shallow: 0, intermediate: 0, deep: 0, unknown: 0, total: 0 })).toBeNull();
  });
});

describe("the sound sentence", () => {
  it("says it is not a recording, before anything else about it", () => {
    /*
     * The one outright falsehood this app could tell. Ground motion is below hearing, so a tone offered
     * as the sound of an earthquake would be invention presented as data.
     */
    const note = soundNote(4.5);
    expect(note).toContain("not a recording");
    expect(note).toContain("below hearing");
  });

  it("admits that loudness is not energy", () => {
    expect(soundNote(4.5)).toContain("loudness is not energy");
    expect(soundNote(4.5)).toContain("thirty thousand times");
  });

  it("gives the pitch direction its reason, since it is derived and not chosen", () => {
    expect(soundNote(4.5)).toContain("lower for bigger");
    expect(soundNote(4.5)).toContain("direction a real rupture goes");
  });

  it("names the threshold it follows, which is the announce one", () => {
    expect(soundNote(4.5)).toContain("above M4.5");
    expect(soundNote(2)).toContain("above M2.0");
  });
});

describe("the layer sentences on an archived day", () => {
  it("stops claiming now about a day that has already happened", () => {
    const storms = [{ name: "Fabio", peakKmh: 120 }];
    const cat = (): string | null => null;
    expect(cycloneNote(storms, cat, true)).toContain("1 tropical cyclone that day");
    expect(cycloneNote(storms, cat)).toContain("1 tropical cyclone running");

    const fire = { count: 20, km2: 400, medianDays: 3, leader: "Spain" };
    expect(wildfireNote(fire, 100, true)).toContain("that burned that day");
    expect(wildfireNote(fire, 100)).toContain("burning now");

    expect(floodNote(4, 4, true)).toContain("floods that day");
    expect(floodNote(4, 4)).toContain("floods running now");

    expect(volcanoNote(3, Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-05-15T00:00:00Z"), true))
      .toContain("was erupting then");
    expect(volcanoNote(3, Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-05-15T00:00:00Z")))
      .toContain("is erupting this minute");
  });

  it("suppresses the fire floor on an archived day, because that cap is the live feed's", () => {
    // GDACS stops at 100; the archive is a different upstream with a cap of ours that is never hit.
    const capped = { count: 100, km2: 900, medianDays: 4, leader: "Spain" };
    expect(wildfireNote(capped, 100)).toContain("count is a floor");
    expect(wildfireNote(capped, 100, true)).not.toContain("count is a floor");
  });
});

describe("the window label on an archived day", () => {
  const NOW = Date.parse("2026-05-16T00:00:00Z");
  const COVERED = Date.parse("2026-05-15T00:00:00Z");

  it("names the day's span rather than a distance from now", () => {
    expect(windowLabel(NOW, 86_400_000, COVERED, true)).toBe("the whole day");
    expect(windowLabel(NOW, 86_400_000, COVERED)).toBe("last 24 hours");
  });

  it("says the same thing at every window, because they all cover the day", () => {
    // 24h, 7d and 30d are the only options and the archived span is one day.
    for (const ms of [86_400_000, 7 * 86_400_000, 30 * 86_400_000]) {
      expect(windowLabel(NOW, ms, COVERED, true)).toBe("the whole day");
    }
  });

  it("still says nothing yet before anything has landed", () => {
    // Coverage is a fact about the fetch, not about which day is on screen.
    expect(windowLabel(NOW, 86_400_000, null, true)).toBe("nothing yet");
  });
});
