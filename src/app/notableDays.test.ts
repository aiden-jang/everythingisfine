import { describe, expect, it } from "vitest";
import { NOTABLE_DAYS, NOTABLE_NOTE, notableDay } from "./notableDays";

describe("the days worth seeing", () => {
  it("offers a handful, not a catalogue", () => {
    // A curated list stops being a way in once it needs its own search.
    expect(NOTABLE_DAYS.length).toBeGreaterThan(3);
    // A ceiling to argue against rather than a limit: past this it needs its own search and stops
    // being a way in.
    expect(NOTABLE_DAYS.length).toBeLessThan(16);
  });

  it("names real past UTC days, each one only once", () => {
    const seen = new Set<string>();
    for (const d of NOTABLE_DAYS) {
      expect(d.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const at = Date.parse(`${d.day}T00:00:00Z`);
      expect(Number.isFinite(at)).toBe(true);
      // Round-trips, so 2023-02-30 cannot hide as a real date.
      expect(new Date(at).toISOString().slice(0, 10)).toBe(d.day);
      expect(at).toBeLessThan(Date.now());
      expect(seen.has(d.day)).toBe(false);
      seen.add(d.day);
    }
  });

  it("is ordered largest first, which is the reason to open it", () => {
    const mags = NOTABLE_DAYS.map((d) => d.magnitude);
    expect([...mags].sort((a, b) => b - a)).toEqual(mags);
  });

  it("claims magnitudes a catalogue could actually hold", () => {
    for (const d of NOTABLE_DAYS) {
      expect(d.magnitude).toBeGreaterThanOrEqual(6);
      expect(d.magnitude).toBeLessThanOrEqual(9.5);
      expect(d.what.length).toBeGreaterThan(3);
    }
  });

  it("resolves only its own days", () => {
    expect(notableDay("2011-03-11")?.what).toBe("Tōhoku, Japan");
    expect(notableDay("2026-05-15")).toBeNull();
    expect(notableDay("nonsense")).toBeNull();
  });

  it("dates a famous local day by its UTC one", () => {
    /*
     * Loma Prieta is remembered as 17 October 1989 and is catalogued at 00:04 UTC on the 18th: asking for
     * the 17th returns an M6.3 in Papua New Guinea, and asking for the 18th returns 292 events under
     * USGS's own name for it. Both pinned, because the wrong one is the one memory reaches for.
     */
    expect(NOTABLE_DAYS.some((d) => d.day === "1989-10-17")).toBe(false);
    expect(notableDay("1989-10-18")?.what).toBe("Loma Prieta, California");
    // Good Friday 1964 is the same trap: 27 March locally, 03:36 UTC on the 28th.
    expect(NOTABLE_DAYS.some((d) => d.day === "1964-03-27")).toBe(false);
    expect(notableDay("1964-03-28")?.what).toContain("Prince William Sound");
  });

  it("carries the sentence that keeps a sparse old day from reading as a quiet one", () => {
    expect(NOTABLE_NOTE).toMatch(/networks were smaller/);
    // The two days that need it are on the list, or the sentence is answering nothing.
    expect(NOTABLE_DAYS.some((d) => d.day.startsWith("1960"))).toBe(true);
  });
});
