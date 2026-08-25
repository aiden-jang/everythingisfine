import { describe, expect, it } from "vitest";
import { energyOf } from "./histogram";
import { REFERENCE, timesLabel, versusReference } from "./versus";

describe("today against the largest ever recorded", () => {
  it("uses Valdivia, which is what the list is sorted to put first", () => {
    expect(REFERENCE.day).toBe("1960-05-22");
    expect(REFERENCE.magnitude).toBe(9.5);
  });

  it("divides the reference event by the window", () => {
    // A window holding one M6.5 against a M9.5: three magnitudes is 10^4.5 of energy.
    const v = versusReference(energyOf(6.5))!;
    expect(v.exceeded).toBe(false);
    expect(v.times).toBeCloseTo(10 ** (1.5 * 3), 0);
  });

  it("turns the sentence round rather than printing a fraction", () => {
    /*
     * A window can out-grow one event: two M9.5s in the same day would do it, and so would a single
     * larger one if the instruments ever record it. "0.5 times" is not a sentence anybody reads.
     */
    const v = versusReference(energyOf(9.5) * 4)!;
    expect(v.exceeded).toBe(true);
    expect(v.times).toBeCloseTo(4, 6);
  });

  it("says nothing about an empty window", () => {
    // Not infinity. An absent ratio is not a large one.
    expect(versusReference(0)).toBeNull();
    expect(versusReference(-1)).toBeNull();
    expect(versusReference(Number.NaN)).toBeNull();
  });
});

describe("printing the multiplier", () => {
  it("keeps only the precision a one-decimal magnitude supports", () => {
    // A tenth of a magnitude is already 41% of the energy, so a third significant figure is noise.
    expect(timesLabel(41_687)).toBe("42,000");
    expect(timesLabel(178_432)).toBe("178,000");
    expect(timesLabel(1_042)).toBe("1,000");
    expect(timesLabel(347)).toBe("350");
    expect(timesLabel(4.27)).toBe("4.3");
  });

  it("uses the word past a million, where digits stop being read", () => {
    expect(timesLabel(2_400_000)).toBe("2.4 million");
    expect(timesLabel(48_000_000)).toBe("48 million");
  });

  it("refuses a number that is not one", () => {
    expect(timesLabel(Number.NaN)).toBe("unknown");
    expect(timesLabel(0)).toBe("unknown");
  });
});
