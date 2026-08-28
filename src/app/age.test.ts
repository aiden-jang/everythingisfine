import { describe, expect, it } from "vitest";
import { spanWords, withinWindow } from "./age";

const NOW = 1_700_000_000_000;
const DAYS = (n: number) => NOW - n * 86_400_000;
const HOURS = (n: number) => NOW - n * 3_600_000;

describe("dating a hazard that outlives the window", () => {
  it("dates an ongoing event from its start, which is the number that surprises", () => {
    // The complaint this exists for: a three-week-old fire under a 24-hour window looked like a leak.
    expect(spanWords(DAYS(23), DAYS(3), NOW, true)).toBe("23d ongoing");
  });

  it("says only ongoing for something minutes old, rather than stuttering", () => {
    expect(spanWords(NOW - 10_000, null, NOW, true)).toBe("ongoing");
  });

  it("falls back to the bare word when an ongoing event carries no start", () => {
    expect(spanWords(null, null, NOW, true)).toBe("ongoing");
  });

  it("dates a finished episode from its end, in the past tense", () => {
    expect(spanWords(null, DAYS(9), NOW, false)).toBe("9d ago");
  });

  it("says nothing rather than guessing when a finished event carries no dates", () => {
    expect(spanWords(null, null, NOW, false)).toBe("");
  });
});

describe("what the window keeps", () => {
  it("keeps a date inside the window and drops one outside it", () => {
    expect(withinWindow(HOURS(9), NOW, 86_400_000)).toBe(true);
    expect(withinWindow(DAYS(9), NOW, 86_400_000)).toBe(false);
    // The same event returns at a month, which is what widening the window is for.
    expect(withinWindow(DAYS(9), NOW, 30 * 86_400_000)).toBe(true);
  });

  it("keeps an undated event, rather than dropping the reason for dropping it", () => {
    expect(withinWindow(null, NOW, 86_400_000)).toBe(true);
  });
});
