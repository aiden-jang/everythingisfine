import { describe, expect, it } from "vitest";
import days from "./baseline.json";
import { BASELINE_DAYS, BASELINE_MIN_MAGNITUDE, rankDay, sharePercent } from "./baseline";

const counts = days as number[];

describe("the five-year baseline table", () => {
  it("is sorted, which is what the binary search assumes", () => {
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });

  it("covers whole years of whole days", () => {
    // Five years, one of them a leap year. A short table means a page silently failed.
    expect(counts.length).toBe(1826);
    expect(BASELINE_DAYS).toBe(counts.length);
    expect(counts.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it("has the spread that makes a ranking worth printing", () => {
    // A distribution this wide is the reason the feature exists: the median day is nothing like the
    // busiest one, so "how many today" genuinely needs an answer to "compared with what".
    const median = counts[Math.floor(counts.length / 2)]!;
    expect(median).toBeGreaterThan(5);
    expect(counts[counts.length - 1]!).toBeGreaterThan(median * 5);
  });
});

describe("ranking a day against it", () => {
  it("says quieter when most days had more, and busier when most had fewer", () => {
    const quiet = rankDay(counts[0]!, true)!;
    expect(quiet.direction).toBe("quieter");
    // The quietest day in five years: almost every other day had more.
    expect(quiet.share).toBeGreaterThan(0.9);

    const loud = rankDay(counts[counts.length - 1]!, true)!;
    expect(loud.direction).toBe("busier");
    expect(loud.share).toBeGreaterThan(0.9);
  });

  it("counts strictly on both sides, so a tied day is claimed by neither", () => {
    const median = counts[Math.floor(counts.length / 2)]!;
    const tied = counts.filter((n) => n === median).length;
    const rank = rankDay(median, true)!;
    const quieter = counts.filter((n) => n < median).length;
    const busier = counts.filter((n) => n > median).length;
    expect(quieter + busier + tied).toBe(counts.length);
    // Whichever side won, its share is that side's strict count and never includes the ties.
    const expected = Math.max(quieter, busier) / counts.length;
    expect(rank.share).toBeCloseTo(expected, 10);
  });

  it("refuses a day that has not finished", () => {
    /*
     * The failure this exists to prevent: a partial day compared against whole ones reads as quiet by
     * construction, so the line would announce "quieter than 94% of days" every morning and be lying
     * about the earth while being true about the numbers.
     */
    expect(rankDay(4, false)).toBeNull();
    expect(rankDay(400, false)).toBeNull();
  });

  it("refuses a count that is not one", () => {
    expect(rankDay(Number.NaN, true)).toBeNull();
    expect(rankDay(-1, true)).toBeNull();
  });

  it("puts a day busier than anything on record at the top without exceeding it", () => {
    const rank = rankDay(counts[counts.length - 1]! + 1000, true)!;
    expect(rank.direction).toBe("busier");
    // Every day was quieter, and a share is still a share.
    expect(rank.share).toBe(1);
  });

  it("keeps the threshold it promises, since the sentence prints it", () => {
    expect(BASELINE_MIN_MAGNITUDE).toBe(4.5);
  });
});

describe("printing the share", () => {
  it("never rounds into a claim the table does not support", () => {
    /*
     * The bug this exists to prevent, caught on screen: five events reported as "quieter than 100% of
     * the 1,826 days", when the quietest day on record had three. The share was 99.945% and rounding
     * turned a true number into a false sentence.
     */
    expect(sharePercent(0.99945)).toBe(99);
    expect(sharePercent(0.00041)).toBe(1);
  });

  it("keeps 100 and 0 for the cases that really are every day and no day", () => {
    expect(sharePercent(1)).toBe(100);
    expect(sharePercent(0)).toBe(0);
  });

  it("rounds normally in between", () => {
    expect(sharePercent(0.712)).toBe(71);
    expect(sharePercent(0.715)).toBe(72);
    expect(sharePercent(0.5)).toBe(50);
  });
});
