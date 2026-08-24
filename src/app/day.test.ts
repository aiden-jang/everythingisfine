import { describe, expect, it } from "vitest";
import { DAY_LENGTH, hasEnded, isArchivableDay, isRealDay, typedDay } from "./day";

describe("a day the archive can draw", () => {
  it("takes the format this app prints and refuses the ones it does not", () => {
    expect(isRealDay("2011-03-11")).toBe(true);
    expect(isRealDay("04-07-2026")).toBe(false);
    expect(isRealDay("2026-7-4")).toBe(false);
    expect(isRealDay("yesterday")).toBe(false);
    expect(isRealDay("")).toBe(false);
  });

  it("refuses a date that does not exist, which Date.parse rolls forward instead", () => {
    // Without the round-trip these become 3 March and 1 January of the next year.
    expect(isRealDay("2026-02-31")).toBe(false);
    expect(isRealDay("2026-13-01")).toBe(false);
    // A real leap day, which a naive month-length table gets wrong.
    expect(isRealDay("2024-02-29")).toBe(true);
    expect(isRealDay("2026-02-29")).toBe(false);
  });

  it("waits for the day to finish rather than for it to start", () => {
    const now = Date.parse("2026-08-24T09:00:00Z");
    // Today is under way, and the banner would claim "all day UTC" about it.
    expect(hasEnded("2026-08-24", now)).toBe(false);
    expect(hasEnded("2026-08-23", now)).toBe(true);
    // The boundary itself: the moment the day is over, not a second before.
    expect(hasEnded("2026-08-23", Date.parse("2026-08-24T00:00:00Z"))).toBe(true);
    expect(hasEnded("2026-08-23", Date.parse("2026-08-23T23:59:59Z"))).toBe(false);
    expect(hasEnded("2027-01-01", now)).toBe(false);
  });

  it("puts both halves behind one question, which is the point of the module", () => {
    const now = Date.parse("2026-08-24T09:00:00Z");
    expect(isArchivableDay("1960-05-22", now)).toBe(true);
    expect(isArchivableDay("2026-08-24", now)).toBe(false);
    expect(isArchivableDay("2026-02-31", now)).toBe(false);
  });

  it("formats as far as the digits go, and lets backspace through the hyphens", () => {
    expect(typedDay("")).toBe("");
    expect(typedDay("2")).toBe("2");
    expect(typedDay("2011")).toBe("2011");
    expect(typedDay("20110")).toBe("2011-0");
    expect(typedDay("201103")).toBe("2011-03");
    expect(typedDay("20110311")).toBe("2011-03-11");
    // Pasting the app's own format back in must not double the punctuation.
    expect(typedDay("2011-03-11")).toBe("2011-03-11");
    // Deleting into a hyphen takes the digit before it rather than stalling.
    expect(typedDay("2011-")).toBe("2011");
    expect(typedDay("2011-03-")).toBe("2011-03");
    // Nothing past a whole day, however much is pasted.
    expect(typedDay("2011-03-11T00:00:00Z")).toBe("2011-03-11");
    expect(typedDay("999999999999")).toBe("9999-99-99");
    expect(DAY_LENGTH).toBe(10);
  });
});
