import { describe, expect, it } from "vitest";
import { captionLines, stillMoment, STILL_HEIGHT, STILL_WIDTH } from "./still";

const NOW = Date.parse("2026-08-21T04:12:30Z");

describe("what the still says it is of", () => {
  it("stamps the cursor's moment, not the clock, when one is held", () => {
    /*
     * The whole reason this is not a screenshot. A still of a view parked two hours back is a picture of
     * two hours ago, and stamping it "now" would be the image lying about itself.
     */
    const twoHoursBack = NOW - 2 * 3_600_000;
    expect(stillMoment(twoHoursBack, NOW)).toBe("Held at 2026-08-21 02:12 UTC");
  });

  it("says live, with the time, when nothing is held", () => {
    expect(stillMoment(null, NOW)).toBe("Live · 2026-08-21 04:12 UTC");
  });

  it("writes an absolute time rather than a relative one", () => {
    /*
     * "18 minutes ago" ages into a lie the instant the file is saved, and a still is looked at later by
     * definition. So it carries its date too, not just a clock time.
     */
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
  it("is the wordmark, the moment, then the filter and where it came from", () => {
    const lines = captionLines({
      moment: "Live · 2026-08-21 04:12 UTC",
      filter: "M2.0+ · last 24h",
      host: "everythingisfine.aidenjang.com",
    });
    expect(lines[0]).toBe("EVERYTHING IS FINE");
    expect(lines[1]).toBe("Live · 2026-08-21 04:12 UTC");
    expect(lines[2]).toBe("M2.0+ · last 24h · everythingisfine.aidenjang.com");
  });

  it("carries the filter, so an empty ocean is not read as a quiet ocean", () => {
    // A still taken at M6+ shows almost nothing. Without the threshold on it, that reads as a calm day.
    const lines = captionLines({ moment: "x", filter: "M6.0+ · last 24h", host: "h" });
    expect(lines[2]).toContain("M6.0+");
  });
});

describe("the frame", () => {
  it("is a fixed size, so a still does not vary with the window it came from", () => {
    expect([STILL_WIDTH, STILL_HEIGHT]).toEqual([1600, 900]);
  });
});
