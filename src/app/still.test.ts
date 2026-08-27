import { describe, expect, it } from "vitest";
import { captionLines, stillMoment, STILL_HEIGHT, STILL_WIDTH, verdictLine} from "./still";

const NOW = Date.parse("2026-08-21T04:12:30Z");

describe("what the still says it is of", () => {
  it("stamps the cursor's moment, not the clock, when one is held", () => {
    // The whole reason this is not a screenshot. A still of a view parked two hours back is a picture of two
    // hours ago, and stamping it "now" would be the image lying about itself.
    const twoHoursBack = NOW - 2 * 3_600_000;
    expect(stillMoment(twoHoursBack, NOW)).toBe("Held at 2026-08-21 02:12 UTC");
  });

  it("says live, with the time, when nothing is held", () => {
    expect(stillMoment(null, NOW)).toBe("Live · 2026-08-21 04:12 UTC");
  });

  it("writes an absolute time rather than a relative one", () => {
    // "18 minutes ago" ages into a lie the instant the file is saved, and a still is looked at later by
    // definition, so it carries its date too.
    for (const cursor of [null, NOW - 60_000]) {
      const text = stillMoment(cursor, NOW);
      expect(text).toContain("2026-08-21");
      expect(text).toContain("UTC");
      expect(text).not.toMatch(/ago|minute|hour/);
    }
  });

  it("is UTC, so a still shared across timezones means one moment", () => {
    // Midnight UTC, which is the previous evening in the Americas: the stamp must not drift with the
    // viewer's offset the way a zoneless GDACS date does.
    expect(stillMoment(Date.parse("2026-08-21T00:00:00Z"), NOW))
      .toBe("Held at 2026-08-21 00:00 UTC");
  });
});

describe("the caption", () => {
  it("is the wordmark, the evidence, the moment, then the filter and where it came from", () => {
    const lines = captionLines({
      moment: "Live · 2026-08-21 04:12 UTC",
      verdict: "120 earthquakes. 4 cyclones.",
      filter: "M2.0+ · last 24h",
      host: "everythingisfine.aidenjang.com",
    });
    expect(lines[0]).toBe("EVERYTHING IS FINE");
    expect(lines[1]).toBe("120 earthquakes. 4 cyclones.");
    expect(lines[2]).toBe("Live · 2026-08-21 04:12 UTC");
    expect(lines[3]).toBe("M2.0+ · last 24h · everythingisfine.aidenjang.com");
  });

  it("carries the filter, so an empty ocean is not read as a quiet ocean", () => {
    // A still taken at M6+ shows almost nothing. Without the threshold on it, that reads as a calm day.
    const lines = captionLines({ moment: "x", verdict: null, filter: "M6.0+ · last 24h", host: "h" });
    expect(lines[3]).toContain("M6.0+");
  });
});

describe("the verdict, which is the half the poster was missing", () => {
  const base = { quakes: 0, cyclones: 0, fires: 0, firesCapped: false, floods: 0 };

  it("states every layer that has something, in the order the app names them", () => {
    expect(verdictLine({ quakes: 120, cyclones: 4, fires: 87, firesCapped: false, floods: 9 }))
      .toBe("120 earthquakes. 4 cyclones. 87 fires. 9 floods.");
  });

  it("groups a thousand the way the rest of the app does", () => {
    // Caught by exporting one: a busy day printed "6000 earthquakes" beside a rail reading "6,000". Every
    // test here used to sit under a thousand, which is exactly why nothing failed.
    expect(verdictLine({ ...base, quakes: 6000 })).toBe("6,000 earthquakes.");
    expect(verdictLine({ ...base, quakes: 11363 })).toBe("11,363 earthquakes.");
    // The floor marker still lands on the number rather than after the separator.
    expect(verdictLine({ ...base, fires: 1200, firesCapped: true })).toBe("1,200+ fires.");
  });

  it("leaves out what is not there, because a zero is not a fact worth a poster", () => {
    expect(verdictLine({ ...base, quakes: 120 })).toBe("120 earthquakes.");
    expect(verdictLine({ ...base, quakes: 120, floods: 2 })).toBe("120 earthquakes. 2 floods.");
  });

  it("marks the fire count as a floor when the feed is capped", () => {
    // The feed stops at 100 and one country can fill it, so a flat "100 fires" would state a floor as a
    // total on the one surface with nothing around to correct it.
    expect(verdictLine({ ...base, fires: 100, firesCapped: true })).toBe("100+ fires.");
    expect(verdictLine({ ...base, fires: 100, firesCapped: false })).toBe("100 fires.");
  });

  it("says nothing about volcanoes, because none of them are current", () => {
    // GDACS flags no volcano current and the newest episode is usually weeks old. A line stamped "Live"
    // is the worst place to let a triangle pass as an eruption, so every number here is a now number.
    const line = verdictLine({ quakes: 5, cyclones: 1, fires: 3, firesCapped: false, floods: 1 })!;
    expect(line).not.toMatch(/volcano/i);
  });

  it("counts one of a thing as one", () => {
    expect(verdictLine({ ...base, quakes: 1, cyclones: 1, fires: 1, floods: 1 }))
      .toBe("1 earthquake. 1 cyclone. 1 fire. 1 flood.");
  });

  it("has nothing to say about an empty planet rather than writing the word nothing", () => {
    expect(verdictLine(base)).toBeNull();
  });
});

describe("the frame", () => {
  it("is a fixed size, so a still does not vary with the window it came from", () => {
    // Square, because the subject is a sphere. See the note on the constants.
    expect([STILL_WIDTH, STILL_HEIGHT]).toEqual([1200, 1200]);
  });
});

describe("a still taken while an archived day is on screen", () => {
  it("names the day instead of saying Live", () => {
    // The falsehood this exists to stop. The clock was made archive-aware when that mode shipped, so the
    // stamp was correct and the word in front of it was not.
    const dayEnd = Date.parse("2026-07-05T00:00:00Z");
    expect(stillMoment(null, dayEnd, true)).toBe("Archived day · 2026-07-05");
    expect(stillMoment(null, dayEnd, true)).not.toContain("Live");
  });

  it("still says Live when the app actually is", () => {
    expect(stillMoment(null, NOW, false)).toBe("Live · 2026-08-21 04:12 UTC");
    // The flag defaults to live, so every existing caller keeps its behaviour.
    expect(stillMoment(null, NOW)).toBe("Live · 2026-08-21 04:12 UTC");
  });

  it("needs no word either way once a moment is held", () => {
    const held = Date.parse("2026-07-04T09:30:00Z");
    expect(stillMoment(held, NOW, true)).toBe("Held at 2026-07-04 09:30 UTC");
    expect(stillMoment(held, NOW, false)).toBe("Held at 2026-07-04 09:30 UTC");
  });
});
