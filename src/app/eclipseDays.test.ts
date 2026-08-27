import { describe, expect, it } from "vitest";
import { ECLIPSE_DAYS, eclipseMoment } from "./eclipseDays";
import { lunarEclipse, solarEclipse } from "../geo/eclipse";

describe("the eclipse list", () => {
  /*
   * The point of this file: every row is checked against the same geometry the globe draws with.
   *
   * These dates and minutes were written from memory, and a wrong one fails silently in the app - the day
   * loads, the cursor moves, and there is simply no shadow. So the table is not trusted. If a row does not
   * produce a shadow at its stated minute, either the minute is wrong or the model cannot see that
   * eclipse, and both are reasons not to offer the row.
   */
  it("has a shadow at every minute it claims", () => {
    for (const entry of ECLIPSE_DAYS) {
      const at = eclipseMoment(entry);
      expect(Number.isFinite(at), `${entry.day} is not a date`).toBe(true);
      if (entry.kind === "solar") {
        expect(solarEclipse(at).touching, `${entry.day} ${entry.at} solar`).toBe(true);
      } else {
        expect(lunarEclipse(at).umbral, `${entry.day} ${entry.at} lunar`).toBeGreaterThan(0);
      }
    }
  });

  it("says annular only when the umbra really closed short", () => {
    // The word in `what` has to agree with the arithmetic, or the row describes a different eclipse.
    for (const entry of ECLIPSE_DAYS) {
      if (entry.kind !== "solar") continue;
      const annular = /annular/i.test(entry.what);
      expect(solarEclipse(eclipseMoment(entry)).umbra < 0, `${entry.day} ${entry.what}`).toBe(annular);
    }
  });

  it("is short, sorted newest first, and free of duplicates", () => {
    expect(ECLIPSE_DAYS.length).toBeGreaterThan(3);
    expect(ECLIPSE_DAYS.length).toBeLessThanOrEqual(10);
    const days = ECLIPSE_DAYS.map((e) => e.day);
    expect(new Set(days).size).toBe(days.length);
    expect([...days]).toEqual([...days].sort().reverse());
  });

  it("only offers days the archive can actually reach", () => {
    // Nothing in the future, and nothing before the catalogue the archive queries.
    for (const entry of ECLIPSE_DAYS) {
      expect(eclipseMoment(entry), entry.day).toBeLessThan(Date.now());
      expect(entry.day > "2000-01-01", entry.day).toBe(true);
    }
  });
});
